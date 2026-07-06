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
}

// Dns resolves A, AAAA, CNAME, MX, NS, and TXT records in parallel. Each
// record-type lookup records its own timing. The response includes the actual
// DNS server address that resolved the queries.
func Dns(ctx context.Context, host string) (*DnsResponse, error) {
	log.Info().Str("host", host).Msg("DNS check: starting parallel lookups")

	// Build a resolver that captures the DNS server address it dials.
	var resolverAddr string
	var addrMu sync.Mutex

	resolver := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			addrMu.Lock()
			if resolverAddr == "" {
				resolverAddr = address
			}
			addrMu.Unlock()
			log.Info().Str("host", host).Str("dns_server", address).Msg("DNS check: dialing resolver")
			return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, address)
		},
	}

	// Also read configured nameservers from /etc/resolv.conf
	configNS := readResolvConfNameservers()
	if len(configNS) > 0 {
		log.Info().Str("host", host).Strs("configured_nameservers", configNS).Msg("DNS check: nameservers from resolv.conf")
	}

	var wg sync.WaitGroup
	results := make(chan dnsRecordResult, 5)

	// A/AAAA records
	wg.Add(1)
	go func() {
		defer wg.Done()
		start := time.Now().UTC().UnixMilli()
		log.Info().Str("host", host).Msg("DNS check: A/AAAA lookup started")
		ips, err := resolver.LookupIP(ctx, "ip", host)
		done := time.Now().UTC().UnixMilli()

		var a, aaaa []string
		if err == nil {
			for _, ip := range ips {
				if ip.To4() != nil {
					a = append(a, ip.String())
				} else {
					aaaa = append(aaaa, ip.String())
				}
			}
			log.Info().Str("host", host).Int("a_count", len(a)).Int("aaaa_count", len(aaaa)).Int64("latency_ms", done-start).Msg("DNS check: A/AAAA resolved")
		} else {
			log.Error().Str("host", host).Err(err).Int64("latency_ms", done-start).Msg("DNS check: A/AAAA lookup failed")
		}
		results <- dnsRecordResult{a: a, aaaa: aaaa, err: err, label: "A/AAAA", start: start, done: done}
	}()

	// CNAME
	wg.Add(1)
	go func() {
		defer wg.Done()
		start := time.Now().UTC().UnixMilli()
		log.Info().Str("host", host).Msg("DNS check: CNAME lookup started")
		cname, err := resolver.LookupCNAME(ctx, host)
		done := time.Now().UTC().UnixMilli()
		if err != nil {
			log.Error().Str("host", host).Err(err).Int64("latency_ms", done-start).Msg("DNS check: CNAME lookup failed")
		} else {
			log.Info().Str("host", host).Str("cname", cname).Int64("latency_ms", done-start).Msg("DNS check: CNAME resolved")
		}
		results <- dnsRecordResult{cname: cname, err: err, label: "CNAME", start: start, done: done}
	}()

	// MX
	wg.Add(1)
	go func() {
		defer wg.Done()
		start := time.Now().UTC().UnixMilli()
		log.Info().Str("host", host).Msg("DNS check: MX lookup started")
		mxRecords, err := resolver.LookupMX(ctx, host)
		done := time.Now().UTC().UnixMilli()
		var mx []string
		if err == nil {
			for _, r := range mxRecords {
				mx = append(mx, fmt.Sprintf("%s:%d", r.Host, r.Pref))
			}
			log.Info().Str("host", host).Int("mx_count", len(mx)).Int64("latency_ms", done-start).Msg("DNS check: MX resolved")
		} else {
			log.Error().Str("host", host).Err(err).Int64("latency_ms", done-start).Msg("DNS check: MX lookup failed")
		}
		results <- dnsRecordResult{mx: mx, err: err, label: "MX", start: start, done: done}
	}()

	// NS
	wg.Add(1)
	go func() {
		defer wg.Done()
		start := time.Now().UTC().UnixMilli()
		log.Info().Str("host", host).Msg("DNS check: NS lookup started")
		var ns []string
		err := fmt.Errorf("skipped: subdomain")
		if !isSubdomain(host) {
			nsRecords, nsErr := resolver.LookupNS(ctx, host)
			err = nsErr
			if nsErr == nil {
				for _, r := range nsRecords {
					ns = append(ns, r.Host)
				}
				log.Info().Str("host", host).Int("ns_count", len(ns)).Int64("latency_ms", time.Now().UTC().UnixMilli()-start).Msg("DNS check: NS resolved")
			} else {
				log.Error().Str("host", host).Err(nsErr).Int64("latency_ms", time.Now().UTC().UnixMilli()-start).Msg("DNS check: NS lookup failed")
			}
		} else {
			log.Info().Str("host", host).Msg("DNS check: NS skipped (subdomain)")
		}
		done := time.Now().UTC().UnixMilli()
		results <- dnsRecordResult{ns: ns, err: err, label: "NS", start: start, done: done}
	}()

	// TXT
	wg.Add(1)
	go func() {
		defer wg.Done()
		start := time.Now().UTC().UnixMilli()
		log.Info().Str("host", host).Msg("DNS check: TXT lookup started")
		txtRecords, err := resolver.LookupTXT(ctx, host)
		done := time.Now().UTC().UnixMilli()
		var txt []string
		if err == nil {
			txt = txtRecords
			log.Info().Str("host", host).Int("txt_count", len(txt)).Int64("latency_ms", done-start).Msg("DNS check: TXT resolved")
		} else {
			log.Error().Str("host", host).Err(err).Int64("latency_ms", done-start).Msg("DNS check: TXT lookup failed")
		}
		results <- dnsRecordResult{txt: txt, err: err, label: "TXT", start: start, done: done}
	}()

	// Wait for all goroutines and close the channel
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	response := &DnsResponse{}
	var earliestStart int64 = 1<<63 - 1
	var latestDone int64

	for r := range results {
		if r.start < earliestStart {
			earliestStart = r.start
		}
		if r.done > latestDone {
			latestDone = r.done
		}

		switch r.label {
		case "A/AAAA":
			response.A = r.a
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
		DnsStart: earliestStart,
		DnsDone:  latestDone,
	}
	response.Resolver = resolverAddr

	// If the custom resolver didn't dial (e.g., cached), fall back to configured NS
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
		Msg("DNS check: complete")

	return response, nil
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
