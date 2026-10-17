import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApiListings } from "../api/hooks";
import { sameRegion } from "../api/adapters";
import ProductCard from "../components/ProductCard";
import EmptyState from "../components/EmptyState";
import DataBadge from "../components/DataBadge";
import { BRANDS, CONDITIONS, REGIONS, STORAGES } from "../data/phones";

const SORTS = [
  { value: "price-asc", label: "Giá tăng dần" },
  { value: "price-desc", label: "Giá giảm dần" },
  { value: "newest", label: "Mới đăng gần đây" },
];

const EMPTY_FILTERS = {
  brand: "",
  model: "",
  storage: "",
  condition: "",
  region: "",
  priceMin: "",
  priceMax: "",
};

export default function PhonesPage() {
  const { listings, loading, error } = useApiListings();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const regionParam = params.get("region") || "";

  /* Bộ lọc đang soạn (form) và bộ lọc đã áp dụng */
  const [draft, setDraft] = useState({ ...EMPTY_FILTERS, region: regionParam });
  const [applied, setApplied] = useState({ ...EMPTY_FILTERS, region: regionParam });
  const [sort, setSort] = useState("newest");
  const [keyword, setKeyword] = useState(q);

  /* Đồng bộ khu vực/từ khóa khi URL thay đổi (VD: tìm kiếm từ trang chủ). */
  useEffect(() => {
    if (regionParam !== applied.region) {
      setApplied((a) => ({ ...a, region: regionParam }));
      setDraft((d) => ({ ...d, region: regionParam }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionParam]);

  useEffect(() => {
    setKeyword(q);
  }, [q]);

  /* Danh sách lựa chọn phụ thuộc */
  const models = useMemo(() => {
    if (!draft.brand) return [];
    return [
      ...new Set(
        listings
          .filter((p) => p.brand === draft.brand && p.model)
          .map((p) => p.model)
      ),
    ];
  }, [listings, draft.brand]);

  const storages = useMemo(() => {
    if (draft.brand && draft.model) {
      const list = [
        ...new Set(
          listings
            .filter((p) => p.brand === draft.brand && p.model === draft.model && p.storage)
            .map((p) => p.storage)
        ),
      ];
      if (list.length > 0) return list;
    }
    return STORAGES;
  }, [listings, draft.brand, draft.model]);

  const updateDraft = (key, value) => {
    setDraft((d) => {
      // Đổi hãng -> đặt lại model/dung lượng đã chọn (phụ thuộc)
      if (key === "brand") return { ...d, brand: value, model: "", storage: "" };
      if (key === "model") return { ...d, model: value, storage: "" };
      return { ...d, [key]: value };
    });
  };

  const applyFilters = () => {
    setApplied({ ...draft });
  };

  const clearFilters = () => {
    setDraft({ ...EMPTY_FILTERS });
    setApplied({ ...EMPTY_FILTERS });
    const next = new URLSearchParams(params);
    next.delete("region");
    setParams(next, { replace: true });
  };

  const removeChip = (key) => {
    const cleared = { ...applied, [key]: "" };
    setApplied(cleared);
    setDraft((d) => ({ ...d, [key]: key === "region" ? "" : d[key] === applied[key] ? "" : d[key] }));
    if (key === "region") {
      const next = new URLSearchParams(params);
      next.delete("region");
      setParams(next, { replace: true });
    }
  };

  const results = useMemo(() => {
    let list = listings.filter((p) => p.listingStatus !== "SOLD");
    const kw = (q || "").trim().toLowerCase();
    if (kw) {
      list = list.filter((p) =>
        `${p.brand} ${p.model} ${p.storage}`.toLowerCase().includes(kw)
      );
    }
    if (applied.brand) list = list.filter((p) => p.brand === applied.brand);
    if (applied.model) list = list.filter((p) => p.model === applied.model);
    if (applied.storage) list = list.filter((p) => p.storage === applied.storage);
    if (applied.condition) list = list.filter((p) => p.condition === applied.condition);
    if (applied.region) list = list.filter((p) => sameRegion(p.region, applied.region));
    const min = Number(applied.priceMin);
    const max = Number(applied.priceMax);
    if (applied.priceMin !== "" && Number.isFinite(min) && min >= 0) {
      list = list.filter((p) => p.price >= min);
    }
    if (applied.priceMax !== "" && Number.isFinite(max) && max >= 0) {
      list = list.filter((p) => p.price <= max);
    }
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (sort === "newest") sorted.sort((a, b) => a.listedMinutesAgo - b.listedMinutesAgo);
    return sorted;
  }, [listings, q, applied, sort]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const onSearch = (e) => {
    e.preventDefault();
    updateParam("q", keyword.trim());
  };

  const chips = [];
  if (applied.brand) chips.push({ key: "brand", label: `Hãng: ${applied.brand}` });
  if (applied.model) chips.push({ key: "model", label: `Model: ${applied.model}` });
  if (applied.storage) chips.push({ key: "storage", label: `Dung lượng: ${applied.storage}` });
  if (applied.condition) chips.push({ key: "condition", label: `Tình trạng: ${applied.condition}` });
  if (applied.region) chips.push({ key: "region", label: `Khu vực: ${applied.region}` });
  if (applied.priceMin !== "" || applied.priceMax !== "") {
    chips.push({
      key: "price",
      label: `Giá: ${applied.priceMin || "0"} – ${applied.priceMax ? `${Number(applied.priceMax).toLocaleString("vi-VN")}₫` : "∞"}`,
    });
  }

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Danh sách điện thoại</h1>
          <p className="mt-1 text-sm text-ink-500">
            Tìm và so sánh giá điện thoại đã qua sử dụng trên RePrice.
          </p>
        </div>
        <DataBadge />
      </div>

      {/* Thanh tìm kiếm & lọc */}
      <div className="card mt-6 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo tên điện thoại, dung lượng..."
            className="input flex-1"
            aria-label="Tìm điện thoại"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
          >
            Tìm kiếm
          </button>
        </form>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="input"
            value={draft.brand}
            onChange={(e) => updateDraft("brand", e.target.value)}
            aria-label="Lọc theo hãng"
          >
            <option value="">Tất cả hãng</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            className="input"
            value={draft.model}
            onChange={(e) => updateDraft("model", e.target.value)}
            disabled={!draft.brand}
            aria-label="Lọc theo model"
          >
            <option value="">{draft.brand ? "Tất cả model" : "Chọn hãng trước"}</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            className="input"
            value={draft.storage}
            onChange={(e) => updateDraft("storage", e.target.value)}
            aria-label="Lọc theo dung lượng"
          >
            <option value="">Mọi dung lượng</option>
            {storages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="input"
            value={draft.condition}
            onChange={(e) => updateDraft("condition", e.target.value)}
            aria-label="Lọc theo tình trạng"
          >
            <option value="">Mọi tình trạng</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="input"
            value={draft.region}
            onChange={(e) => updateDraft("region", e.target.value)}
            aria-label="Lọc theo khu vực"
          >
            <option value="">Toàn quốc</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              className="input"
              placeholder="Giá từ (₫)"
              value={draft.priceMin}
              onChange={(e) => updateDraft("priceMin", e.target.value)}
              aria-label="Giá tối thiểu"
            />
            <span className="text-ink-400">–</span>
            <input
              type="number"
              min="0"
              className="input"
              placeholder="Đến (₫)"
              value={draft.priceMax}
              onChange={(e) => updateDraft("priceMax", e.target.value)}
              aria-label="Giá tối đa"
            />
          </div>
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sắp xếp"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Áp dụng
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-gray-50"
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      {/* Chip bộ lọc đang áp dụng */}
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-500">Đang lọc:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => removeChip(chip.key)}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
              title="Xóa bộ lọc này"
            >
              {chip.label}
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Số kết quả */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          <strong className="text-ink-900">{loading ? "…" : results.length}</strong>{" "}
          kết quả{q ? ` cho “${q}”` : ""}
        </p>
      </div>

      {/* Danh sách kết quả */}
      {loading ? (
        <p className="mt-6 text-sm text-ink-500">Đang tải danh sách điện thoại…</p>
      ) : error ? (
        <EmptyState title="Chưa tải được danh sách điện thoại." description={error.message} />
      ) : results.length === 0 ? (
        <EmptyState
          title="Không tìm thấy điện thoại phù hợp với bộ lọc."
          description="Thử bỏ bớt bộ lọc, nhập từ khóa khác hoặc xóa toàn bộ bộ lọc."
        />
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProductCard key={p.id} phone={p} />
          ))}
        </div>
      )}
    </div>
  );
}
