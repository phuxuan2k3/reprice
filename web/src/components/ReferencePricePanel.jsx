import { useState } from "react";
import { formatVND, formatDate } from "../utils/format";
import DataBadge from "./DataBadge";
import { compareToRange } from "../data/pricingEngine";

/**
 * BẢNG GIÁ THAM KHẢO RePrice — hai khu vực ĐỘC LẬP, đặt cạnh nhau khi đủ chỗ:
 *   1) "Giá máy mới tại các cửa hàng"        — NO_DATA | SINGLE_PRICE | RANGE.
 *   2) "Các máy tương tự đã bán với giá"      — NO_DATA | INSUFFICIENT_DATA | RANGE.
 *
 * Mỗi khu vực: tiêu đề → dải giá thấp nhất–cao nhất → thanh dải giá trực quan
 * (hai đầu mốc của dải + marker giá đang rao, nhãn đặt phía trên marker) →
 * trạng thái vị trí giá → (tuỳ chọn) danh sách chi tiết.
 *
 * Giao diện CHỈ hiển thị kết quả do engine/DTO trả về (P10/P90, số giao dịch,
 * cửa sổ, khoảng dữ liệu, vị trí giá, danh sách nguồn/các mức giá đã dùng, lời
 * nhắc). KHÔNG tự tính phân vị/độ lệch chuẩn/Z-score. KHÔNG hiển thị P50, trung
 * vị, trung bình, độ lệch chuẩn hay Z. KHÔNG tự tạo tên cửa hàng/giá không có.
 *
 * Hai nút "Xem giá từng cửa hàng" và "Xem dữ liệu so sánh" chỉ xuất hiện khi
 * dữ liệu tương ứng đã có sẵn, và mở ra nội dung thật (không phải nút trang trí).
 */

/** Xanh navy → xanh ngọc cho thanh dải giá; đỏ RePrice cho marker. */
const NAVY = "#0F2A47";
const TEAL = "#0FB5A6";

const POSITION_TONE = {
  BELOW_RANGE: "text-emerald-700",
  IN_RANGE: "text-ink-600",
  ABOVE_RANGE: "text-amber-700",
  UNKNOWN: "text-ink-500",
};

/** Nhãn vị trí cho khu vực "giá máy mới" (khác "lịch sử" của máy cũ). */
const NEW_POSITION_TEXT = {
  BELOW_RANGE: "Dưới khoảng giá máy mới",
  IN_RANGE: "Trong khoảng giá máy mới",
  ABOVE_RANGE: "Trên khoảng giá máy mới",
  UNKNOWN: "Chưa đủ dữ liệu để so sánh",
};

const clampPct = (v) => Math.max(0, Math.min(100, v));

/**
 * Dựng thang đo phần trăm cho thanh dải giá. Miền giá mở rộng để luôn chứa cả
 * giá đang rao, nhờ đó marker hiển thị đúng vị trí kể cả khi giá nằm ngoài dải.
 * KHÔNG thay đổi giá trị dải [P10, P90] — chỉ ánh xạ sang toạ độ hiển thị.
 */
function buildScale(lower, upper, price) {
  const values = [lower, upper].filter(Number.isFinite);
  if (Number.isFinite(price)) values.push(price);
  if (!values.length) return null;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.12 : Math.max(hi * 0.08, 1);
  lo -= pad;
  hi += pad;
  return { toPct: (v) => clampPct(((v - lo) / (hi - lo)) * 100) };
}

/** Neo nhãn quanh vị trí marker để không bị cắt ở hai mép thanh giá. */
function anchorStyle(pct) {
  if (pct <= 14) return { left: `${pct}%`, transform: "translateX(0)" };
  if (pct >= 86) return { left: `${pct}%`, transform: "translateX(-100%)" };
  return { left: `${pct}%`, transform: "translateX(-50%)" };
}

function RangeBar({ lower, upper, price, markerLabel }) {
  const scale = buildScale(lower, upper, price);
  if (!scale) return null;

  const { toPct } = scale;
  const single =
    !Number.isFinite(lower) || !Number.isFinite(upper) || Math.abs(upper - lower) < 1;
  const hasPrice = Number.isFinite(price);
  const lowerPct = toPct(lower);
  const upperPct = toPct(upper);
  const pricePct = hasPrice ? toPct(price) : null;

  let side = "UNKNOWN";
  if (hasPrice && Number.isFinite(lower) && Number.isFinite(upper)) {
    if (single) {
      side =
        price < lower - 0.5 ? "BELOW_RANGE" : price > upper + 0.5 ? "ABOVE_RANGE" : "IN_RANGE";
    } else {
      side = price < lower ? "BELOW_RANGE" : price > upper ? "ABOVE_RANGE" : "IN_RANGE";
    }
  }
  const arrow = side === "BELOW_RANGE" ? "↓ " : side === "ABOVE_RANGE" ? "↑ " : "";

  return (
    <div className="relative select-none pt-9">
      {hasPrice && (
        <div className="absolute top-0 z-10" style={anchorStyle(pricePct)}>
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
            <span className="text-white/80">{arrow || "◆"}</span>
            {markerLabel}: {formatVND(price)}
          </span>
        </div>
      )}

      <div className="relative h-2.5 rounded-full bg-gray-100">
        {!single && (
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${lowerPct}%`,
              width: `${Math.max(upperPct - lowerPct, 0.5)}%`,
              background: `linear-gradient(90deg, ${NAVY}, ${TEAL})`,
            }}
          />
        )}

        {/* Hai đầu mốc của dải giá */}
        <span
          className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-ink-700"
          style={{ left: `${lowerPct}%` }}
        />
        {!single && (
          <span
            className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-ink-700"
            style={{ left: `${upperPct}%` }}
          />
        )}

        {/* Marker giá đang rao */}
        {hasPrice && (
          <span
            className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 ring-2 ring-white"
            style={{ left: `${pricePct}%` }}
          />
        )}
      </div>
    </div>
  );
}

/** Nút mở/đóng nội dung chi tiết — chỉ dùng khi đã có dữ liệu để mở. */
function DetailToggle({ open, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-700"
    >
      <svg
        className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      {children}
    </button>
  );
}

function ReviewPrompt({ reference }) {
  if (!reference?.showReviewPrompt || !reference.promptTitle) return null;
  const low = reference.reviewDirection === "LOW_PRICE";
  return (
    <div
      className={`mt-3 rounded-lg p-3 text-xs leading-relaxed ${
        low ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
      }`}
    >
      <div className="font-semibold">{reference.promptTitle}</div>
      <div className="mt-0.5">{reference.promptBody}</div>
    </div>
  );
}

function BlockShell({ title, children }) {
  return (
    <div className="flex flex-col rounded-xl bg-gray-50 p-4">
      <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
      {children}
    </div>
  );
}

/** Danh sách giá từng cửa hàng (dữ liệu đã có trong DTO `newPrice.sources`). */
function StoreList({ sources }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
      <ul className="divide-y divide-gray-100">
        {sources.map((s) => (
          <li key={s.id} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-xs text-ink-700">
              {s.sourceName || "Nguồn"}
              {s.branch ? ` · ${s.branch}` : ""}
            </span>
            <span className="shrink-0 text-xs font-semibold text-ink-900">
              {formatVND(s.listedPrice)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        Giá niêm yết còn hàng, xác minh trong 24 giờ. Chi nhánh cùng một chuỗi chỉ
        tính là một nguồn độc lập.
      </p>
    </div>
  );
}

/** Danh sách các mức giá đã dùng để tính dải (dữ liệu `usedPrice.prices`). */
function ComparisonList({ used }) {
  const prices = used?.prices || [];
  const d = used?.dateRange;
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[11px] text-ink-500">
        {used.count} giao dịch{d?.from ? ` · ${formatDate(d.from)} – ${formatDate(d.to)}` : ""}
        {used.windowMonths ? ` · cửa sổ ${used.windowMonths} tháng` : ""}
      </p>
      <ol className="mt-2 max-h-56 space-y-1 overflow-auto pr-1">
        {prices.map((p, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 rounded px-2 py-1 text-xs odd:bg-gray-50"
          >
            <span className="tabular-nums text-ink-400">#{i + 1}</span>
            <span className="font-medium tabular-nums text-ink-800">{formatVND(p)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        Các mức giá đã dùng để tính dải (đã sắp xếp tăng dần). Dải hiển thị là
        khoảng giữa phân vị thấp và cao, không phải giá thấp nhất/cao nhất.
      </p>
    </div>
  );
}

function NewPriceBlock({ newP, phone, markerLabel }) {
  const [open, setOpen] = useState(false);
  const title = "Giá máy mới tại các cửa hàng";

  if (!newP || newP.status === "NO_DATA") {
    return (
      <BlockShell title={title}>
        <p className="mt-2 text-sm text-ink-600">
          Chưa có nguồn giá máy mới phù hợp (đúng model/dung lượng, còn hàng, niêm
          yết và xác minh trong 24 giờ).
        </p>
      </BlockShell>
    );
  }

  const single = newP.status === "SINGLE_PRICE";
  const lower = single ? newP.singlePrice : newP.lowerPrice;
  const upper = single ? newP.singlePrice : newP.upperPrice;
  const sources = newP.sources || [];

  // Dùng lại đúng quy tắc so sánh của engine (below / in / above range).
  const side = compareToRange(Number(phone?.price), {
    status: "RANGE",
    lowerPrice: lower,
    upperPrice: upper,
  });

  return (
    <BlockShell title={title}>
      <div className="mt-1 text-xl font-bold tracking-tight text-ink-900">
        {single
          ? formatVND(newP.singlePrice)
          : `${formatVND(newP.lowerPrice)} – ${formatVND(newP.upperPrice)}`}
      </div>
      <p className="mt-1 text-xs text-ink-500">
        {single ? "1 nguồn độc lập" : `${newP.sourcesCount} nguồn độc lập`}
        {newP.verifiedAt ? ` · cập nhật ${formatDate(newP.verifiedAt)}` : ""}
      </p>

      <RangeBar lower={lower} upper={upper} price={phone?.price} markerLabel={markerLabel} />

      <p className={`mt-2 text-xs font-medium ${POSITION_TONE[side] || POSITION_TONE.UNKNOWN}`}>
        {NEW_POSITION_TEXT[side] || NEW_POSITION_TEXT.UNKNOWN}
      </p>

      {sources.length > 0 && (
        <>
          <div className="mt-3">
            <DetailToggle open={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Ẩn giá từng cửa hàng" : "Xem giá từng cửa hàng"}
            </DetailToggle>
          </div>
          {open && <StoreList sources={sources} />}
        </>
      )}
    </BlockShell>
  );
}

function UsedPriceBlock({ reference, phone, markerLabel, role }) {
  const [open, setOpen] = useState(false);
  const used = reference?.usedPrice;
  const title =
    role === "seller"
      ? "Các máy giống máy của bạn đã bán với giá"
      : "Các máy tương tự đã bán với giá";

  if (!used) return null;

  if (used.status === "NO_DATA" || used.status === "INSUFFICIENT_DATA") {
    return (
      <BlockShell title={title}>
        <p className="mt-2 text-sm text-ink-600">
          {used.status === "NO_DATA"
            ? "Chưa có giao dịch máy cũ hợp lệ để tham khảo."
            : `Chưa đủ dữ liệu giao dịch để tham khảo giá máy cũ (hiện có ${used.count}/${used.minTransactions}).`}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Giao dịch chỉ được tính khi đã xác minh, thu tiền, giao nhận đủ bằng chứng
          và qua 3 ngày hậu giao hàng.
        </p>
      </BlockShell>
    );
  }

  const d = used.dateRange;
  const prices = used.prices || [];

  return (
    <BlockShell title={title}>
      <div className="mt-1 text-xl font-bold tracking-tight text-ink-900">
        {formatVND(used.lowerPrice)} – {formatVND(used.upperPrice)}
      </div>
      <p className="mt-1 text-xs text-ink-500">
        <b className="text-ink-700">{used.count}</b> giao dịch hợp lệ
        {d ? ` · ${formatDate(d.from)} – ${formatDate(d.to)}` : ""}
      </p>

      <RangeBar
        lower={used.lowerPrice}
        upper={used.upperPrice}
        price={phone?.price}
        markerLabel={markerLabel}
      />

      <p
        className={`mt-2 text-xs font-medium ${
          POSITION_TONE[reference.positionLabel] || POSITION_TONE.UNKNOWN
        }`}
      >
        {reference.positionText}
      </p>

      {prices.length > 0 && (
        <>
          <div className="mt-3">
            <DetailToggle open={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Ẩn dữ liệu so sánh" : "Xem dữ liệu so sánh"}
            </DetailToggle>
          </div>
          {open && <ComparisonList used={used} />}
        </>
      )}

      <ReviewPrompt reference={reference} />
    </BlockShell>
  );
}

export default function ReferencePricePanel({
  phone,
  reference,
  role = "buyer",
  markerLabel,
}) {
  const marker = markerLabel || (role === "seller" ? "Giá bạn nhập" : "Giá đang rao");
  const simulated = (reference?.dataSource || reference?.dataProvenance) === "SIMULATED";

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h3 className="text-base font-semibold text-ink-900">Giá tham khảo RePrice</h3>
        {simulated && <DataBadge />}
      </div>

      {/* Hai khu vực độc lập: cạnh nhau khi đủ chiều rộng, xếp dọc trên mobile. */}
      <div
        className="grid gap-4 px-5 pb-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
      >
        <NewPriceBlock newP={reference?.newPrice} phone={phone} markerLabel={marker} />
        <UsedPriceBlock
          reference={reference}
          phone={phone}
          markerLabel={marker}
          role={role}
        />
      </div>
    </div>
  );
}
