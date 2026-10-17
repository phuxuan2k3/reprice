import { useState } from "react";
import { DEMO_CASES, evaluateDemoCase } from "../data/demoFixture";
import { PRICING_CONFIG } from "../data/pricingConfig";
import { formatVND } from "../utils/format";
import DataBadge from "../components/DataBadge";

/**
 * CHẾ ĐỘ DEMO 3 TRƯỜNG HỢP GIÁ (Section X).
 *
 * Dữ liệu: iPhone 13, 128GB, màu đen — fixture 42 giao dịch MÔ PHỎNG cho
 * P10 = 10.000.000 và P90 = 12.000.000. Không dùng dữ liệu production.
 *
 * Ngưỡng Z dưới đây CHỈ dùng cho demo/kiểm thử, KHÔNG phải giá trị cấu hình
 * production (production vẫn để zThreshold = null).
 */

const POS_TONE = {
  IN_RANGE: "bg-gray-100 text-ink-700",
  BELOW_RANGE: "bg-emerald-50 text-emerald-700",
  ABOVE_RANGE: "bg-amber-50 text-amber-700",
  UNKNOWN: "bg-gray-100 text-ink-500",
};

function formatNewPrice(np) {
  if (!np || np.status === "NO_DATA") return "Chưa có dữ liệu";
  if (np.status === "SINGLE_PRICE") return formatVND(np.singlePrice);
  return `${formatVND(np.lowerPrice)} – ${formatVND(np.upperPrice)}`;
}

export default function PriceDemoPage() {
  const [z, setZ] = useState(""); // "" = null (chưa thiết lập)
  const config = z ? { ...PRICING_CONFIG, zThreshold: Number(z) } : PRICING_CONFIG;
  const results = DEMO_CASES.map((c) => evaluateDemoCase(c.key, { config }));

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Demo: ba trường hợp giá</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            iPhone 13 · 128GB · màu đen — fixture 42 giao dịch để P10 = 10.000.000 và P90 =
            12.000.000 (phân vị Type 7, cửa sổ 3 tháng).
          </p>
        </div>
        <DataBadge />
      </div>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Dữ liệu minh họa (mô phỏng).</strong> Không phải giao dịch thật của RePrice.
        Ngưỡng Z dưới đây chỉ phục vụ trình diễn/kiểm thử — cấu hình production vẫn để
        “Chưa thiết lập”.
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink-700">Ngưỡng Z cho demo:</span>
        {[
          { value: "", label: "Chưa thiết lập (null)" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
        ].map((o) => (
          <button
            key={o.value}
            onClick={() => setZ(o.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              z === o.value ? "bg-brand-500 text-white" : "bg-gray-100 text-ink-700 hover:bg-gray-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {results.map((r) => (
          <div key={r.case.key} className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-ink-900">{r.case.label}</div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${POS_TONE[r.positionLabel]}`}>
                {r.positionLabel}
              </span>
            </div>

            <div>
              <div className="text-xs text-ink-500">Giá đang rao</div>
              <div className="text-lg font-bold text-ink-900">{formatVND(r.listingPrice)}</div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-ink-500">GĐ1 · Giá máy mới tại các cửa hàng</div>
              <div className="text-sm font-semibold text-ink-900">{formatNewPrice(r.newPrice)}</div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-ink-500">
                GĐ2 · Các máy giống sản phẩm này đã bán với giá
              </div>
              <div className="text-sm font-semibold text-ink-900">
                {r.usedPrice.status === "RANGE"
                  ? `${formatVND(r.usedPrice.lowerPrice)} – ${formatVND(r.usedPrice.upperPrice)}`
                  : r.usedPrice.status === "INSUFFICIENT_DATA"
                    ? `Chưa đủ (${r.usedPrice.count}/${r.usedPrice.minTransactions})`
                    : "Chưa có dữ liệu"}
              </div>
              {r.usedPrice.status === "RANGE" && (
                <div className="mt-0.5 text-[11px] text-ink-400">
                  {r.usedPrice.count} giao dịch · cửa sổ {r.usedPrice.windowMonths} tháng
                </div>
              )}
            </div>

            <div className="text-sm text-ink-700">{r.positionText}</div>

            {r.showReviewPrompt ? (
              <div
                className={`rounded-lg p-3 text-xs ${
                  r.reviewDirection === "LOW_PRICE"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                <div className="font-semibold">{r.promptTitle}</div>
                <div className="mt-0.5">{r.promptBody}</div>
              </div>
            ) : (
              <div className="text-[11px] text-ink-400">Không có lời nhắc kiểm tra thêm.</div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-ink-500">
        Quy tắc: giá bằng đúng P10 hoặc P90 được xem là trong khoảng. Khi ngưỡng Z chưa
        thiết lập, hệ thống vẫn tính dải và gắn nhãn vị trí nhưng KHÔNG hiện lời nhắc.
        Lời nhắc chỉ xuất hiện khi giá ngoài dải, độ lệch chuẩn mẫu &gt; 0 và |Z| vượt ngưỡng.
      </p>
    </div>
  );
}
