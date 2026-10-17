package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"reprice/internal/apperr"
)

// Mã lỗi và kiểu lỗi dùng chung với các package service (internal/apperr).
const (
	CodeBadRequest       = apperr.BadRequest
	CodeUnauthenticated  = apperr.Unauthenticated
	CodeForbidden        = apperr.Forbidden
	CodeNotFound         = apperr.NotFound
	CodeInvalidState     = apperr.InvalidState
	CodeConflict         = apperr.Conflict
	CodeDeadlinePassed   = apperr.DeadlinePassed
	CodeValidationFailed = apperr.ValidationFailed
	CodeInternal         = apperr.Internal
)

var statusByCode = map[string]int{
	CodeBadRequest:       http.StatusBadRequest,
	CodeUnauthenticated:  http.StatusUnauthorized,
	CodeForbidden:        http.StatusForbidden,
	CodeNotFound:         http.StatusNotFound,
	CodeInvalidState:     http.StatusConflict,
	CodeConflict:         http.StatusConflict,
	CodeDeadlinePassed:   http.StatusGone,
	CodeValidationFailed: http.StatusUnprocessableEntity,
	CodeInternal:         http.StatusInternalServerError,
}

type Error = apperr.Error

func NewError(code, message string) *Error { return apperr.New(code, message) }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var e *Error
	if !errors.As(err, &e) {
		slog.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		e = NewError(CodeInternal, "Lỗi hệ thống, vui lòng thử lại.")
	}
	writeJSON(w, statusByCode[e.Code], map[string]any{"error": e})
}
