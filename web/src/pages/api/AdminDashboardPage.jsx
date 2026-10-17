import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { adminApi } from "../../api/client";
import { ORDER_STATUS, REFERENCE_STATUS, conditionKeyLabel } from "../../api/labels";
import { useAction, useResource } from "../../api/useResource";
import Button from "../../components/Button";
import AccessNotice from "../../components/AccessNotice";
import { formatDateTime, formatVND } from "../../utils/format";

const THRESHOLD_LABEL = {
  zThreshold: "Ngưỡng Z cho lời nhắc giá",
  maxSellerConcentration: "Tỷ trọng tối đa của một người bán",
  maxClusterConcentration: "Tỷ trọng tối đa của một cụm",
  minIndependentBuyers: "Số người mua độc lập tối thiểu",
  minIndependentSellers: "Số người bán độc lập tối thiểu",
};

/** Dashboard QTV (UC72) + cấu hình ngưỡng (UC74) + nhật ký quản trị, dữ liệu từ backend. */
export default function AdminDashboardPage() {
  const { user, loginAs, apiSession, showToast } = useApp();
  const isAdmin = user?.role === "manager";
  const dash = useResource(() => (isAdmin ? adminApi.dashboard() : Promise.resolve(null)), [apiSession]);
  const config = useResource(() => (isAdmin ? adminApi.config() : Promise.resolve(null)), [apiSession]);
  const audit = useResource(() => (isAdmin ? adminApi.auditLogs() : Promise.resolve(null)), [apiSession]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));
  const [confirmReset, setConfirmReset] = useState(false);

  if (!isAdmin) {
    return (
      <AccessNotice
        requiredRole="manager"
        requiredLabel="Người quản lý"
        title="Trang dành cho quản trị viên"
        description="Dashboard dữ liệu giá chỉ dành cho quản trị viên."
        onLogin={() => loginAs("manager")}
      />
    );
  }
  const d = dash.data;
  const reload = () => {
    dash.reload();
    config.reload();
    audit.reload();
  };

  const ref = d?.referenceByStatus || {};
  const tiles = d
    ? [
        ["Tài khoản", d.usersTotal, null],
        ["Tin đang bán", d.activeListings, null],
        ["Giao dịch đủ điều kiện", ref.ELIGIBLE || 0, "/manager/transactions?status=ELIGIBLE"],
        ["Chờ xác minh", ref.PENDING_VERIFICATION || 0, "/manager/transactions?status=PENDING_VERIFICATION"],
        ["Cờ nghi vấn đang mở", d.openFlags, "/manager/transactions?status=PENDING_VERIFICATION"],
        ["Cụm giao dịch liên quan", d.clusters, "/manager/transactions"],
      ]
    : [];

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Dashboard dữ liệu giá</h1>
          <p className="mt-1 text-sm text-ink-500">Số liệu lấy trực tiếp từ hệ thống. Dữ liệu mô phỏng được ghi rõ ở từng chỗ.</p>
        </div>
        <Link to="/manager/transactions"><Button>Kiểm tra giao dịch</Button></Link>
      </div>
      {dash.error && <p className="mt-4 text-sm text-red-600">{dash.error.message}</p>}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value, to]) => {
          const body = (
            <>
              <div className="text-xs text-ink-500">{label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{value}</div>
            </>
          );
          return to ? (
            <Link key={label} to={to} className="card p-4 transition hover:shadow-lift">{body}</Link>
          ) : (
            <div key={label} className="card p-4">{body}</div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card min-w-0 p-5">
            <h2 className="font-semibold text-ink-900">Dải giá máy cũ đang công bố (P10–P90)</h2>
            {!d ? null : d.currentRanges.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Chưa nhóm máy nào đủ 35 giao dịch hợp lệ.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ink-500">
                      <th className="py-2 pr-3">Nhóm máy</th>
                      <th className="py-2 pr-3 text-right">Dải giá</th>
                      <th className="py-2 pr-3 text-right">Giao dịch</th>
                      <th className="py-2">Tính lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.currentRanges.map((r) => (
                      <tr key={r.versionId} className="border-b border-gray-100">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{r.title}</div>
                          <div className="text-xs text-ink-500">
                            {conditionKeyLabel(r.conditionKey)} · {r.dataSource === "SIMULATED" ? "dữ liệu mô phỏng" : "giao dịch thật"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums">{formatVND(r.p10)} – {formatVND(r.p90)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.transactionCount} · {r.windowMonths} tháng</td>
                        <td className="py-2 text-xs text-ink-500">{formatDateTime(r.computedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-5 text-sm">
            <h2 className="font-semibold text-ink-900">Giao dịch tham chiếu theo trạng thái</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(REFERENCE_STATUS).map(([k, v]) => (
                <Link key={k} to={`/manager/transactions?status=${k}`} className="rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                  <div className="text-xs text-ink-500">{v.label}</div>
                  <div className="font-bold tabular-nums">{ref[k] || 0}</div>
                </Link>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Nguồn: {Object.entries(d?.referenceBySource || {}).map(([k, v]) => `${k === "SIMULATED" ? "mô phỏng" : "thật"} ${v}`).join(" · ") || "—"}
            </p>
            <h2 className="mt-5 font-semibold text-ink-900">Đơn hàng theo trạng thái</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.keys(d?.ordersByStatus || {}).length === 0 && <span className="text-ink-500">Chưa có đơn.</span>}
              {Object.entries(d?.ordersByStatus || {}).map(([k, v]) => (
                <span key={k} className="rounded-full bg-gray-100 px-3 py-1 text-xs">{ORDER_STATUS[k]?.label || k}: <b>{v}</b></span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {config.data && (
            <ConfigCard
              config={config.data}
              unconfigured={d?.unconfiguredThresholds || []}
              busy={busy}
              onSave={async (z, reason) => {
                const ok = await run("config", () => adminApi.setZThreshold(z, reason));
                if (ok) {
                  showToast(z == null ? "Đã bỏ ngưỡng Z: không hiện lời nhắc giá." : `Đã đặt ngưỡng Z = ${z}.`);
                  reload();
                }
                return !!ok;
              }}
            />
          )}

          <div className="card p-5 text-sm">
            <h2 className="font-semibold text-ink-900">Nhật ký quản trị</h2>
            {(audit.data?.items || []).length === 0 ? (
              <p className="mt-2 text-ink-500">Chưa có thao tác.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {audit.data.items.slice(0, 8).map((a, i) => (
                  <li key={i} className="text-xs">
                    <b>{a.action}</b> · {a.admin} · {formatDateTime(a.createdAt)}
                    <div className="text-ink-600">“{a.reason}”</div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-5 text-sm">
            <h2 className="font-semibold text-amber-800">Dữ liệu demo</h2>
            <p className="mt-1 text-ink-700">Xóa mọi đơn, thương lượng, tin mới và quyết định; nạp lại tài khoản mẫu, danh mục và 42 giao dịch fixture.</p>
            {confirmReset ? (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!!busy}
                  onClick={async () => {
                    const ok = await run("reset", () => adminApi.resetDemo().then(() => true));
                    setConfirmReset(false);
                    if (ok) {
                      showToast("Đã nạp lại dữ liệu demo.");
                      reload();
                    }
                  }}
                >
                  Xác nhận nạp lại
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Hủy</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setConfirmReset(true)}>Nạp lại dữ liệu demo</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ config, unconfigured, busy, onSave }) {
  const [z, setZ] = useState(config.zThreshold ?? "");
  const [reason, setReason] = useState("");
  const save = async (value) => {
    if (await onSave(value, reason.trim())) setReason("");
  };
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Cấu hình giá tham khảo</h2>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-ink-600">
        <dt>Số giao dịch tối thiểu</dt>
        <dd className="font-medium text-ink-900">{config.minTransactions}</dd>
        <dt>Cửa sổ thời gian</dt>
        <dd className="font-medium text-ink-900">{config.windowsMonths.join(" → ")} tháng</dd>
        <dt>Hạn xác minh giá máy mới</dt>
        <dd className="font-medium text-ink-900">{config.newPriceMaxAgeHours} giờ</dd>
      </dl>
      <div className="mt-4 border-t border-gray-100 pt-4">
        <label className="label" htmlFor="z-threshold">Ngưỡng Z cho lời nhắc giá thấp / cao</label>
        <p className="text-xs text-ink-500">
          Để trống = chưa thiết lập: dải giá vẫn hiện, không có lời nhắc. Hiện tại: <b>{config.zThreshold ?? "Chưa thiết lập"}</b>
        </p>
        <input id="z-threshold" className="input mt-2" inputMode="decimal" placeholder="Ví dụ 1.5" value={z} onChange={(e) => setZ(e.target.value.replace(",", "."))} />
        <label className="label mt-2" htmlFor="z-reason">Lý do thay đổi</label>
        <input id="z-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy || !reason.trim() || z === ""} onClick={() => save(Number(z))}>Lưu ngưỡng</Button>
          {config.zThreshold != null && (
            <Button size="sm" variant="ghost" disabled={!!busy || !reason.trim()} onClick={() => save(null)}>Bỏ ngưỡng</Button>
          )}
        </div>
      </div>
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Chưa thiết lập (chờ nhóm chốt)</div>
        <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
          {unconfigured.filter((k) => k !== "zThreshold").map((k) => <li key={k}>{THRESHOLD_LABEL[k] || k}</li>)}
        </ul>
        <p className="mt-1 text-[11px] text-ink-400">Các ngưỡng này không chặn việc công bố dải giá.</p>
      </div>
    </div>
  );
}
