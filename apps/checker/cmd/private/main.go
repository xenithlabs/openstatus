package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"github.com/madflojo/tasks"
	"github.com/openstatushq/openstatus/apps/checker/pkg/job"
	"github.com/openstatushq/openstatus/apps/checker/pkg/scheduler"

	v1 "github.com/openstatushq/openstatus/apps/checker/proto/private_location/v1"
)

func main() {
	logLevel := getEnv("LOG_LEVEL", "info")
	setupLogger(logLevel)

	apiKey := getEnv("OPENSTATUS_KEY", "")
	ingestUrl := getEnv("OPENSTATUS_INGEST_URL", "https://openstatus-private-location.fly.dev")

	slog.Info("starting openstatus private location probe",
		"ingest_url", ingestUrl,
		"has_key", apiKey != "",
		"log_level", logLevel,
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		slog.Info("received signal, shutting down", "signal", sig.String())
		cancel()
	}()

	s := tasks.New()
	defer s.Stop()

	monitorManager := scheduler.MonitorManager{
		Client:    getClient(apiKey, ingestUrl),
		JobRunner: job.NewJobRunner(),
		Scheduler: s,
	}

	slog.Info("fetching initial monitor configuration")
	configRefreshMinutes := monitorManager.UpdateMonitors(ctx)

	configRefreshDuration := time.Duration(configRefreshMinutes) * time.Minute
	slog.Info("config refresh interval set",
		"interval_minutes", configRefreshMinutes,
	)

	configTicker := time.NewTicker(configRefreshDuration)
	defer configTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("probe shutting down")
			return
		case <-configTicker.C:
			slog.Debug("refreshing monitor configuration")
			newMinutes := monitorManager.UpdateMonitors(ctx)
			newDuration := time.Duration(newMinutes) * time.Minute
			if newDuration != configRefreshDuration {
				slog.Info("config refresh interval changed",
					"old_minutes", configRefreshMinutes,
					"new_minutes", newMinutes,
				)
				configTicker.Reset(newDuration)
				configRefreshDuration = newDuration
				configRefreshMinutes = newMinutes
			}
		}
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getClient(apiKey string, ingestUrl string) v1.PrivateLocationServiceClient {
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}
	client := v1.NewPrivateLocationServiceClient(
		httpClient,
		ingestUrl,
		connect.WithHTTPGet(),
		connect.WithInterceptors(NewAuthInterceptor(apiKey)),
	)

	return client
}

func setupLogger(logLevel string) {
	var level slog.Level
	switch logLevel {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: level}
	logger := slog.New(slog.NewTextHandler(os.Stdout, opts))
	slog.SetDefault(logger)
}

func NewAuthInterceptor(token string) connect.UnaryInterceptorFunc {

	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return connect.UnaryFunc(func(
			ctx context.Context,
			req connect.AnyRequest,
		) (connect.AnyResponse, error) {
			if req.Spec().IsClient {
				// Send a token with client requests.
				req.Header().Set("openstatus-token", token)
			}

			return next(ctx, req)
		})
	}
	return connect.UnaryInterceptorFunc(interceptor)

}
