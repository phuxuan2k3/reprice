package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"reprice/internal/auth"
	"reprice/internal/trade"
)

func currentUser(r *http.Request) *auth.User { return auth.FromContext(r.Context()) }

// respond trả v hoặc lỗi; status là mã khi thành công.
func respond(w http.ResponseWriter, r *http.Request, status int, v any, err error) {
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, status, v)
}

func roleParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	role := r.URL.Query().Get("role")
	if role != "buyer" && role != "seller" {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "role phải là buyer hoặc seller.",
			Details: map[string]any{"fields": map[string]string{"role": "buyer | seller"}}})
		return "", false
	}
	return role, true
}

// ---------------------------------------------------------------- thương lượng

type offerInput struct {
	Amount int64  `json:"amount"`
	Note   string `json:"note"`
}

func (s *Server) startNegotiation(w http.ResponseWriter, r *http.Request) {
	var in offerInput
	if !decodeJSON(w, r, &in) {
		return
	}
	n, err := s.trade.StartNegotiation(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Amount, in.Note)
	respond(w, r, http.StatusCreated, n, err)
}

func (s *Server) myNegotiations(w http.ResponseWriter, r *http.Request) {
	role, ok := roleParam(w, r)
	if !ok {
		return
	}
	items, err := s.trade.ListMyNegotiations(r.Context(), currentUser(r).ID, role, r.URL.Query().Get("status"))
	respond(w, r, http.StatusOK, map[string]any{"items": items, "page": 1, "pageSize": len(items), "total": len(items)}, err)
}

func (s *Server) getNegotiation(w http.ResponseWriter, r *http.Request) {
	n, err := s.trade.GetNegotiation(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID)
	respond(w, r, http.StatusOK, n, err)
}

func (s *Server) counterOffer(w http.ResponseWriter, r *http.Request) {
	var in offerInput
	if !decodeJSON(w, r, &in) {
		return
	}
	n, err := s.trade.CounterOffer(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Amount, in.Note)
	respond(w, r, http.StatusOK, n, err)
}

func (s *Server) acceptNegotiation(w http.ResponseWriter, r *http.Request) {
	n, o, err := s.trade.Accept(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID)
	respond(w, r, http.StatusCreated, map[string]any{"negotiation": n, "order": o}, err)
}

func (s *Server) rejectNegotiation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Note string `json:"note"`
	}
	if r.ContentLength > 0 && !decodeJSON(w, r, &in) {
		return
	}
	n, err := s.trade.Reject(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Note)
	respond(w, r, http.StatusOK, n, err)
}

func (s *Server) cancelNegotiation(w http.ResponseWriter, r *http.Request) {
	n, err := s.trade.CancelNegotiation(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID)
	respond(w, r, http.StatusOK, n, err)
}

// ---------------------------------------------------------------- đơn hàng

func (s *Server) buyNow(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ExpectedPrice int64 `json:"expectedPrice"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	o, err := s.trade.BuyNow(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.ExpectedPrice)
	respond(w, r, http.StatusCreated, o, err)
}

func (s *Server) myOrders(w http.ResponseWriter, r *http.Request) {
	role, ok := roleParam(w, r)
	if !ok {
		return
	}
	items, err := s.trade.ListMyOrders(r.Context(), currentUser(r).ID, role, r.URL.Query().Get("status"))
	respond(w, r, http.StatusOK, map[string]any{"items": items, "page": 1, "pageSize": len(items), "total": len(items)}, err)
}

func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	o, err := s.trade.GetOrder(r.Context(), chi.URLParam(r, "id"), u.ID, u.IsAdmin)
	respond(w, r, http.StatusOK, o, err)
}

func (s *Server) orderHistory(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	h, err := s.trade.OrderHistory(r.Context(), chi.URLParam(r, "id"), u.ID, u.IsAdmin)
	respond(w, r, http.StatusOK, h, err)
}

func (s *Server) setShippingInfo(w http.ResponseWriter, r *http.Request) {
	var in trade.ShippingInfo
	if !decodeJSON(w, r, &in) {
		return
	}
	o, err := s.trade.SetShippingInfo(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in)
	respond(w, r, http.StatusOK, o, err)
}

func (s *Server) choosePayment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Method  string `json:"method"`
		Channel string `json:"channel"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	o, err := s.trade.ChoosePayment(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Method, in.Channel)
	respond(w, r, http.StatusOK, o, err)
}

func (s *Server) cancelOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	o, err := s.trade.Cancel(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID, in.Reason)
	respond(w, r, http.StatusOK, o, err)
}

func (s *Server) handover(w http.ResponseWriter, r *http.Request) {
	o, err := s.trade.Handover(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID)
	respond(w, r, http.StatusCreated, o, err)
}

func (s *Server) receiveOrder(w http.ResponseWriter, r *http.Request) {
	o, err := s.trade.Receive(r.Context(), chi.URLParam(r, "id"), currentUser(r).ID)
	respond(w, r, http.StatusOK, o, err)
}

func (s *Server) getShipment(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	sh, err := s.trade.GetShipment(r.Context(), chi.URLParam(r, "id"), u.ID, u.IsAdmin)
	respond(w, r, http.StatusOK, sh, err)
}

// ---------------------------------------------------------------- thông báo

func (s *Server) myNotifications(w http.ResponseWriter, r *http.Request) {
	items, unread, err := s.trade.ListNotifications(r.Context(), currentUser(r).ID,
		r.URL.Query().Get("unread") == "true", queryInt(r, "pageSize", 50, 1, 100))
	respond(w, r, http.StatusOK, map[string]any{"items": items, "unreadCount": unread, "page": 1, "pageSize": len(items), "total": len(items)}, err)
}

func (s *Server) readNotification(w http.ResponseWriter, r *http.Request) {
	if err := s.trade.MarkNotificationRead(r.Context(), currentUser(r).ID, chi.URLParam(r, "id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) readAllNotifications(w http.ResponseWriter, r *http.Request) {
	if err := s.trade.MarkAllNotificationsRead(r.Context(), currentUser(r).ID); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------- demo: cổng thanh toán và vận chuyển giả

func (s *Server) demoPaymentResult(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Result string `json:"result"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Result != "SUCCESS" && in.Result != "FAILED" {
		writeError(w, r, &Error{Code: CodeValidationFailed, Message: "result phải là SUCCESS hoặc FAILED."})
		return
	}
	o, err := s.trade.PaymentResult(r.Context(), chi.URLParam(r, "orderId"), in.Result == "SUCCESS")
	respond(w, r, http.StatusOK, o, err)
}

func (s *Server) demoShipmentAdvance(w http.ResponseWriter, r *http.Request) {
	sh, err := s.trade.AdvanceShipment(r.Context(), chi.URLParam(r, "id"))
	respond(w, r, http.StatusOK, sh, err)
}

func (s *Server) demoShipmentFail(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind string `json:"kind"`
		Note string `json:"note"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	sh, err := s.trade.FailShipment(r.Context(), chi.URLParam(r, "id"), in.Kind, in.Note)
	respond(w, r, http.StatusOK, sh, err)
}
