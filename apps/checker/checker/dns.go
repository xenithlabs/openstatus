package checker

import (
	"context"
	"fmt"
	"net"
	"strings"

	"github.com/rs/zerolog/log"
)


type DnsResponse struct {
	A     []string `json:"a,omitempty"`
	AAAA  []string `json:"aaaa,omitempty"`
	CNAME string   `json:"cname,omitempty"`
	MX    []string `json:"mx,omitempty"`
	NS  []string `json:"ns,omitempty"`
	TXT []string `json:"txt,omitempty"`
}

func Dns(ctx context.Context, host string) (*DnsResponse, error) {
	log.Info().Str("host", host).Msg("DNS check: starting")

	log.Info().Str("host", host).Msg("DNS check: looking up A/AAAA records")
	ips, err := net.LookupIP(host)
	if err != nil {
		log.Error().Str("host", host).Err(err).Msg("DNS check: A/AAAA lookup failed")
		return nil, fmt.Errorf("failed to lookup IPs: %w", err)
	}

	A := []string{}
	AAAA := []string{}

	for _, ip := range ips {
		if ip.To4() != nil {
			A = append(A, ip.String())
		} else {
			AAAA = append(AAAA, ip.String())
		}
	}
	log.Info().Str("host", host).Int("a_count", len(A)).Int("aaaa_count", len(AAAA)).Msg("DNS check: A/AAAA resolved")

	log.Info().Str("host", host).Msg("DNS check: looking up CNAME")
	CNAME, err := lookupCNAME(host)
	if err != nil {
		log.Error().Str("host", host).Err(err).Msg("DNS check: CNAME lookup failed")
		return nil, fmt.Errorf("failed to lookup CNAME record: %w", err)
	}
	log.Info().Str("host", host).Str("cname", CNAME).Msg("DNS check: CNAME resolved")

	log.Info().Str("host", host).Msg("DNS check: looking up MX records")
	MXRecords := lookupMX(host)
	log.Info().Str("host", host).Int("mx_count", len(MXRecords)).Msg("DNS check: MX resolved")

	log.Info().Str("host", host).Msg("DNS check: looking up NS records")
	NS, err := lookupNS(host)
	if err != nil {
		log.Error().Str("host", host).Err(err).Msg("DNS check: NS lookup failed")
		return nil, fmt.Errorf("failed to lookup NS record: %w", err)
	}
	log.Info().Str("host", host).Int("ns_count", len(NS)).Msg("DNS check: NS resolved")

	log.Info().Str("host", host).Msg("DNS check: looking up TXT records")
	TXT := lookupTXT(host)
	log.Info().Str("host", host).Int("txt_count", len(TXT)).Msg("DNS check: TXT resolved")


	response := &DnsResponse{
		A:     A,
		AAAA:  AAAA,
		CNAME: CNAME,
		MX:    MXRecords,
		NS:    NS,
		TXT:   TXT,
	}

	log.Info().Str("host", host).
		Int("a", len(A)).Int("aaaa", len(AAAA)).
		Str("cname", CNAME).Int("mx", len(MXRecords)).
		Int("ns", len(NS)).Int("txt", len(TXT)).
		Msg("DNS check: complete")

	return response, nil
}



func lookupCNAME(domain string) (string, error) {
	cname, err := net.LookupCNAME(domain)
	if err != nil {
		return "", err
	}

	return cname, nil
}

func lookupMX(domain string) ([]string) {
	mx := []string{}
	mxRecords,_ := net.LookupMX(domain)


	for _, r := range mxRecords {
		mx = append(mx, fmt.Sprintf("%s:%d", r.Host, r.Pref))
	}
	return mx
}

func lookupNS(domain string) ([]string, error) {

	hosts := []string{}
	isSubdomain := isSubdomain(domain)
	if isSubdomain {
		return hosts, nil
	}
	nsRecords, err := net.LookupNS(domain)
	if err != nil {
		return nil, err
	}

	for _, ns := range nsRecords {
		hosts = append(hosts, ns.Host)
	}
	return hosts, nil
}

func lookupTXT(domain string) ([]string) {
	records := []string{}
	txtRecords, err := net.LookupTXT(domain)
	if err != nil {
		return nil
	}

	for _, txt := range txtRecords {
		records = append(records, txt)
	}
	return records
}


func isSubdomain(domain string) bool {
	parent := strings.Split(domain, ".")
	if len(parent) < 3 {
		return false
	}
	return true
}
