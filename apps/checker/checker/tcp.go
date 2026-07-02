package checker

import (
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

type TCPData struct {
	WorkspaceID string `json:"workspaceId"`
	MonitorID   string `json:"monitorId"`
	Timestamp   int64  `json:"timestamp"`
}

type TCPResponseTiming struct {
	TCPStart int64 `json:"tcpStart"`
	TCPDone  int64 `json:"tcpDone"`
}

type TCPResponse struct {
	State        string            `json:"state"`
	Type         string            `json:"type"`
	Region       string            `json:"region"`
	ErrorMessage string            `json:"errorMessage"`
	JobType      string            `json:"jobType"`
	RequestId    int64             `json:"requestId,omitempty"`
	WorkspaceID  int64             `json:"workspaceId"`
	MonitorID    int64             `json:"monitorId"`
	Timestamp    int64             `json:"timestamp"`
	Latency      int64             `json:"latency"`
	Timing       TCPResponseTiming `json:"timing"`
	Error        uint8             `json:"error,omitempty"`
}

func PingTCP(timeout int, url string) (TCPResponseTiming, error) {
	log.Info().Str("host", url).Int("timeout_s", timeout).Msg("TCP check: starting")

	start := time.Now().UTC().UnixMilli()
	log.Info().Str("host", url).Msg("TCP check: dialing")
	conn, err := net.DialTimeout("tcp", url, time.Duration(timeout)*time.Second)
	stop := time.Now().UTC().UnixMilli()
	latency := stop - start

	if err != nil {
		if e := err.(*net.OpError).Timeout(); e {
			log.Warn().Str("host", url).Int64("latency_ms", latency).Msg("TCP check: timed out")
			return TCPResponseTiming{}, fmt.Errorf("timeout after %d ms", timeout*1000)
		}
		if strings.Contains(err.Error(), "connection refused") {
			log.Warn().Str("host", url).Int64("latency_ms", latency).Msg("TCP check: connection refused")
			return TCPResponseTiming{}, fmt.Errorf("connection refused")
		}
		log.Error().Str("host", url).Err(err).Msg("TCP check: dial failed")
		return TCPResponseTiming{}, fmt.Errorf("dial error: %w", err)
	}
	defer conn.Close()

	log.Info().Str("host", url).Int64("latency_ms", latency).Msg("TCP check: complete")
	return TCPResponseTiming{TCPStart: start, TCPDone: stop}, nil
}
