package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"reprice/internal/market"
)

// ---------------------------------------------------------------- danh mục

func (s *Server) catalogBrands(w http.ResponseWriter, r *http.Request) {
	b, err := s.market.Brands(r.Context())
	respond(w, r, http.StatusOK, b, err)
}

func (s *Server) catalogModels(w http.ResponseWriter, r *http.Request) {
	brand := r.URL.Query().Get("brand")
	if brand == "" {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Thiếu brand.", Details: map[string]any{"fields": map[string]string{"brand": "bắt buộc"}}})
		return
	}
	m, err := s.market.Models(r.Context(), brand, r.URL.Query().Get("q"))
	respond(w, r, http.StatusOK, m, err)
}

func (s *Server) catalogVariants(w http.ResponseWriter, r *http.Request) {
	v, err := s.market.Variants(r.Context(), chi.URLParam(r, "modelId"))
	respond(w, r, http.StatusOK, v, err)
}

// ---------------------------------------------------------------- tin đăng của người bán

func (s *Server) createListing(w http.ResponseWriter, r *http.Request) {
	var in market.ListingInput
	if !decodeJSON(w, r, &in) {
		return
	}
	u := currentUser(r)
	id, err := s.market.CreateListing(r.Context(), u.ID, in, s.clock.Now())
	if err != nil {
		writeError(w, r, err)
		return
	}
	l, err := s.market.GetListing(r.Context(), id, u.ID)
	if err == nil {
		l.AllowedActions = allowedListingActions(l, u.ID)
	}
	respond(w, r, http.StatusCreated, l, err)
}

func (s *Server) updateListing(w http.ResponseWriter, r *http.Request) {
	var in market.ListingInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := s.market.UpdateListing(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in, s.clock.Now()); err != nil {
		writeError(w, r, err)
		return
	}
	s.getListing(w, r)
}

func (s *Server) publishListing(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ConfirmAccuracy bool `json:"confirmAccuracy"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if !in.ConfirmAccuracy {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Cần xác nhận thông tin và ảnh phản ánh đúng tình trạng máy.",
			Details: map[string]any{"fields": map[string]string{"confirmAccuracy": "bắt buộc"}}})
		return
	}
	if err := s.market.Publish(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, s.clock.Now()); err != nil {
		writeError(w, r, err)
		return
	}
	s.getListing(w, r)
}

func (s *Server) listingVisibility(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := s.market.SetVisibility(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, action, s.clock.Now()); err != nil {
			writeError(w, r, err)
			return
		}
		if action == "REMOVE" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.getListing(w, r)
	}
}

func (s *Server) myListings(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	items, err := s.market.MyListings(r.Context(), u.ID, r.URL.Query().Get("status"))
	if err == nil {
		for _, l := range items {
			l.AllowedActions = allowedListingActions(l, u.ID)
		}
	}
	respond(w, r, http.StatusOK, map[string]any{"items": items, "page": 1, "pageSize": len(items), "total": len(items)}, err)
}

// ---------------------------------------------------------------- ảnh

const maxPhotoBytes = 8 << 20

var photoExt = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

// uploadPhoto nhận một ảnh (multipart field "file"), lưu vào UPLOAD_DIR/listings/<id>/ và phục vụ ở /uploads/....
func (s *Server) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes+1<<20)
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Chọn một ảnh (tối đa 8MB).",
			Details: map[string]any{"fields": map[string]string{"file": "bắt buộc, ≤ 8MB"}}})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxPhotoBytes+1))
	if err != nil {
		writeError(w, r, err)
		return
	}
	ext, ok := photoExt[http.DetectContentType(data)]
	if !ok || len(data) > maxPhotoBytes {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Ảnh phải là JPG, PNG hoặc WebP và không quá 8MB.",
			Details: map[string]any{"fields": map[string]string{"file": "jpg | png | webp, ≤ 8MB"}}})
		return
	}
	listingID := chi.URLParam(r, "id")
	name := randomName() + ext
	dir := filepath.Join(s.cfg.UploadDir, "listings", listingID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, r, err)
		return
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		writeError(w, r, err)
		return
	}
	photo, err := s.market.AddPhoto(r.Context(), listingID, currentUser(r).ID, "/uploads/listings/"+listingID+"/"+name, s.clock.Now())
	if err != nil {
		_ = os.Remove(path)
	}
	respond(w, r, http.StatusCreated, photo, err)
}

func (s *Server) deletePhoto(w http.ResponseWriter, r *http.Request) {
	url, err := s.market.DeletePhoto(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, chi.URLParam(r, "photoId"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	if rel, ok := strings.CutPrefix(url, "/uploads/"); ok {
		_ = os.Remove(filepath.Join(s.cfg.UploadDir, filepath.Clean("/"+rel)))
	}
	w.WriteHeader(http.StatusNoContent)
}

func randomName() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// uploads phục vụ file đã tải lên; không liệt kê thư mục.
func (s *Server) uploads() http.Handler {
	fs := http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadDir)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		fs.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------- xem trước giá

func (s *Server) previewReference(w http.ResponseWriter, r *http.Request) {
	var in market.PreviewInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if !uuidRe.MatchString(in.Variant.ModelID) || in.Variant.StorageGB <= 0 {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Chọn model và dung lượng trước.",
			Details: map[string]any{"fields": map[string]string{"variant": "bắt buộc"}}})
		return
	}
	ref, err := s.market.PreviewReference(r.Context(), in, s.clock.Now())
	var e *Error
	if err != nil && !errors.As(err, &e) && strings.Contains(err.Error(), "no rows") {
		err = NewError(CodeNotFound, "Không có phiên bản này trong danh mục.")
	}
	respond(w, r, http.StatusOK, ref, err)
}
