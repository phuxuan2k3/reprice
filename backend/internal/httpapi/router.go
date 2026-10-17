// Package httpapi là lớp HTTP: router, middleware, mã lỗi. Hợp đồng API: docs/openapi.yaml.
package httpapi

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reprice/internal/auth"
	"reprice/internal/clock"
	"reprice/internal/config"
	"reprice/internal/market"
	"reprice/internal/trade"
)

type Server struct {
	cfg    config.Config
	pool   *pgxpool.Pool
	clock  *clock.Clock
	signer *auth.Signer
	market *market.Store
	trade  *trade.Service
}

func NewServer(cfg config.Config, pool *pgxpool.Pool, clk *clock.Clock) *Server {
	return &Server{
		cfg:    cfg,
		pool:   pool,
		clock:  clk,
		signer: auth.NewSigner(cfg.JWTSecret, 7*24*time.Hour),
		market: market.NewStore(pool),
		trade:  trade.New(pool, clk),
	}
}

// Trade cho phép main chạy bộ lập lịch.
func (s *Server) Trade() *trade.Service { return s.trade }

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	if s.cfg.CORSOrigin != "" {
		r.Use(s.cors)
	}

	r.Get("/healthz", s.health)
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.authenticate)
		r.Get("/healthz", s.health)

		r.Post("/auth/login", s.login)
		r.With(s.requireUser).Get("/me", s.me)

		r.Get("/catalog/brands", s.catalogBrands)
		r.Get("/catalog/models", s.catalogModels)
		r.With(uuidParam("modelId")).Get("/catalog/models/{modelId}/variants", s.catalogVariants)

		r.Get("/listings", s.listListings)
		r.With(uuidParam("id")).Get("/listings/{id}", s.getListing)
		r.With(uuidParam("id")).Get("/listings/{id}/reference-price", s.listingReferencePrice)
		r.With(uuidParam("versionId")).Get("/price-ranges/{versionId}", s.getPriceRange)

		r.Group(func(r chi.Router) {
			r.Use(s.requireUser)
			r.Get("/me/notifications", s.myNotifications)
			r.Post("/me/notifications/read-all", s.readAllNotifications)
			r.With(uuidParam("id")).Post("/me/notifications/{id}/read", s.readNotification)

			r.Post("/reference-price/preview", s.previewReference)
			r.Get("/me/listings", s.myListings)
			r.Post("/listings", s.createListing)
			// Không dùng r.Route vì /listings/{id} đã có route GET công khai ở trên.
			own := r.With(uuidParam("id"))
			own.Patch("/listings/{id}", s.updateListing)
			own.Delete("/listings/{id}", s.listingVisibility("REMOVE"))
			own.Post("/listings/{id}/publish", s.publishListing)
			own.Post("/listings/{id}/pause", s.listingVisibility("PAUSE"))
			own.Post("/listings/{id}/resume", s.listingVisibility("RESUME"))
			own.Post("/listings/{id}/photos", s.uploadPhoto)
			own.With(uuidParam("photoId")).Delete("/listings/{id}/photos/{photoId}", s.deletePhoto)

			r.With(uuidParam("id")).Post("/listings/{id}/buy-now", s.buyNow)
			r.With(uuidParam("id")).Post("/listings/{id}/negotiations", s.startNegotiation)
			r.Get("/me/negotiations", s.myNegotiations)
			r.Route("/negotiations/{id}", func(r chi.Router) {
				r.Use(uuidParam("id"))
				r.Get("/", s.getNegotiation)
				r.Post("/offers", s.counterOffer)
				r.Post("/accept", s.acceptNegotiation)
				r.Post("/reject", s.rejectNegotiation)
				r.Post("/cancel", s.cancelNegotiation)
			})

			r.Get("/me/orders", s.myOrders)
			r.Route("/orders/{id}", func(r chi.Router) {
				r.Use(uuidParam("id"))
				r.Get("/", s.getOrder)
				r.Get("/history", s.orderHistory)
				r.Put("/shipping-info", s.setShippingInfo)
				r.Post("/payment", s.choosePayment)
				r.Post("/cancel", s.cancelOrder)
				r.Post("/handover", s.handover)
				r.Post("/receive", s.receiveOrder)
			})
			r.With(uuidParam("id")).Get("/shipments/{id}", s.getShipment)

			r.With(uuidParam("id")).Post("/orders/{id}/cases", s.openCase)
			r.Get("/me/cases", s.myCases)
			r.Route("/cases/{id}", func(r chi.Router) {
				r.Use(uuidParam("id"))
				r.Get("/", s.getCase)
				r.Post("/evidence", s.addEvidence)
				r.Post("/seller-response", s.sellerResponse)
				r.Post("/buyer-supplement", s.buyerSupplement)
				r.Post("/buyer-choice", s.buyerChoice)
				r.Post("/return-handover", s.returnHandover)
				r.Post("/return-inspection", s.returnInspection)
				r.Post("/review-request", s.reviewRequest)
				r.Post("/refund-not-received", s.refundNotReceived)
			})
		})

		r.Route("/admin", func(r chi.Router) {
			r.Use(s.requireAdmin)
			r.Get("/dashboard", s.adminDashboard)
			r.Get("/reference-transactions", s.adminReferenceList)
			r.With(uuidParam("id")).Get("/reference-transactions/{id}", s.adminReferenceGet)
			r.With(uuidParam("id")).Post("/reference-transactions/{id}/decisions", s.adminReferenceDecide)
			r.Get("/pricing-config", s.adminPricingConfig)
			r.Put("/pricing-config", s.adminSetPricingConfig)
			r.Get("/audit-logs", s.adminAuditLogs)
			r.Get("/cases", s.adminCases)
			r.With(uuidParam("id")).Post("/cases/{id}/assign", s.adminAssignCase)
			r.With(uuidParam("id")).Post("/cases/{id}/request-info", s.adminRequestInfo)
			r.With(uuidParam("id")).Post("/cases/{id}/shipping-verifications", s.adminVerifyShipping)
			r.With(uuidParam("id")).Post("/cases/{id}/resolutions", s.adminResolve)
			r.Get("/refunds", s.adminRefunds)
			r.With(uuidParam("id")).Post("/refunds/{id}/process", s.adminProcessRefund(false))
			r.With(uuidParam("id")).Post("/refunds/{id}/retry", s.adminProcessRefund(true))
		})

		if s.cfg.DemoMode {
			r.Get("/demo/accounts", s.demoAccountsList)
			r.Post("/demo/login-as", s.demoLoginAs)
			r.Get("/demo/clock", s.demoClock)
			r.Post("/demo/clock/advance", s.demoAdvance)
			r.Post("/demo/reset", s.demoReset)
			r.With(uuidParam("orderId")).Post("/demo/payments/{orderId}/result", s.demoPaymentResult)
			r.With(uuidParam("id")).Post("/demo/shipments/{id}/advance", s.demoShipmentAdvance)
			r.With(uuidParam("id")).Post("/demo/shipments/{id}/fail", s.demoShipmentFail)
			r.With(uuidParam("id")).Post("/demo/refunds/{id}/result", s.demoRefundResult)
		}
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, r, NewError(CodeNotFound, "Không tìm thấy endpoint."))
		})
	})

	r.Handle("/uploads/*", s.uploads())

	if s.cfg.WebDir != "" {
		r.NotFound(spaHandler(s.cfg.WebDir))
	}
	return r
}

// authenticate đọc token nếu có. Token sai hoặc hết hạn → 401; không có token → khách.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if h == "" {
			next.ServeHTTP(w, r)
			return
		}
		token, ok := strings.CutPrefix(h, "Bearer ")
		if !ok {
			writeError(w, r, NewError(CodeUnauthenticated, "Token không hợp lệ."))
			return
		}
		claims, err := s.signer.Verify(token, time.Now())
		if err != nil {
			writeError(w, r, NewError(CodeUnauthenticated, "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."))
			return
		}
		u := &auth.User{ID: claims.UserID}
		err = s.pool.QueryRow(r.Context(), `SELECT full_name, is_admin FROM users WHERE id = $1`, claims.UserID).Scan(&u.FullName, &u.IsAdmin)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, r, NewError(CodeUnauthenticated, "Tài khoản không còn tồn tại, vui lòng đăng nhập lại."))
			return
		}
		if err != nil {
			writeError(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
	})
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if auth.FromContext(r.Context()) == nil {
			writeError(w, r, NewError(CodeUnauthenticated, "Bạn cần đăng nhập."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// uuidParam trả 404 khi tham số đường dẫn không phải uuid, tránh lỗi cast ở database.
func uuidParam(name string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !uuidRe.MatchString(chi.URLParam(r, name)) {
				writeError(w, r, NewError(CodeNotFound, "Không tìm thấy."))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.pool.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db_unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) demoClock(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"now":           s.clock.Now().Format(time.RFC3339),
		"offsetSeconds": int64(s.clock.Offset() / time.Second),
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", s.cfg.CORSOrigin)
		h.Set("Vary", "Origin")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// spaHandler phục vụ bản build của web; đường dẫn không phải file thì trả index.html
// để React Router xử lý.
func spaHandler(dir string) http.HandlerFunc {
	files := http.FileServer(http.Dir(dir))
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeError(w, r, NewError(CodeNotFound, "Không tìm thấy."))
			return
		}
		p := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			if strings.HasPrefix(r.URL.Path, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			files.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	}
}
