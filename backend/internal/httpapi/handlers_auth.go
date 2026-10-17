package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"reprice/internal/auth"
	"reprice/internal/seed"
)

type meResponse struct {
	ID           string   `json:"id"`
	FullName     string   `json:"fullName"`
	Email        string   `json:"email"`
	Phone        string   `json:"phone"`
	Province     string   `json:"province"`
	Ward         string   `json:"ward"`
	IsAdmin      bool     `json:"isAdmin"`
	SellerRating *float64 `json:"sellerRating"`
	CreatedAt    string   `json:"createdAt"`
}

func (s *Server) loadMe(r *http.Request, where string, arg any) (*meResponse, string, error) {
	var m meResponse
	var hash string
	err := s.pool.QueryRow(r.Context(), `SELECT id, full_name, email, phone, province, ward, is_admin, seller_rating,
		to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), password_hash FROM users WHERE `+where, arg).
		Scan(&m.ID, &m.FullName, &m.Email, &m.Phone, &m.Province, &m.Ward, &m.IsAdmin, &m.SellerRating, &m.CreatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", nil
	}
	return &m, hash, err
}

func (s *Server) session(w http.ResponseWriter, r *http.Request, status int, me *meResponse) {
	token, err := s.signer.Sign(me.ID, time.Now())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, status, map[string]any{"token": token, "user": me})
}

// POST /auth/login
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	me, hash, err := s.loadMe(r, "lower(email) = lower($1)", strings.TrimSpace(in.Email))
	if err != nil {
		writeError(w, r, err)
		return
	}
	if me == nil || !auth.CheckPassword(hash, in.Password) {
		writeError(w, r, NewError(CodeUnauthenticated, "Email hoặc mật khẩu không đúng."))
		return
	}
	s.session(w, r, http.StatusOK, me)
}

// GET /me
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	me, _, err := s.loadMe(r, "id = $1", u.ID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, me)
}

// Tài khoản demo theo vai trò; demoRole khớp với thanh chuyển vai trò của web.
var demoAccounts = []struct{ email, role string }{
	{"buyer@reprice.demo", "BUYER"},
	{"seller@reprice.demo", "SELLER"},
	{"admin@reprice.demo", "ADMIN"},
}

// GET /demo/accounts
func (s *Server) demoAccountsList(w http.ResponseWriter, r *http.Request) {
	out := []map[string]any{}
	for _, a := range demoAccounts {
		me, _, err := s.loadMe(r, "email = $1", a.email)
		if err != nil {
			writeError(w, r, err)
			return
		}
		if me != nil {
			out = append(out, map[string]any{"id": me.ID, "fullName": me.FullName, "sellerRating": me.SellerRating, "demoRole": a.role})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /demo/login-as {userId}
func (s *Server) demoLoginAs(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"userId"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	me, _, err := s.loadMe(r, "id::text = $1", in.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if me == nil {
		writeError(w, r, NewError(CodeNotFound, "Không có tài khoản này."))
		return
	}
	s.session(w, r, http.StatusOK, me)
}

// POST /demo/reset
func (s *Server) demoReset(w http.ResponseWriter, r *http.Request) {
	if err := s.clock.Reset(r.Context()); err != nil {
		writeError(w, r, err)
		return
	}
	if err := seed.Reset(r.Context(), s.pool, s.clock.Now()); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.market.RecalculateAll(r.Context(), s.clock.Now()); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /demo/clock/advance {hours}
func (s *Server) demoAdvance(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Hours int `json:"hours"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Hours < 1 || in.Hours > 720 {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Số giờ phải từ 1 đến 720.",
			Details: map[string]any{"fields": map[string]string{"hours": "1–720"}}})
		return
	}
	if err := s.clock.Advance(r.Context(), time.Duration(in.Hours)*time.Hour); err != nil {
		writeError(w, r, err)
		return
	}
	jobs, err := s.trade.RunDue(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"now":           s.clock.Now().Format(time.RFC3339),
		"offsetSeconds": int64(s.clock.Offset() / time.Second),
		"jobsRun":       jobs,
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, r, NewError(CodeBadRequest, "Dữ liệu gửi lên không đúng định dạng JSON."))
		return false
	}
	return true
}
