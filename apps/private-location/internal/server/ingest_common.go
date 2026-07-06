package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/openstatushq/openstatus/apps/private-location/internal/database"
)

// ingestContext holds common data needed for ingestion
type ingestContext struct {
	Monitor  database.Monitor
	Region   database.PrivateLocation
}

// getIngestContext retrieves monitor and private location data for ingestion
func (h *privateLocationHandler) getIngestContext(ctx context.Context, token string, monitorID string) (*ingestContext, error) {
	var monitor database.Monitor
	err := h.db.Get(&monitor, "SELECT monitor.id, monitor.workspace_id, monitor.url, monitor.method, monitor.assertions, monitor.updates_status FROM monitor JOIN private_location_to_monitor a ON monitor.id = a.monitor_id JOIN private_location b ON a.private_location_id = b.id WHERE b.token = ? AND monitor.deleted_at IS NULL and monitor.id = ?", token, monitorID)
	if err != nil {
		if holder := GetEvent(ctx); holder != nil {
			holder.Event["error"] = map[string]any{
				"message": err.Error(),
				"source":  "database",
				"type":    "monitor_lookup",
			}
		}
		return nil, err
	}

	var region database.PrivateLocation
	err = h.db.Get(&region, "SELECT private_location.id FROM private_location join private_location_to_monitor a ON private_location.id = a.private_location_id WHERE a.monitor_id = ? AND private_location.token = ?", monitor.ID, token)
	if err != nil {
		if holder := GetEvent(ctx); holder != nil {
			holder.Event["error"] = map[string]any{
				"message": err.Error(),
				"source":  "database",
				"type":    "private_location_lookup",
			}
		}
		return nil, err
	}

	return &ingestContext{
		Monitor: monitor,
		Region:  region,
	}, nil
}

// sendEventAndUpdateLastSeen sends the event to Tinybird and updates the last_seen_at timestamp
func (h *privateLocationHandler) sendEventAndUpdateLastSeen(ctx context.Context, data any, dataSourceName string, regionID int) {
	start := time.Now()
	err := h.TbClient.SendEvent(ctx, data, dataSourceName)
	duration := time.Since(start).Milliseconds()

	// Enrich wide event with Tinybird operation context
	if holder := GetEvent(ctx); holder != nil {
		holder.Event["tinybird"] = map[string]any{
			"datasource":  dataSourceName,
			"duration_ms": duration,
			"success":     err == nil,
		}
		if err != nil {
			holder.Event["error"] = map[string]any{
				"message": err.Error(),
				"source":  "tinybird",
			}
		}
	}

	_, dbErr := h.db.NamedExec("UPDATE private_location SET last_seen_at = :last_seen_at WHERE id = :id", map[string]any{
		"last_seen_at": time.Now().Unix(),
		"id":           regionID,
	})
	if dbErr != nil {
		if holder := GetEvent(ctx); holder != nil {
			holder.Event["db_update_error"] = map[string]any{
				"message": dbErr.Error(),
				"type":    "last_seen_update",
			}
		}
	}
}

// requestStatusToMonitorStatus maps private-probe RequestStatus to monitor status.
func requestStatusToMonitorStatus(requestStatus string) string {
	switch requestStatus {
	case "success":
		return "active"
	case "degraded":
		return "degraded"
	case "error":
		return "error"
	default:
		return ""
	}
}

type updateStatusPayload struct {
	MonitorId     string `json:"monitorId"`
	Status        string `json:"status"`
	Message       string `json:"message,omitempty"`
	Region        string `json:"region"`
	CronTimestamp int64  `json:"cronTimestamp"`
	StatusCode    int    `json:"statusCode,omitempty"`
	Latency       int64  `json:"latency,omitempty"`
}

// updateMonitorStatus sends a status update to the workflows private endpoint
// when the monitor's updatesStatus flag is enabled.
func (h *privateLocationHandler) updateMonitorStatus(ctx context.Context, monitor database.Monitor, regionID int, requestStatus string, statusCode int, cronTimestamp, latency int64) {
	if !monitor.UpdatesStatus {
		return
	}

	workflowsURL := os.Getenv("OPENSTATUS_WORKFLOWS_URL")
	if workflowsURL == "" {
		return
	}

	cronSecret := os.Getenv("CRON_SECRET")
	if cronSecret == "" {
		return
	}

	status := requestStatusToMonitorStatus(requestStatus)
	if status == "" {
		return
	}

	payload := updateStatusPayload{
		MonitorId:     fmt.Sprintf("%d", monitor.ID),
		Status:        status,
		Region:        fmt.Sprintf("%d", regionID),
		CronTimestamp: cronTimestamp,
		StatusCode:    statusCode,
		Latency:       latency,
	}

	payloadBuf := new(bytes.Buffer)
	if err := json.NewEncoder(payloadBuf).Encode(payload); err != nil {
		return
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	defer httpClient.CloseIdleConnections()

	url := fmt.Sprintf("%s/updateStatus/private", workflowsURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, payloadBuf)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Basic "+cronSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
}
