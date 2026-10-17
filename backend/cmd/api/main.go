// Command api chạy backend RePrice: chạy migration rồi phục vụ HTTP.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // image distroless không có dữ liệu múi giờ

	"reprice/internal/clock"
	"reprice/internal/config"
	"reprice/internal/db"
	"reprice/internal/httpapi"
	"reprice/internal/market"
	"reprice/internal/seed"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	// Mã đơn (RP-YYYYMMDD-…) và giờ trong thông báo theo giờ Việt Nam, kể cả khi server chạy UTC.
	if loc, err := time.LoadLocation("Asia/Ho_Chi_Minh"); err == nil {
		time.Local = loc
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	applied, err := db.Migrate(ctx, pool)
	if err != nil {
		return err
	}
	if len(applied) > 0 {
		slog.Info("migrations applied", "versions", applied)
	}

	clk, err := clock.New(ctx, pool)
	if err != nil {
		return err
	}
	if cfg.DemoMode {
		empty, err := seed.IsEmpty(ctx, pool)
		if err != nil {
			return err
		}
		if empty {
			if err := seed.Reset(ctx, pool, clk.Now()); err != nil {
				return err
			}
			if err := market.NewStore(pool).RecalculateAll(ctx, clk.Now()); err != nil {
				return err
			}
			slog.Info("demo data seeded")
		}
	}

	api := httpapi.NewServer(cfg, pool, clk)
	go api.Trade().Loop(ctx)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", cfg.Addr, "demoMode", cfg.DemoMode)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
