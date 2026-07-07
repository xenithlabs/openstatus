package job

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/cenkalti/backoff/v5"
	"github.com/google/uuid"
	"github.com/openstatushq/openstatus/apps/checker/checker"
	v1 "github.com/openstatushq/openstatus/apps/checker/proto/private_location/v1"
	"github.com/rs/zerolog/log"
)

type DNSPrivateRegionData struct {
	ID            string              `json:"id"`
	URI           string              `json:"uri"`
	Latency       int64               `json:"latency"`
	Timestamp     int64               `json:"timestamp"`
	CronTimestamp int64               `json:"cronTimestamp"`
	RequestStatus string              `json:"requestStatus"`
	Message       string              `json:"message"`
	Error         int                 `json:"error"`
	Timing        string              `json:"timing"`
	Records       map[string][]string `json:"records"`
	Resolver      string              `json:"resolver"`
}

func (jobRunner) DNSJob(ctx context.Context, monitor *v1.DNSMonitor) (*DNSPrivateRegionData, error) {
	log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Msg("DNS job: starting")

	retry := monitor.Retry
	if retry == 0 {
		retry = 3
	}

	var degradedAfter int64
	if monitor.DegradedAt != nil {
		degradedAfter = *monitor.DegradedAt
	}

	var called int

	op := func() (*DNSPrivateRegionData, error) {
		called++
		log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Int("attempt", called).Int("max_attempts", int(retry)).Msg("DNS job: running check")
		res, err := checker.Dns(ctx, monitor.Uri)

		id, uuidErr := uuid.NewV7()
		if uuidErr != nil {
			return nil, fmt.Errorf("failed to generate UUID: %w", uuidErr)
		}

		if err != nil {
			if called < int(retry) {
				return nil, fmt.Errorf("DNS lookup failed: %w", err)
			}
			return &DNSPrivateRegionData{
				ID:            id.String(),
				URI:           monitor.Uri,
				Latency:       0,
				Timestamp:     res.Timing.DnsStart,
				CronTimestamp: res.Timing.DnsStart,
				RequestStatus: "error",
				Error:         1,
				Message:       err.Error(),
			}, nil
		}

		latency := res.Timing.DnsDone - res.Timing.DnsStart
		timingBytes, _ := json.Marshal(res.Timing)

		records := formatDNSRecords(res)

		requestStatus := "success"
		if degradedAfter > 0 && latency > degradedAfter {
			requestStatus = "degraded"
		}

		log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Str("resolver", res.Resolver).Int64("latency_ms", latency).Str("timing", string(timingBytes)).Msg("DNS job: check successful")

		return &DNSPrivateRegionData{
			ID:            id.String(),
			URI:           monitor.Uri,
			Latency:       latency,
			Timestamp:     res.Timing.DnsStart,
			CronTimestamp: res.Timing.DnsStart,
			RequestStatus: requestStatus,
			Message:       fmt.Sprintf("DNS lookup succeeded for %s (resolver: %s)", monitor.Uri, res.Resolver),
			Timing:        string(timingBytes),
			Records:       records,
			Resolver:      res.Resolver,
		}, nil
	}

	resp, err := backoff.Retry(ctx, op,
		backoff.WithMaxTries(uint(retry)),
		backoff.WithBackOff(backoff.NewExponentialBackOff()),
	)
	if err != nil {
		log.Error().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Err(err).Int("attempts", called).Msg("DNS job: failed after retries")
		return nil, fmt.Errorf("DNS job failed after %d retries: %w", retry, err)
	}
	log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Int64("latency_ms", resp.Latency).Str("status", resp.RequestStatus).Msg("DNS job: complete")
	return resp, nil
}

func formatDNSRecords(res *checker.DnsResponse) map[string][]string {
	r := make(map[string][]string)
	r["A"] = res.A
	r["AAAA"] = res.AAAA
	r["CNAME"] = []string{res.CNAME}
	r["MX"] = res.MX
	r["NS"] = res.NS
	r["TXT"] = res.TXT
	return r
}
