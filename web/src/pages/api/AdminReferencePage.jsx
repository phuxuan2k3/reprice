import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { adminApi } from "../../api/client";
import { DECISION_ACTIONS, FLAG_LABEL, REFERENCE_STATUS, RELATION_LABEL, conditionKeyLabel } from "../../api/labels";
import { useAction, useResource } from "../../api/useResource";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import AccessNotice from "../../components/AccessNotice";
import { formatDate, formatDateTime, formatVND } from "../../utils/format";

const FILTERS = ["status", "dataSource", "flag", "clusterId", "q"];

/**
 * QTV kiểm tra giao dịch dùng cho dữ liệu tham chiếu (UC70, UC71): lọc, xem snapshot, cờ nghi vấn,
 * cụm liên quan, lịch sử quyết định; cho phép / loại / thu hồi kèm lý do và xem dải giá được tính lại.
 */
export default function AdminReferencePage() {
  const { user, loginAs, apiSession, showToast } = useApp();
  const [params, setParams] = useSearchParams();
  const filter = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) || ""]));
  const [selected, setSelected] = useState(null);
  const [keyword, setKeyword] = useState(filter.q);
  const isAdmin = user?.role === "manager";
  const list = useResource(
    () => (isAdmin ? adminApi.references({ ...filter, pageSize: 100 }) : Promise.resolve({ items: [], total: 0 })),
    [apiSession, params.toString()]
  );

  if (!isAdmin) {
    return (
      <AccessNotice
        requiredRole="manager"
        requiredLabel="Người quản lý"
        title="Trang dành cho quản trị viên"
        description="Chỉ quản trị viên được kiểm tra và quyết định dữ liệu tham chiếu."
        onLogin={() => loginAs("manager")}
      />
    );
  }

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const items = list.data?.items || [];
  const pendingCount = items.filter((t) => t.status === "PENDING_VERIFICATION").length;

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Kiểm tra dữ liệu giao dịch</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-500">
            Mỗi dòng là giá chốt của một máy. Chỉ giao dịch <b>Đủ điều kiện</b> mới được tính vào dải P10–P90. Quyết định ở đây
            chỉ đổi việc giao dịch có được dùng để tính giá, không hủy đơn hay khóa tài khoản.
          </p>
        </div>
        <Link to="/manager/dashboard" className="text-sm font-semibold text-brand-600 hover:underline">Về dashboard</Link>
      </div>

      <div className="card mt-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <select className="input" aria-label="Trạng thái" value={filter.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(REFERENCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" aria-label="Nguồn dữ liệu" value={filter.dataSource} onChange={(e) => setFilter("dataSource", e.target.value)}>
          <option value="">Mọi nguồn</option>
          <option value="REAL">Giao dịch thật</option>
          <option value="SIMULATED">Mô phỏng</option>
        </select>
        <select className="input" aria-label="Cờ nghi vấn" value={filter.flag} onChange={(e) => setFilter("flag", e.target.value)}>
          <option value="">Mọi cờ</option>
          {Object.entries(FLAG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form
          className="flex gap-2 lg:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter("q", keyword.trim());
          }}
        >
          <input className="input flex-1" placeholder="Mã đơn, mã giao dịch hoặc model" value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="Tìm" />
          <Button type="submit" variant="outline">Tìm</Button>
        </form>
        {filter.clusterId && (
          <div className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-5">
            <span>Đang lọc theo cụm <code className="rounded bg-gray-100 px-1">{filter.clusterId.slice(0, 8)}</code></span>
            <button className="text-brand-600 hover:underline" onClick={() => setFilter("clusterId", "")}>Bỏ lọc cụm</button>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm text-ink-500">
        {list.loading && !list.data ? "Đang tải…" : `${list.data?.total ?? 0} giao dịch`}
        {pendingCount > 0 && <> · <b className="text-amber-700">{pendingCount} đang chờ xác minh</b> (hiện trước)</>}
      </p>
      {list.error && <p className="mt-2 text-sm text-red-600">{list.error.message}</p>}

      <div className="mt-3 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="card min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">Máy · tình trạng</th>
                <th className="px-3 py-2 text-right">Giá chốt</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Cờ · cụm</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const st = REFERENCE_STATUS[t.status] || { label: t.status, tone: "gray" };
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${selected === t.id ? "bg-brand-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-600">{formatDate(t.transactionDate)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink-900">{t.variant.modelName} {t.variant.storageGb}GB</div>
                      <div className="text-xs text-ink-500">
                        {conditionKeyLabel(t.conditionKey)} · {t.dataSource === "SIMULATED" ? "mô phỏng" : `đơn ${t.orderCode}`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatVND(t.actualPrice)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      {t.inCurrentRange && <div className="mt-1 text-[11px] text-emerald-700">trong dải đang công bố</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.openFlags.map((f) => <div key={f} className="text-amber-700">⚑ {FLAG_LABEL[f] || f}</div>)}
                      {t.clusterSize > 1 && <div className="text-ink-500">Cụm {t.clusterSize} giao dịch</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.loading && items.length === 0 && <p className="p-6 text-center text-sm text-ink-500">Không có giao dịch phù hợp bộ lọc.</p>}
        </div>

        <div className="min-w-0">
          {selected ? (
            <Detail
              key={selected}
              id={selected}
              session={apiSession}
              showToast={showToast}
              onChanged={list.reload}
              onCluster={(c) => setFilter("clusterId", c)}
            />
          ) : (
            <div className="card p-6 text-sm text-ink-500">Chọn một giao dịch để xem snapshot, cờ nghi vấn và ra quyết định.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ id, session, showToast, onChanged, onCluster }) {
  const d = useResource(() => adminApi.reference(id), [id, session]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [recalc, setRecalc] = useState(null);
  const t = d.data;
  if (d.loading && !t) return <div className="card p-6 text-sm text-ink-500">Đang tải…</div>;
  if (d.error) return <div className="card p-6 text-sm text-red-600">{d.error.message}</div>;

  const st = REFERENCE_STATUS[t.status] || { label: t.status, tone: "gray" };
  const snap = t.snapshot;
  const submit = async () => {
    const res = await run("decide", () => adminApi.decide(t.id, action, reason.trim()));
    if (!res) return;
    d.setData(res.transaction);
    setRecalc(res.recalculatedRanges);
    setAction(null);
    setReason("");
    showToast(`Đã ghi quyết định: ${DECISION_ACTIONS[action].label}.`);
    onChanged();
  };

  return (
    <div className="card sticky top-20 p-5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-bold text-ink-900">{t.variant.modelName} {t.variant.storageGb}GB · {formatVND(t.actualPrice)}</div>
          <div className="text-xs text-ink-500">Mã {t.id.slice(0, 8)} · {formatDate(t.transactionDate)}</div>
        </div>
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-ink-500">Nguồn</dt>
        <dd>{t.dataSource === "SIMULATED" ? "Mô phỏng (fixture demo)" : "Giao dịch thật"}</dd>
        <dt className="text-ink-500">Đơn</dt>
        <dd>{t.orderId ? <Link className="text-brand-600 hover:underline" to={`/orders/${t.orderId}`}>{t.orderCode}</Link> : "—"}</dd>
        <dt className="text-ink-500">Nhóm so sánh</dt>
        <dd>{conditionKeyLabel(t.conditionKey)}</dd>
        <dt className="text-ink-500">Màu</dt>
        <dd>{t.variant.color || "Không rõ"}</dd>
        <dt className="text-ink-500">Đủ điều kiện lúc</dt>
        <dd>{t.eligibleAt ? formatDateTime(t.eligibleAt) : "—"}</dd>
        <dt className="text-ink-500">Trong dải công bố</dt>
        <dd>{t.inCurrentRange ? "Có" : "Không"}</dd>
      </dl>

      {snap && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs">
          <div className="font-semibold text-ink-700">Snapshot lúc chốt giá</div>
          <div className="mt-1 text-ink-600">
            {snap.title} · {snap.variant?.color || "màu không rõ"} · pin {snap.condition?.batteryHealthPct ?? "?"}% ·{" "}
            {snap.condition?.faults?.length ? `${snap.condition.faults.length} lỗi đã khai` : "không khai lỗi"}
          </div>
        </div>
      )}

      <section className="mt-4">
        <h3 className="font-semibold text-ink-900">Cờ nghi vấn</h3>
        {t.flags.length === 0 ? (
          <p className="mt-1 text-ink-500">Không có.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {t.flags.map((f) => (
              <li key={f.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <div className="font-medium text-amber-800">
                  {FLAG_LABEL[f.code] || f.code} <span className="text-xs font-normal">· {f.status === "OPEN" ? "đang mở" : f.status === "CLEARED" ? "đã gỡ" : "đã xác nhận"}</span>
                </div>
                <div className="text-xs text-ink-700">{f.evidence}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="font-semibold text-ink-900">Giao dịch liên quan</h3>
        {t.relations.length === 0 ? (
          <p className="mt-1 text-ink-500">Không có.</p>
        ) : (
          <>
            <ul className="mt-1 space-y-1">
              {t.relations.map((r) => (
                <li key={r.otherId + r.relationType} className="text-xs">
                  {RELATION_LABEL[r.relationType]} với <code>{r.otherId.slice(0, 8)}</code> ({formatVND(r.otherPrice)}, {REFERENCE_STATUS[r.otherStatus]?.label}) — {r.basis}
                </li>
              ))}
            </ul>
            {t.clusterId && (
              <button className="mt-1 text-xs font-medium text-brand-600 hover:underline" onClick={() => onCluster(t.clusterId)}>
                Xem cả cụm ({t.clusterSize} giao dịch)
              </button>
            )}
            <p className="mt-1 text-[11px] text-ink-400">Cụm chỉ là quan hệ dữ liệu, không phải kết luận gian lận.</p>
          </>
        )}
      </section>

      {t.allowedActions.length > 0 && (
        <section className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="font-semibold text-ink-900">Quyết định</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {t.allowedActions.map((a) => (
              <Button key={a} size="sm" variant={action === a ? "primary" : DECISION_ACTIONS[a].variant} onClick={() => setAction(a)}>
                {DECISION_ACTIONS[a].label}
              </Button>
            ))}
          </div>
          {action && (
            <div className="mt-3">
              <p className="text-xs text-ink-500">{DECISION_ACTIONS[action].hint}</p>
              <label className="label mt-2" htmlFor="decision-reason">Lý do (bắt buộc, được ghi nhật ký)</label>
              <textarea id="decision-reason" className="input min-h-[72px]" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={!!busy || !reason.trim()} onClick={submit}>
                  {busy ? "Đang ghi…" : `Xác nhận: ${DECISION_ACTIONS[action].label}`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Hủy</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {recalc && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          {recalc.length === 0
            ? "Nhóm máy không còn đủ 35 giao dịch: đã gỡ dải giá đang công bố."
            : recalc.map((v) => (
                <div key={v.id}>
                  Dải giá nhóm này được tính lại: <b>{formatVND(v.p10)} – {formatVND(v.p90)}</b> từ {v.transactionCount} giao dịch
                  (cửa sổ {v.windowMonths} tháng).
                </div>
              ))}
        </div>
      )}

      <section className="mt-5">
        <h3 className="font-semibold text-ink-900">Lịch sử quyết định</h3>
        {t.decisions.length === 0 ? (
          <p className="mt-1 text-ink-500">Chưa có.</p>
        ) : (
          <ol className="mt-1 space-y-2">
            {t.decisions.map((x, i) => (
              <li key={i} className="text-xs">
                <b>{DECISION_ACTIONS[x.action]?.label || x.action}</b> · {REFERENCE_STATUS[x.fromStatus]?.label} → {REFERENCE_STATUS[x.toStatus]?.label}
                <div className="text-ink-500">{x.admin} · {formatDateTime(x.at)}</div>
                <div className="text-ink-700">“{x.reason}”</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
