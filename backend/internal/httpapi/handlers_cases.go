package httpapi

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"reprice/internal/trade"
)

func (s *Server) openCase(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Type         string     `json:"type"`
		Reason       string     `json:"reason"`
		Description  string     `json:"description"`
		DiscoveredAt *time.Time `json:"discoveredAt"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.OpenCase(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Type, in.Reason, in.Description, in.DiscoveredAt)
	respond(w, r, http.StatusCreated, c, err)
}

func (s *Server) myCases(w http.ResponseWriter, r *http.Request) {
	items, err := s.trade.ListCases(r.Context(), currentUser(r).ID, r.URL.Query().Get("status"), false)
	respond(w, r, http.StatusOK, map[string]any{"items": items}, err)
}

func (s *Server) getCase(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	c, err := s.trade.GetCase(r.Context(), chi.URLParam(r, "id"), u.ID, u.IsAdmin)
	respond(w, r, http.StatusOK, c, err)
}

var evidenceTypes = map[string]string{
	"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "application/pdf": ".pdf",
}

const maxEvidenceBytes = 20 << 20

// POST /cases/{id}/evidence (multipart: note, files[]) — tối đa 6 tệp, mỗi tệp ≤ 20MB.
func (s *Server) addEvidence(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 6*maxEvidenceBytes+1<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Tệp quá lớn hoặc dữ liệu không hợp lệ (tối đa 6 tệp, mỗi tệp 20MB)."})
		return
	}
	caseID := chi.URLParam(r, "id")
	headers := r.MultipartForm.File["files"]
	if len(headers) > 6 {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Tối đa 6 tệp mỗi lần."})
		return
	}
	var files []trade.EvidenceFile
	var saved []string
	cleanup := func() {
		for _, p := range saved {
			_ = os.Remove(p)
		}
	}
	dir := filepath.Join(s.cfg.UploadDir, "cases", caseID)
	for _, h := range headers {
		f, err := h.Open()
		if err != nil {
			cleanup()
			writeError(w, r, err)
			return
		}
		data, err := io.ReadAll(io.LimitReader(f, maxEvidenceBytes+1))
		f.Close()
		if err != nil {
			cleanup()
			writeError(w, r, err)
			return
		}
		mime := http.DetectContentType(data)
		if strings.HasPrefix(mime, "application/octet-stream") && strings.HasSuffix(strings.ToLower(h.Filename), ".mp4") {
			mime = "video/mp4"
		}
		ext, ok := evidenceTypes[mime]
		if !ok || len(data) > maxEvidenceBytes {
			cleanup()
			writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Chỉ nhận ảnh, video MP4/WebM hoặc PDF, mỗi tệp ≤ 20MB."})
			return
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			cleanup()
			writeError(w, r, err)
			return
		}
		name := randomName() + ext
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, data, 0o644); err != nil {
			cleanup()
			writeError(w, r, err)
			return
		}
		saved = append(saved, path)
		files = append(files, trade.EvidenceFile{FileName: filepath.Base(h.Filename), MimeType: mime, SizeBytes: int64(len(data)),
			URL: "/uploads/cases/" + caseID + "/" + name})
	}
	c, err := s.trade.AddEvidence(r.Context(), caseID, currentUser(r).ID, r.FormValue("note"), files)
	if err != nil {
		cleanup()
	}
	respond(w, r, http.StatusCreated, c, err)
}

func (s *Server) sellerResponse(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action        string              `json:"action"`
		Message       string              `json:"message"`
		ReturnAddress *trade.ShippingInfo `json:"returnAddress"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.SellerRespond(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Action, in.Message, in.ReturnAddress)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) buyerSupplement(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Message string `json:"message"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.BuyerSupplement(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Message)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) buyerChoice(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action string `json:"action"`
		Note   string `json:"note"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.BuyerChoice(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Action, in.Note)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) returnHandover(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Obstacle string `json:"obstacle"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.ReturnHandover(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Obstacle)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) returnInspection(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Result      string `json:"result"`
		ProblemType string `json:"problemType"`
		Message     string `json:"message"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.ReturnInspection(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Result, in.ProblemType, in.Message)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) reviewRequest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.RequestReview(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Reason)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) refundNotReceived(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Note string `json:"note"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.ReportRefundNotReceived(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Note)
	respond(w, r, http.StatusOK, c, err)
}

// ---------------------------------------------------------------- QTV

func (s *Server) adminCases(w http.ResponseWriter, r *http.Request) {
	items, err := s.trade.ListCases(r.Context(), "", r.URL.Query().Get("status"), r.URL.Query().Get("open") == "true")
	respond(w, r, http.StatusOK, map[string]any{"items": items}, err)
}

func (s *Server) adminAssignCase(w http.ResponseWriter, r *http.Request) {
	c, err := s.trade.AssignCase(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) adminRequestInfo(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Party    string `json:"party"`
		Message  string `json:"message"`
		DueHours int    `json:"dueHours"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.DueHours <= 0 || in.DueHours > 168 {
		in.DueHours = 48
	}
	c, err := s.trade.AdminRequestInfo(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Party, in.Message, time.Duration(in.DueHours)*time.Hour)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) adminVerifyShipping(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Question string `json:"question"`
		Outcome  string `json:"outcome"`
		Response string `json:"response"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.AdminVerifyShipping(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Question, in.Outcome, in.Response)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) adminResolve(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Decision     string `json:"decision"`
		Rationale    string `json:"rationale"`
		RefundAmount *int64 `json:"refundAmount"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := s.trade.AdminResolve(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Decision, in.Rationale, in.RefundAmount)
	respond(w, r, http.StatusOK, c, err)
}

func (s *Server) adminRefunds(w http.ResponseWriter, r *http.Request) {
	items, err := s.trade.ListRefunds(r.Context())
	respond(w, r, http.StatusOK, map[string]any{"items": items}, err)
}

func (s *Server) adminProcessRefund(retry bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rf, err := s.trade.ProcessRefund(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, retry)
		respond(w, r, http.StatusOK, rf, err)
	}
}

func (s *Server) demoRefundResult(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Result string `json:"result"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	rf, err := s.trade.RefundResult(r.Context(), chi.URLParam(r, "id"), in.Result)
	respond(w, r, http.StatusOK, rf, err)
}
