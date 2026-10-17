import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { PROVINCES } from "../data/regions";

/**
 * Màn hình chọn khu vực.
 * - Hiển thị khi người dùng chưa lưu khu vực hợp lệ (lần đầu truy cập trang chủ).
 * - Có thể mở lại dạng hộp thoại để đổi khu vực từ trang chủ.
 * Không dùng GPS, không tự nhận vị trí người dùng.
 */
export default function RegionPicker({ onClose }) {
  const { region, setRegion } = useApp();
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState(region || "");

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return PROVINCES;
    return PROVINCES.filter((p) => p.toLowerCase().includes(q));
  }, [keyword]);

  const onExplore = () => {
    if (!selected) return;
    setRegion(selected);
    if (onClose) onClose();
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-lift sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
          <svg
            className="h-6 w-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <h1 className="mt-4 text-center text-2xl font-extrabold text-ink-900">
          Bạn muốn mua bán điện thoại ở khu vực nào?
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-ink-500">
          Chọn khu vực để khám phá điện thoại đang được đăng bán gần bạn và
          thuận tiện hơn khi giao dịch.
        </p>

        {/* Tìm kiếm tỉnh/thành phố */}
        <div className="relative mt-6">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm tỉnh / thành phố..."
            className="input pl-10"
          />
        </div>

        {/* Danh sách tỉnh/thành phố */}
        <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-gray-200 p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">
              Không tìm thấy tỉnh/thành phố &ldquo;{keyword}&rdquo;
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {filtered.map((province) => {
                const active = selected === province;
                return (
                  <button
                    key={province}
                    type="button"
                    onClick={() => setSelected(province)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50/50"
                    }`}
                  >
                    {province}
                    {active && (
                      <svg
                        className="ml-auto h-4 w-4 shrink-0 text-brand-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onExplore}
          disabled={!selected}
          className="mt-5 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Khám phá điện thoại
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-lg px-4 py-2 text-sm font-medium text-ink-500 transition hover:bg-gray-100"
          >
            Đóng
          </button>
        )}
      </div>
    </div>
  );
}
