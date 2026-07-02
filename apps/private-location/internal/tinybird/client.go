package tinybird

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
)

// Datasource names for Tinybird events
const (
	DatasourceHTTP = "ping_response__v8"
	DatasourceTCP  = "tcp_response__v0"
	DatasourceDNS  = "tcp_dns__v0"
)

func getBaseURL() string {
	// Use local Tinybird container if available (Docker/self-hosted)
	// https://www.tinybird.co/docs/api-reference
	if tinybirdURL := os.Getenv("TINYBIRD_URL"); tinybirdURL != "" {
		return tinybirdURL + "/v0/events"
	}
	return "https://api.tinybird.co/v0/events"
}

type Client interface {
	SendEvent(ctx context.Context, event any, dataSourceName string) error
}

type client struct {
	httpClient *http.Client
	apiKey     string
	baseURL    string
}

func NewClient(httpClient *http.Client, apiKey string) Client {
	baseURL := getBaseURL()
	slog.Info("tinybird client initialized",
		"base_url", baseURL,
		"has_token", apiKey != "",
		"token_len", len(apiKey),
	)
	return client{
		httpClient: httpClient,
		apiKey:     apiKey,
		baseURL:    baseURL,
	}
}

func (c client) SendEvent(ctx context.Context, event any, dataSourceName string) error {
	requestURL, err := url.Parse(c.baseURL)
	if err != nil {
		slog.Error("tinybird url parse failed", "base_url", c.baseURL, "error", err)
		return fmt.Errorf("unable to parse url: %w", err)
	}

	q := requestURL.Query()
	q.Add("name", dataSourceName)
	requestURL.RawQuery = q.Encode()

	var payload bytes.Buffer
	if err := json.NewEncoder(&payload).Encode(event); err != nil {
		slog.Error("tinybird payload encode failed", "datasource", dataSourceName, "error", err)
		return fmt.Errorf("unable to encode payload: %w", err)
	}

	slog.Debug("sending event to tinybird",
		"url", requestURL.String(),
		"datasource", dataSourceName,
		"payload_bytes", payload.Len(),
		"has_token", c.apiKey != "",
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL.String(), bytes.NewReader(payload.Bytes()))
	if err != nil {
		slog.Error("tinybird request creation failed", "error", err)
		return fmt.Errorf("unable to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		slog.Error("tinybird request failed", "url", requestURL.String(), "error", err)
		return fmt.Errorf("unable to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		bodyBytes, readErr := io.ReadAll(io.LimitReader(resp.Body, 4096))
		bodyStr := ""
		if readErr == nil && len(bodyBytes) > 0 {
			bodyStr = string(bodyBytes)
		}
		slog.Error("tinybird returned non-202 status",
			"url", requestURL.String(),
			"datasource", dataSourceName,
			"status_code", resp.StatusCode,
			"response_body", bodyStr,
		)
		if bodyStr != "" {
			return fmt.Errorf("unexpected status code: %d, body: %s", resp.StatusCode, bodyStr)
		}
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}
