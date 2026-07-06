package job

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/cenkalti/backoff/v5"
	"github.com/google/uuid"
	"github.com/openstatushq/openstatus/apps/checker/checker"
	v1 "github.com/openstatushq/openstatus/apps/checker/proto/private_location/v1"
	"github.com/rs/zerolog/log"
)

// TCPPrivateRegionData represents the result of a TCP monitor check
type TCPPrivateRegionData struct {
	ID            string `json:"id"`
	URI           string `json:"uri"`
	RequestStatus string `json:"request_status"`
	Message       string `json:"message"`
	Latency       int64  `json:"latency"`
	Timestamp     int64  `json:"timestamp"`
	CronTimestamp int64  `json:"cron_timestamp"`
	Error         int    `json:"error"`
	Timing        string `json:"timing"`
}

func (jobRunner) TCPJob(ctx context.Context, monitor *v1.TCPMonitor) (*TCPPrivateRegionData, error) {
	log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Msg("TCP job: starting")

	retry := monitor.Retry
	if retry == 0 {
		retry = 3
	}

	var degradedAfter int64
	if monitor.DegradedAt != nil {
		degradedAfter = *monitor.DegradedAt
	}

	var called int

	op := func() (*TCPPrivateRegionData, error) {
		called++
		log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Int("attempt", called).Int("max_attempts", int(retry)).Msg("TCP job: running check")
		res, err := checker.PingTCP(int(monitor.Timeout), monitor.Uri)
		if err != nil {
			if called < int(retry) {
				return nil, fmt.Errorf("TCP connection failed: %w", err)
			}
			id, uuidErr := uuid.NewV7()
			if uuidErr != nil {
				return nil, fmt.Errorf("failed to generate UUID: %w", uuidErr)
			}

			now := time.Now().UTC().UnixMilli()
			return &TCPPrivateRegionData{
				ID:            id.String(),
				Latency:       0,
				Timestamp:     now,
				CronTimestamp: now,
				URI:           monitor.Uri,
				RequestStatus: "error",
				Error:         1,
				Message:       err.Error(),
			}, nil
		}

		latency := res.Timing.ConnectDone - res.Timing.DnsStart

		requestStatus := "success"
		if degradedAfter > 0 && latency > degradedAfter {
			requestStatus = "degraded"
		}

		id, err := uuid.NewV7()
		if err != nil {
			return nil, fmt.Errorf("failed to generate UUID: %w", err)
		}
		timingBytes, err := json.Marshal(res.Timing)
		if err != nil {
			return nil, fmt.Errorf("error encoding timing: %w", err)
		}

		msg := fmt.Sprintf("Connected to %s (%s)", monitor.Uri, res.ResolvedIP)
		log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Str("ip", res.ResolvedIP).Int64("latency_ms", latency).Str("status", requestStatus).Str("timing", string(timingBytes)).Msg("TCP job: check successful")

		return &TCPPrivateRegionData{
			ID:            id.String(),
			Latency:       latency,
			Timestamp:     res.Timestamp,
			CronTimestamp: res.Timestamp,
			URI:           monitor.Uri,
			RequestStatus: requestStatus,
			Error:         0,
			Message:       msg,
			Timing:        string(timingBytes),
		}, nil
	}

	resp, err := backoff.Retry(ctx, op,
		backoff.WithMaxTries(uint(retry)),
		backoff.WithBackOff(backoff.NewExponentialBackOff()),
	)
	if err != nil {
		log.Error().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Err(err).Int("attempts", called).Msg("TCP job: failed after retries")
		return nil, fmt.Errorf("TCP job failed after %d retries: %w", retry, err)
	}
	log.Info().Str("monitor_id", monitor.Id).Str("uri", monitor.Uri).Int64("latency_ms", resp.Latency).Str("status", resp.RequestStatus).Msg("TCP job: complete")
	return resp, nil
}
