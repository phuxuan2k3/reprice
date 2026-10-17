package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"reprice/internal/market"
)

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		if u == nil {
			writeError(w, r, NewError(CodeUnauthenticated, "Bạn cần đăng nhập."))
			return
		}
		if !u.IsAdmin {
			writeError(w, r, NewError(CodeForbidden, "Chỉ quản trị viên được dùng chức năng này."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) adminDashboard(w http.ResponseWriter, r *http.Request) {
	if err := s.market.RecomputeClusters(r.Context()); err != nil {
		writeError(w, r, err)
		return
	}
	d, err := s.market.Dashboard(r.Context(), s.clock.Now())
	respond(w, r, http.StatusOK, d, err)
}

func (s *Server) adminReferenceList(w http.ResponseWriter, r *http.Request) {
	if err := s.market.RecomputeClusters(r.Context()); err != nil {
		writeError(w, r, err)
		return
	}
	q := r.URL.Query()
	f := market.RefFilter{
		Status: q.Get("status"), DataSource: q.Get("dataSource"), Flag: q.Get("flag"), ClusterID: q.Get("clusterId"),
		VariantID: q.Get("variantId"), ConditionKey: q.Get("conditionKey"), From: q.Get("from"), To: q.Get("to"), Q: q.Get("q"),
		Page: queryInt(r, "page", 1, 1, 10_000), PageSize: queryInt(r, "pageSize", 50, 1, 200),
	}
	items, total, err := s.market.ListReferenceTransactions(r.Context(), f)
	respond(w, r, http.StatusOK, map[string]any{"items": items, "page": f.Page, "pageSize": f.PageSize, "total": total}, err)
}

func (s *Server) adminReferenceGet(w http.ResponseWriter, r *http.Request) {
	d, err := s.market.GetReferenceTransaction(r.Context(), chi.URLParam(r, "id"))
	respond(w, r, http.StatusOK, d, err)
}

func (s *Server) adminReferenceDecide(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	ranges, err := s.market.Decide(r.Context(), id, currentUser(r).ID, in.Action, in.Reason, s.clock.Now())
	if err != nil {
		writeError(w, r, err)
		return
	}
	d, err := s.market.GetReferenceTransaction(r.Context(), id)
	if ranges == nil {
		ranges = []*market.RangeVersion{}
	}
	respond(w, r, http.StatusOK, map[string]any{"transaction": d, "recalculatedRanges": ranges}, err)
}

func (s *Server) adminPricingConfig(w http.ResponseWriter, r *http.Request) {
	c, err := s.market.PricingConfig(r.Context())
	respond(w, r, http.StatusOK, c, err)
}

// PUT /admin/pricing-config: hiện chỉ sửa zThreshold; các ngưỡng độ tin cậy khác chờ nhóm chốt.
func (s *Server) adminSetPricingConfig(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ZThreshold *float64 `json:"zThreshold"`
		Reason     string   `json:"reason"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := s.market.SetZThreshold(r.Context(), currentUser(r).ID, in.ZThreshold, in.Reason, s.clock.Now()); err != nil {
		writeError(w, r, err)
		return
	}
	s.adminPricingConfig(w, r)
}

type auditRow struct {
	Admin      string `json:"admin"`
	Action     string `json:"action"`
	EntityType string `json:"entityType"`
	EntityID   string `json:"entityId"`
	Reason     string `json:"reason"`
	Before     any    `json:"before"`
	After      any    `json:"after"`
	CreatedAt  string `json:"createdAt"`
}

func (s *Server) adminAuditLogs(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `SELECT u.full_name, l.action, l.entity_type, l.entity_id, l.reason, l.before, l.after,
		to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM admin_audit_logs l JOIN users u ON u.id = l.admin_id
		WHERE ($1 = '' OR l.entity_type = $1) AND ($2 = '' OR l.entity_id = $2)
		ORDER BY l.created_at DESC LIMIT 100`, r.URL.Query().Get("entityType"), r.URL.Query().Get("entityId"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	defer rows.Close()
	out := []auditRow{}
	for rows.Next() {
		var a auditRow
		if err := rows.Scan(&a.Admin, &a.Action, &a.EntityType, &a.EntityID, &a.Reason, &a.Before, &a.After, &a.CreatedAt); err != nil {
			writeError(w, r, err)
			return
		}
		out = append(out, a)
	}
	respond(w, r, http.StatusOK, map[string]any{"items": out}, rows.Err())
}
