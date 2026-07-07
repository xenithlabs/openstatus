package checker

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/miekg/dns"
	"github.com/rs/zerolog/log"
)

type DnsResponse struct {
	A     []string `json:"a,omitempty"`
	AAAA  []string `json:"aaaa,omitempty"`
	CNAME string   `json:"cname,omitempty"`
	MX    []string `json:"mx,omitempty"`
	NS    []string `json:"ns,omitempty"`
	TXT   []string `json:"txt,omitempty"`

	Timing   Timing `json:"timing"`
	Resolver string `json:"resolver"`
}

// dnsRecordResult holds the result of a single DNS record type lookup.
type dnsRecordResult struct {
	a     []string
	aaaa  []string
	cname string
	mx    []string
	ns    []string
	txt   []string
	err   error
	label string
	start int64
	done  int64

	queryPhase DnsQueryPhase
}

// Dns resolves A, AAAA, CNAME, MX, NS, and TXT records in parallel using raw
// UDP DNS queries. Each record type gets a dedicated UDP socket and captures
// per-packet timing: query construction → socket write → socket read → parse.
func Dns(ctx context.Context, host string) (*DnsResponse, error) {
	log.Info().Str("host", host).Msg("DNS check: starting parallel UDP lookups")

	configNS := readResolvConfNameservers()
	if len(configNS) > 0 {
		log.Info().Str("host", host).Strs("configured_nameservers", configNS).Msg("DNS check: nameservers from resolv.conf")
	}

	// Pick the first nameserver. Fall back to system default if none found.
	var server string
	if len(configNS) > 0 {
		server = net.JoinHostPort(configNS[0], "53")
	} else {
		log.Warn().Str("host", host).Msg("DNS check: no nameservers in resolv.conf, using system default")
		server = "system"
	}

	var wg sync.WaitGroup
	results := make(chan dnsRecordResult, 6)

	// A records
	wg.Add(1)
	go func() {
		defer wg.Done()
		results <- dnsLookupWithTiming(ctx, host, dns.TypeA, "A", server)
	}()

	// AAAA records
	wg.Add(1)
	go func() {
		defer wg.Done()
		results <- dnsLookupWithTiming(ctx, host, dns.TypeAAAA, "AAAA", server)
	}()

	// CNAME
	wg.Add(1)
	go func() {
		defer wg.Done()
		results <- dnsLookupWithTiming(ctx, host, dns.TypeCNAME, "CNAME", server)
	}()

	// MX
	wg.Add(1)
	go func() {
		defer wg.Done()
		results <- dnsLookupWithTiming(ctx, host, dns.TypeMX, "MX", server)
	}()

	// NS — skip for subdomains
	wg.Add(1)
	go func() {
		defer wg.Done()
		if isSubdomain(host) {
			log.Info().Str("host", host).Msg("DNS check: NS skipped (subdomain)")
			results <- dnsRecordResult{
				ns: nil, err: fmt.Errorf("skipped: subdomain"),
				label: "NS", start: time.Now().UTC().UnixMilli(), done: time.Now().UTC().UnixMilli(),
			}
			return
		}
		results <- dnsLookupWithTiming(ctx, host, dns.TypeNS, "NS", server)
	}()

	// TXT
	wg.Add(1)
	go func() {
		defer wg.Done()
		results <- dnsLookupWithTiming(ctx, host, dns.TypeTXT, "TXT", server)
	}()

	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	response := &DnsResponse{}
	var earliestStart int64 = 1<<63 - 1
	var latestDone int64
	var queries []DnsQueryPhase
	var resolverAddr string

	for r := range results {
		if r.start < earliestStart {
			earliestStart = r.start
		}
		if r.done > latestDone {
			latestDone = r.done
		}
		if r.queryPhase.Resolver != "" && resolverAddr == "" {
			resolverAddr = r.queryPhase.Resolver
		}
		if r.queryPhase.RecordType != "" {
			queries = append(queries, r.queryPhase)
		}

		switch r.label {
		case "A":
			response.A = r.a
		case "AAAA":
			response.AAAA = r.aaaa
		case "CNAME":
			response.CNAME = r.cname
		case "MX":
			response.MX = r.mx
		case "NS":
			response.NS = r.ns
		case "TXT":
			response.TXT = r.txt
		}
	}

	response.Timing = Timing{
		DnsStart:   earliestStart,
		DnsDone:    latestDone,
		DnsQueries: queries,
	}
	response.Resolver = resolverAddr
	response.Timing.Resolver = response.Resolver

	if response.Resolver == "" && len(configNS) > 0 {
		response.Resolver = configNS[0]
	}
	if response.Resolver == "" {
		response.Resolver = "system"
	}

	log.Info().Str("host", host).Str("resolver", response.Resolver).
		Int("a", len(response.A)).Int("aaaa", len(response.AAAA)).
		Str("cname", response.CNAME).Int("mx", len(response.MX)).
		Int("ns", len(response.NS)).Int("txt", len(response.TXT)).
		Int64("total_latency_ms", latestDone-earliestStart).
		Int("query_count", len(queries)).
		Msg("DNS check: complete")

	return response, nil
}

// dnsLookupWithTiming performs a raw UDP DNS query for a single record type
// and captures per-packet timing.
func dnsLookupWithTiming(ctx context.Context, host string, qtype uint16, label string, server string) dnsRecordResult {
	start := time.Now().UTC().UnixMilli()
	log.Info().Str("host", host).Str("type", label).Str("server", server).Msg("DNS check: query started")

	r := dnsRecordResult{label: label, start: start}

	// If no explicit server, we can't do raw UDP — return empty
	if server == "system" || server == "" {
		r.done = time.Now().UTC().UnixMilli()
		r.err = fmt.Errorf("no resolver configured")
		r.queryPhase = DnsQueryPhase{RecordType: label, QueryStart: start, SentAt: start, RecvAt: start, QueryDone: r.done, Resolver: "system"}
		return r
	}

	// Build query
	m := new(dns.Msg)
	m.SetQuestion(dns.Fqdn(host), qtype)
	m.RecursionDesired = true
	m.SetEdns0(1232, false)

	queryStart := time.Now().UTC().UnixMilli()

	// Resolve server address (may be "host:port" or just "host")
	if _, _, err := net.SplitHostPort(server); err != nil {
		server = net.JoinHostPort(server, "53")
	}

	conn, err := net.DialTimeout("udp", server, 10*time.Second)
	if err != nil {
		r.done = time.Now().UTC().UnixMilli()
		r.err = fmt.Errorf("dial resolver %s: %w", server, err)
		log.Error().Str("host", host).Str("type", label).Str("server", server).Err(err).Msg("DNS check: dial failed")
		r.queryPhase = DnsQueryPhase{RecordType: label, QueryStart: queryStart, SentAt: queryStart, RecvAt: queryStart, QueryDone: r.done, Resolver: server}
		return r
	}
	defer conn.Close()

	wire, err := m.Pack()
	if err != nil {
		r.done = time.Now().UTC().UnixMilli()
		r.err = fmt.Errorf("pack query: %w", err)
		r.queryPhase = DnsQueryPhase{RecordType: label, QueryStart: queryStart, SentAt: queryStart, RecvAt: queryStart, QueryDone: r.done, Resolver: server}
		return r
	}

	// Send
	conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if _, err := conn.Write(wire); err != nil {
		r.done = time.Now().UTC().UnixMilli()
		r.err = fmt.Errorf("send query: %w", err)
		log.Error().Str("host", host).Str("type", label).Str("server", server).Err(err).Msg("DNS check: send failed")
		r.queryPhase = DnsQueryPhase{RecordType: label, QueryStart: queryStart, SentAt: queryStart, RecvAt: queryStart, QueryDone: r.done, Resolver: server}
		return r
	}
	sentAt := time.Now().UTC().UnixMilli()

	// Receive
	buf := make([]byte, 1232)
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	n, err := conn.Read(buf)
	recvAt := time.Now().UTC().UnixMilli()
	if err != nil {
		r.done = recvAt
		r.err = fmt.Errorf("recv response: %w", err)
		log.Error().Str("host", host).Str("type", label).Str("server", server).Err(err).Int64("send_ms", sentAt-queryStart).Msg("DNS check: recv failed")
		r.queryPhase = DnsQueryPhase{RecordType: label, QueryStart: queryStart, SentAt: sentAt, RecvAt: recvAt, QueryDone: recvAt, Resolver: server}
		return r
	}

	// Parse
	resp := new(dns.Msg)
	if err := resp.Unpack(buf[:n]); err != nil {
		r.done = time.Now().UTC().UnixMilli()
		r.err = fmt.Errorf("unpack response: %w", err)
		r.queryPhase = DnsQueryPhase{RecordType: label, QueryStart: queryStart, SentAt: sentAt, RecvAt: recvAt, QueryDone: r.done, Resolver: server}
		return r
	}
	queryDone := time.Now().UTC().UnixMilli()

	// Extract records
	switch qtype {
	case dns.TypeA:
		for _, ans := range resp.Answer {
			if a, ok := ans.(*dns.A); ok {
				r.a = append(r.a, a.A.String())
			}
		}
	case dns.TypeAAAA:
		for _, ans := range resp.Answer {
			if aaaa, ok := ans.(*dns.AAAA); ok {
				r.aaaa = append(r.aaaa, aaaa.AAAA.String())
			}
		}
	case dns.TypeCNAME:
		for _, ans := range resp.Answer {
			if cname, ok := ans.(*dns.CNAME); ok {
				r.cname = cname.Target
				break
			}
		}
	case dns.TypeMX:
		for _, ans := range resp.Answer {
			if mx, ok := ans.(*dns.MX); ok {
				r.mx = append(r.mx, fmt.Sprintf("%s:%d", mx.Mx, mx.Preference))
			}
		}
	case dns.TypeNS:
		for _, ans := range resp.Answer {
			if ns, ok := ans.(*dns.NS); ok {
				r.ns = append(r.ns, ns.Ns)
			}
		}
	case dns.TypeTXT:
		for _, ans := range resp.Answer {
			if txt, ok := ans.(*dns.TXT); ok {
				r.txt = append(r.txt, strings.Join(txt.Txt, ""))
			}
		}
	}

	r.done = queryDone
	r.queryPhase = DnsQueryPhase{
		RecordType: label,
		QueryStart: queryStart,
		SentAt:     sentAt,
		RecvAt:     recvAt,
		QueryDone:  queryDone,
		Resolver:   server,
	}

	latency := queryDone - queryStart
	log.Info().Str("host", host).Str("type", label).Str("server", server).
		Int64("total_ms", latency).
		Int64("send_ms", sentAt-queryStart).
		Int64("network_ms", recvAt-sentAt).
		Int64("parse_ms", queryDone-recvAt).
		Msg("DNS check: query complete")

	return r
}

// readResolvConfNameservers parses /etc/resolv.conf and returns the configured
// nameserver addresses.
func readResolvConfNameservers() []string {
	f, err := os.Open("/etc/resolv.conf")
	if err != nil {
		return nil
	}
	defer f.Close()

	var ns []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "nameserver") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				ns = append(ns, parts[1])
			}
		}
	}
	return ns
}

// isSubdomain returns true if the domain has 3+ dot-separated parts.
func isSubdomain(domain string) bool {
	return len(strings.Split(domain, ".")) >= 3
}
