package checker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"

	"cloud.google.com/go/auth"
	cloudtasks "cloud.google.com/go/cloudtasks/apiv2"
	taskspb "cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
)

type UpdateData struct {
	MonitorId     string `json:"monitorId"`
	Status        string `json:"status"`
	Message       string `json:"message,omitempty"`
	Region        string `json:"region"`
	CronTimestamp int64  `json:"cronTimestamp"`
	StatusCode    int    `json:"statusCode,omitempty"`
	Latency       int64  `json:"latency,omitempty"`
}

func hasGCPConfig() bool {
	return os.Getenv("GCP_PROJECT_ID") != "" &&
		os.Getenv("GCP_CLIENT_EMAIL") != "" &&
		os.Getenv("GCP_PRIVATE_KEY") != ""
}

func UpdateStatus(ctx context.Context, updateData UpdateData) error {
	basic := "Basic " + os.Getenv("CRON_SECRET")

	if !hasGCPConfig() {
		// Self-hosted: POST directly to workflows
		workflowsUrl := os.Getenv("OPENSTATUS_WORKFLOWS_URL")
		if workflowsUrl == "" {
			workflowsUrl = "http://localhost:3000"
		}
		url := fmt.Sprintf("%s/updateStatus", workflowsUrl)

		payloadBuf := new(bytes.Buffer)
		if err := json.NewEncoder(payloadBuf).Encode(updateData); err != nil {
			log.Ctx(ctx).Error().Err(err).Msg("error while encoding update status payload")
			return err
		}

		httpClient := &http.Client{Timeout: 30 * time.Second}
		defer httpClient.CloseIdleConnections()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, payloadBuf)
		if err != nil {
			log.Ctx(ctx).Error().Err(err).Msg("error creating update status request")
			return err
		}
		req.Header.Set("Authorization", basic)
		req.Header.Set("Content-Type", "application/json")

		resp, err := httpClient.Do(req)
		if err != nil {
			log.Ctx(ctx).Error().Err(err).Msg("error posting update status")
			return fmt.Errorf("updateStatus HTTP POST: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			log.Ctx(ctx).Error().
				Int("status_code", resp.StatusCode).
				Str("body", string(body)).
				Msg("update status returned non-2xx")
			return fmt.Errorf("updateStatus returned %d", resp.StatusCode)
		}

		return nil
	}

	// GCP Cloud Tasks path (unchanged)
	payloadBuf := new(bytes.Buffer)
	c := os.Getenv("GCP_PRIVATE_KEY")
	c = strings.ReplaceAll(c, "\\n", "\n")
	opts := &auth.Options2LO{
		Email:        os.Getenv("GCP_CLIENT_EMAIL"),
		PrivateKey:   []byte(c),
		PrivateKeyID: os.Getenv("GCP_PRIVATE_KEY_ID"),
		Scopes: []string{
			"https://www.googleapis.com/auth/cloud-platform",
		},
		TokenURL: "https://oauth2.googleapis.com/token",
	}

	tp, err := auth.New2LOTokenProvider(opts)
	if err != nil {
		log.Ctx(ctx).Error().Err(err).Msg("error while creating token provider")
		return err
	}

	creds := auth.NewCredentials(&auth.CredentialsOptions{
		TokenProvider: tp,
	})

	client, err := cloudtasks.NewClient(ctx, option.WithAuthCredentials(creds))
	if err != nil {
		log.Ctx(ctx).Error().Err(err).Msg("error while creating cloud tasks client")
		return err
	}
	defer client.Close()

	if err := json.NewEncoder(payloadBuf).Encode(updateData); err != nil {
		log.Ctx(ctx).Error().Err(err).Msg("error while updating status")
		return err
	}
	projectID := os.Getenv("GCP_PROJECT_ID")
	queuePath := fmt.Sprintf("projects/%s/locations/europe-west1/queues/alerting", projectID)
	req := &taskspb.CreateTaskRequest{
		Parent: queuePath,
		Task: &taskspb.Task{
			MessageType: &taskspb.Task_HttpRequest{
				HttpRequest: &taskspb.HttpRequest{
					HttpMethod: taskspb.HttpMethod_POST,
					Url:        "https://openstatus-workflows.fly.dev/updateStatus",
					Headers:    map[string]string{"Authorization": basic, "Content-Type": "application/json"},
				},
			},
		},
	}

	req.Task.GetHttpRequest().Body = payloadBuf.Bytes()

	_, err = client.CreateTask(ctx, req)
	if err != nil {
		log.Ctx(ctx).Error().Err(err).Msg("error while creating the cloud task")
		return fmt.Errorf("cloudtasks.CreateTask: %w", err)
	}

	return nil
}
