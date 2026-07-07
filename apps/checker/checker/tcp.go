package checker

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/miekg/dns"
	"github.com/rs/zerolog/log"
)

type TCPResponse struct {
	State      string `json:"state"`
	Type       string `json:"type"`
	Region     string `json:"region"`
	JobType    string `json:"jobType"`
	Latency    int64  `json:"latency"`
	Timestamp  int64  `json:"timestamp"`
	Timing     Timing `json:"timing"`
	ResolvedIP string `json:"resolvedIp"`
	Error      uint8  `json:"error,omitempty"`
}

// PingTCP performs a TCP connectivity check with DNS resolution timing.
// If the target is a hostname (not an IP), it resolves the host first and
// records DNS timing. The connected remote IP and DNS resolver address are
// included in the response.
func PingTCP(timeoutSec int, target string) (*TCPResponse, error) {
	host, port, err := net.SplitHostPort(target)
	if err != nil {
		log.Error().Str("target", target).Err(err).Msg("TCP check: invalid host:port")
		return nil, fmt.Errorf("invalid target %q: %w", target, err)
	}

	timeout := time.Duration(timeoutSec) * time.Second

	var timing Timing
	var resolvedIP string
	var resolverAddr string

	// Resolve hostname to IP(s) if the target is not already an IP
	if ip := net.ParseIP(host); ip != nil {
		// Target is already an IP — no DNS needed
		resolvedIP = ip.String()
		log.Info().Str("host", host).Str("ip", resolvedIP).Int("port", mustAtoi(port)).Str("timeout", timeout.String()).Msg("TCP check: target is already an IP, skipping DNS")
		timing.DnsStart = time.Now().UTC().UnixMilli()
		timing.DnsDone = timing.DnsStart
		timing.Resolver = "" // no DNS resolution needed for IP targets
	} else {
		log.Info().Str("host", host).Int("port", mustAtoi(port)).Str("timeout", timeout.String()).Msg("TCP check: resolving hostname")

		configNS := readResolvConfNameservers()
		var server string
		if len(configNS) > 0 {
			server = net.JoinHostPort(configNS[0], "53")
		} else {
			server = "system"
		}

		dnsStart := time.Now().UTC().UnixMilli()

		// Raw UDP A-record query with per-packet timing
		m := new(dns.Msg)
		m.SetQuestion(dns.Fqdn(host), dns.TypeA)
		m.RecursionDesired = true
		m.SetEdns0(1232, false)

		wire, packErr := m.Pack()
		var ips []string
		dnsDone := time.Now().UTC().UnixMilli()

		if packErr == nil && server != "system" {
			conn, dialErr := net.DialTimeout("udp", server, 10*time.Second)
			if dialErr == nil {
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				conn.Write(wire)
				buf := make([]byte, 1232)
				conn.SetReadDeadline(time.Now().Add(10 * time.Second))
				n, readErr := conn.Read(buf)
				conn.Close()
				if readErr == nil {
					resp := new(dns.Msg)
					if unpackErr := resp.Unpack(buf[:n]); unpackErr == nil {
						for _, ans := range resp.Answer {
							if a, ok := ans.(*dns.A); ok {
								ips = append(ips, a.A.String())
							}
						}
					}
				}
			}
		}
		dnsDone = time.Now().UTC().UnixMilli()
		timing.DnsStart = dnsStart
		timing.DnsDone = dnsDone
		dnsLatency := dnsDone - dnsStart

		if len(ips) == 0 {
			log.Error().Str("host", host).Int64("dns_latency_ms", dnsLatency).Msg("TCP check: DNS resolution failed")
			return nil, fmt.Errorf("DNS resolution failed for %q: no A records", host)
		}

		resolverAddr = server
		timing.Resolver = resolverAddr

		log.Info().Str("host", host).Strs("resolved_ips", ips).Str("resolver", resolverAddr).Int64("dns_latency_ms", dnsLatency).Msg("TCP check: DNS resolved")
		resolvedIP = ips[0] // use first resolved IP as representative
	}

	// TCP connect
	log.Info().Str("host", host).Str("ip", resolvedIP).Int("port", mustAtoi(port)).Msg("TCP check: dialing")
	connectStart := time.Now().UTC().UnixMilli()
	conn, dialErr := net.DialTimeout("tcp", net.JoinHostPort(resolvedIP, port), timeout)
	connectDone := time.Now().UTC().UnixMilli()
	timing.ConnectStart = connectStart
	timing.ConnectDone = connectDone
	connectLatency := connectDone - connectStart

	if dialErr != nil {
		if e, ok := dialErr.(net.Error); ok && e.Timeout() {
			log.Warn().Str("host", host).Str("ip", resolvedIP).Int("port", mustAtoi(port)).Int64("connect_latency_ms", connectLatency).Int64("dns_latency_ms", timing.DnsDone-timing.DnsStart).Msg("TCP check: connection timed out")
			return nil, fmt.Errorf("timeout connecting to %s:%s after %s", host, port, timeout)
		}
		if strings.Contains(dialErr.Error(), "connection refused") {
			log.Warn().Str("host", host).Str("ip", resolvedIP).Int("port", mustAtoi(port)).Int64("connect_latency_ms", connectLatency).Msg("TCP check: connection refused")
			return nil, fmt.Errorf("connection refused to %s:%s", host, port)
		}
		log.Error().Str("host", host).Str("ip", resolvedIP).Int("port", mustAtoi(port)).Err(dialErr).Int64("connect_latency_ms", connectLatency).Msg("TCP check: dial failed")
		return nil, fmt.Errorf("dial error to %s:%s: %w", host, port, dialErr)
	}
	defer conn.Close()

	// Extract the actual remote IP from the connection
	remoteAddr := conn.RemoteAddr().String()
	if remoteHost, _, splitErr := net.SplitHostPort(remoteAddr); splitErr == nil {
		resolvedIP = remoteHost
	}

	totalLatency := timing.ConnectDone - timing.DnsStart

	log.Info().Str("host", host).Str("connected_ip", resolvedIP).Int("port", mustAtoi(port)).Int64("total_latency_ms", totalLatency).Int64("dns_latency_ms", timing.DnsDone-timing.DnsStart).Int64("connect_latency_ms", connectLatency).Msg("TCP check: complete")

	return &TCPResponse{
		State:      "success",
		Type:       "tcp",
		Latency:    totalLatency,
		Timestamp:  timing.DnsStart,
		Timing:     timing,
		ResolvedIP: resolvedIP,
		JobType:    "tcp",
	}, nil
}

func mustAtoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
