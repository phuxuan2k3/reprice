package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"reprice/internal/auth"
	"reprice/internal/market"
)

func viewerID(r *http.Request) string {
	if u := auth.FromContext(r.Context()); u != nil {
		return u.ID
	}
	return ""
}

func queryInt(r *http.Request, key string, def, min, max int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(key))
	if err != nil {
		return def
	}
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// allowedListingActions tính allowedActions của tin cho người đang xem (docs/api.md).
func allowedListingActions(l *market.Listing, viewer string) []string {
	acts := []string{}
	if viewer == l.Seller.ID {
		switch l.Status {
		case "DRAFT":
			acts = append(acts, "EDIT", "PUBLISH", "REMOVE")
		case "ACTIVE":
			acts = append(acts, "EDIT", "PAUSE", "REMOVE")
		case "PAUSED":
			acts = append(acts, "EDIT", "RESUME", "REMOVE")
		}
		return acts
	}
	if l.Status == "ACTIVE" {
		acts = append(acts, "BUY_NOW", "NEGOTIATE", "FAVORITE")
	}
	return acts
}

// GET /listings
func (s *Server) listListings(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := market.ListingFilter{
		Q:          q.Get("q"),
		Brand:      q.Get("brand"),
		StorageGB:  queryInt(r, "storageGb", 0, 0, 4096),
		Appearance: q.Get("appearance"),
		MinPrice:   int64(queryInt(r, "minPrice", 0, 0, 1_000_000_000)),
		MaxPrice:   int64(queryInt(r, "maxPrice", 0, 0, 1_000_000_000)),
		Province:   q.Get("province"),
		Sort:       q.Get("sort"),
		Page:       queryInt(r, "page", 1, 1, 10_000),
		PageSize:   queryInt(r, "pageSize", 20, 1, 100),
	}
	items, total, err := s.market.ListListings(r.Context(), f)
	if err != nil {
		writeError(w, r, err)
		return
	}
	viewer := viewerID(r)
	for _, l := range items {
		l.AllowedActions = allowedListingActions(l, viewer)
	}
	if items == nil {
		items = []*market.Listing{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "page": f.Page, "pageSize": f.PageSize, "total": total})
}

func (s *Server) loadListing(w http.ResponseWriter, r *http.Request) (*market.Listing, bool) {
	l, err := s.market.GetListing(r.Context(), chi.URLParam(r, "id"), viewerID(r))
	if errors.Is(err, market.ErrNotFound) {
		writeError(w, r, NewError(CodeNotFound, "Không tìm thấy tin đăng."))
		return nil, false
	}
	if err != nil {
		writeError(w, r, err)
		return nil, false
	}
	l.AllowedActions = allowedListingActions(l, viewerID(r))
	return l, true
}

// GET /listings/{id}
func (s *Server) getListing(w http.ResponseWriter, r *http.Request) {
	if l, ok := s.loadListing(w, r); ok {
		writeJSON(w, http.StatusOK, l)
	}
}

// GET /listings/{id}/reference-price?price=
func (s *Server) listingReferencePrice(w http.ResponseWriter, r *http.Request) {
	l, ok := s.loadListing(w, r)
	if !ok {
		return
	}
	price := l.Price
	if raw := r.URL.Query().Get("price"); raw != "" {
		p, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || p <= 0 {
			writeError(w, r, &Error{Code: CodeValidationFailed, Message: "Giá phải là số nguyên lớn hơn 0.",
				Details: map[string]any{"fields": map[string]string{"price": "> 0"}}})
			return
		}
		price = &p
	}
	ref, err := s.market.ReferencePrice(r.Context(), l, price, viewerID(r) == l.Seller.ID, s.clock.Now())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ref)
}

// GET /price-ranges/{versionId}
func (s *Server) getPriceRange(w http.ResponseWriter, r *http.Request) {
	v, err := s.market.PriceRange(r.Context(), chi.URLParam(r, "versionId"))
	if errors.Is(err, market.ErrNotFound) {
		writeError(w, r, NewError(CodeNotFound, "Không tìm thấy dải giá."))
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}
