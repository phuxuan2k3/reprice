import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { PRICING_CONFIG, missingThresholds } from "../data/pricingConfig";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { formatVND, phoneName } from "../utils/format";

const RELIABILITY_BADGE = {
  OK: { tone: "green", label: "Đạt tin cậy" },
  WEAK: { tone: "amber", label: "Chưa đạt tin cậy" },
  NOT_CONFIGURED: { tone: "gray", label: "Chưa đủ căn cứ" },
};

export default function ManagerDashboardPage() {
  const { user, loginAs, listings, transactions, referencePrice, dashboardStats } = useApp();
  const [selected, setSelected] = useState("P001");

  const isManager = user?.role === "manager";

  const rows = useMemo(
    () => listings.map((p) => ({ phone: p, ref: referencePrice(p.id) })),
    [listings, referencePrice]
  );

  const maxUpper = Math.max(
    ...rows
      .map((r) => r.ref?.usedPrice?.upperPrice)
      .filter((v) => Number.isFinite(v)),
    0
  );

  const verified = transactions.filter((t) => t.verification === "VERIFIED");
  const lastUpdated = verified.length
    ? [...verified].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0].date
    : null;

  const selectedRow = rows.find((r) => r.phone.id === selected) || rows[0];
  const selectedPhone = selectedRow?.phone;
  const selectedUsed = selectedRow?.ref?.usedPrice;

  const allPrices = rows
    .flatMap((r) => (r.ref?.usedPrice?.status === "RANGE" ? r.ref.usedPrice.prices : []))
    .filter((v) => Number.isFinite(v));
  const globalMin = allPrices.length ? Math.min(...allPrices) : 0;
  const globalMax = allPrices.length ? Math.max(...allPrices) : 1;
  const range = Math.max(globalMax - globalMin, 1);

  const missing = missingThresholds(PRICING_CONFIG);

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Dashboard giá tham khảo</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Tổng quan dữ liệu giao dịch và dải giá tham khảo (GĐ1/GĐ2) theo từng
            mẫu máy.
          </p>
        </div>
        <DataBadge />
      </div>

      {!isManager && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bạn đang xem với quyền{" "}
          <strong>{user ? "không phải Người quản lý" : "khách"}</strong>.{" "}
          <button
            onClick={() => loginAs("manager")}
            className="font-bold underline hover:no-underline"
          >
            Đăng nhập nhanh với vai trò Người quản lý
          </button>
        </div>
      )}

      {/* Chỉ số tổng quan */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tin đăng đang hoạt động" value={dashboardStats.activeListings} sub={`Tổng ${dashboardStats.totalListings} tin`} accent="red" />
        <StatCard label="Giao dịch đã duyệt" value={dashboardStats.validTransactions} sub="Đã xác minh, đủ điều kiện công bố" accent="green" />
        <StatCard label="Chờ duyệt" value={dashboardStats.pendingCount} sub="Đủ điều kiện sơ bộ, chờ quản lý" accent="amber" />
        <StatCard
          label="Mẫu có dải giá"
          value={`${dashboardStats.publishableModels}/${listings.length}`}
          sub={`Cần ≥ ${PRICING_CONFIG.minTransactions} giao dịch hợp lệ`}
          accent="blue"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span>
          Dashboard <strong>chỉ tổng hợp dữ liệu đã được quản lý duyệt</strong>.
          Giao dịch chờ duyệt, đang khiếu nại hoặc hoàn trả không được tính.
          Dữ liệu mô phỏng và dữ liệu thật được tách riêng.
        </span>
        {lastUpdated && <span>· Cập nhật gần nhất: {lastUpdated}</span>}
      </div>

      {missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          <b>Ngưỡng chưa được nhóm thống nhất:</b> {missing.join(", ")}. Hệ thống
          để trống và không tự đặt giá trị; khi thiếu ngưỡng, độ tin cậy được ghi
          là “chưa đủ căn cứ” thay vì kết luận đạt.
        </div>
      )}

      {/* Bảng dải giá tham khảo theo mẫu */}
      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-ink-900">Dải giá máy cũ (P10–P90) theo mẫu</h2>
          <DataBadge />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Mẫu điện thoại</th>
                <th className="px-4 py-3 text-center">Số GD hợp lệ</th>
                <th className="px-4 py-3 text-center">Cửa sổ</th>
                <th className="px-4 py-3 text-right">P10</th>
                <th className="px-4 py-3 text-right">P90</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-center">Độ tin cậy</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ phone, ref }) => {
                const u = ref.usedPrice;
                const rel = u.reliability || {};
                const badge = RELIABILITY_BADGE[rel.status] || RELIABILITY_BADGE.NOT_CONFIGURED;
                return (
                  <tr key={phone.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink-900">{phoneName(phone)}</span>{" "}
                      <span className="text-ink-400">{phone.storage}</span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{u.count}</td>
                    <td className="px-4 py-3 text-center text-ink-500">
                      {u.windowMonths ? `${u.windowMonths} tháng` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {u.status === "RANGE" ? formatVND(u.lowerPrice) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {u.status === "RANGE" ? formatVND(u.upperPrice) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.status === "RANGE" ? (
                        <StatusBadge tone="green">Đủ dải giá</StatusBadge>
                      ) : u.status === "INSUFFICIENT_DATA" ? (
                        <StatusBadge tone="amber">Chưa đủ {u.minTransactions}</StatusBadge>
                      ) : (
                        <StatusBadge tone="gray">Không dữ liệu</StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/phones/${phone.id}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Xem
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-5 py-3 text-xs text-ink-500">
          Dải giá dùng phân vị P10–P90 (nội suy Type 7). Cửa sổ cuốn chiếu 3 → 6 →
          12 tháng, chọn cửa sổ nhỏ nhất đạt tối thiểu {PRICING_CONFIG.minTransactions}{" "}
          giao dịch. Không cộng dồn cửa sổ, không chọn mẫu thuận lợi.
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Biểu đồ so sánh P90 */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">So sánh cận trên (P90) theo mẫu</h2>
            <DataBadge />
          </div>
          <div className="mt-5 space-y-3">
            {rows.filter((r) => r.ref.usedPrice.status === "RANGE").length === 0 && (
              <p className="text-sm text-ink-500">
                Chưa có mẫu nào đủ {PRICING_CONFIG.minTransactions} giao dịch hợp lệ.
              </p>
            )}
            {rows
              .filter((r) => r.ref.usedPrice.status === "RANGE")
              .sort((a, b) => b.ref.usedPrice.upperPrice - a.ref.usedPrice.upperPrice)
              .map(({ phone, ref }) => (
                <div key={phone.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-ink-700">{phoneName(phone)}</span>
                    <span className="font-semibold tabular-nums text-ink-900">
                      {formatVND(ref.usedPrice.upperPrice)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                      style={{ width: `${(ref.usedPrice.upperPrice / maxUpper) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Phân bố giá giao dịch của 1 mẫu */}
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink-900">Phân bố giá giao dịch hợp lệ</h2>
            <DataBadge />
          </div>
          <select
            className="input mt-4"
            value={selectedPhone?.id || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rows.map(({ phone }) => (
              <option key={phone.id} value={phone.id}>
                {phoneName(phone)} {phone.storage}
              </option>
            ))}
          </select>

          {selectedUsed?.status === "RANGE" ? (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-ink-500">
                <span>{formatVND(globalMin)}</span>
                <span>{formatVND(globalMax)}</span>
              </div>
              <div className="relative mt-2 h-16 rounded-lg bg-gray-50">
                <div
                  className="absolute top-0 h-16 rounded bg-emerald-100"
                  style={{
                    left: `${((selectedUsed.lowerPrice - globalMin) / range) * 100}%`,
                    width: `${((selectedUsed.upperPrice - selectedUsed.lowerPrice) / range) * 100}%`,
                  }}
                />
                {selectedUsed.prices.map((price, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow"
                    style={{ left: `${((price - globalMin) / range) * 100}%` }}
                    title={formatVND(price)}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Giao dịch hợp lệ ({selectedUsed.count})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-4 rounded bg-emerald-100" /> Dải P10–P90
                </span>
              </div>
              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-ink-500">
                Dải: <strong className="text-ink-900">{formatVND(selectedUsed.lowerPrice)} – {formatVND(selectedUsed.upperPrice)}</strong>{" "}
                ({selectedUsed.count} giao dịch / cửa sổ {selectedUsed.windowMonths} tháng).
                Không hiển thị P50/trung bình.
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-lg bg-gray-50 p-6 text-center">
              <p className="text-sm font-medium text-ink-700">
                Chưa đủ dữ liệu giao dịch để tham khảo giá máy cũ.
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Mẫu này có {selectedUsed?.count || 0}/{PRICING_CONFIG.minTransactions} giao dịch hợp lệ.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Giao dịch gần đây */}
      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-ink-900">Giao dịch hợp lệ gần đây</h2>
          <Link to="/manager/transactions" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Xem tất cả →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {transactions
            .filter((t) => t.verification === "VERIFIED")
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 6)
            .map((t) => {
              const phone = listings.find((p) => p.id === t.phoneId);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="font-mono text-xs font-semibold text-ink-500">{t.id}</span>
                  <span className="min-w-[180px] font-medium text-ink-900">
                    {phone ? phoneName(phone) : t.phoneId}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-brand-600">
                    {formatVND(t.price)}
                  </span>
                  <span className="text-xs text-ink-500">{t.buyer} ↔ {t.seller}</span>
                  <span className="ml-auto text-xs text-ink-400">{t.date}</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Phương pháp luận */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-ink-900">Cách tính dải giá tham khảo (GĐ2)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
          <li>Ghi nhận bản ghi chi tiết theo từng máy (giá thực tế, không gồm phí vận chuyển).</li>
          <li>Chỉ nhận giao dịch đã xác minh, đã thu tiền, có bằng chứng giao nhận và qua 3 ngày hậu giao hàng; loại đơn hủy/trả/hoàn tiền/tranh chấp.</li>
          <li>Loại trùng theo mã bản ghi chi tiết; ghép nhóm theo 4 tiêu chí Condition Score.</li>
          <li>Thử cửa sổ cuốn chiếu 3 → 6 → 12 tháng, chọn cửa sổ nhỏ nhất đạt tối thiểu {PRICING_CONFIG.minTransactions} giao dịch hợp lệ.</li>
          <li>Dải giá = [P10, P90] (nội suy Type 7); KHÔNG dùng trung bình/min–max và không hiển thị P50.</li>
          <li>Tách riêng dữ liệu thật (REAL_VERIFIED) và mô phỏng (SIMULATED); không trộn hai nguồn.</li>
        </ol>
        <div className="mt-4 flex items-center gap-2">
          <DataBadge />
          <span className="text-xs text-ink-400">
            Toàn bộ số liệu trên Dashboard là dữ liệu mô phỏng, không phải số liệu vận hành thật.
          </span>
        </div>
      </div>

      <div className="mt-6">
        <Button variant="outline" onClick={() => loginAs(isManager ? "guest" : "manager")}>
          {isManager ? "Xem với quyền khách" : "Chuyển sang vai trò Người quản lý"}
        </Button>
      </div>
    </div>
  );
}
