import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import StatCard from "../components/StatCard";
import { VerificationBadge } from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { formatVND, formatDate, phoneName } from "../utils/format";
import { isValidReference } from "../data/transactions";
import { REFERENCE_STATUS, REFERENCE_STATUS_LABEL, conditionGroupKey } from "../data/pricingEngine";
import { FLAG_CODE, FLAG_LABEL } from "../data/suspicionFlags";

/* ----------------------- Hàng đợi duyệt (giữ nguyên luồng cũ) ----------------------- */

const QUEUE_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "NEEDS_INFO", label: "Cần bổ sung" },
  { value: "VERIFIED", label: "Hợp lệ" },
  { value: "DISPUTED", label: "Đang khiếu nại" },
  { value: "RETURNED", label: "Hoàn trả / Từ chối" },
  { value: "CANCELLED", label: "Đơn bị huỷ" },
];

const REF_STATUS_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: REFERENCE_STATUS.ELIGIBLE, label: "Đủ điều kiện" },
  { value: REFERENCE_STATUS.PENDING_COMPLETION, label: "Chờ hoàn tất" },
  { value: REFERENCE_STATUS.PENDING_VERIFICATION, label: "Chờ xác minh" },
  { value: REFERENCE_STATUS.EXCLUDED, label: "Bị loại" },
  { value: REFERENCE_STATUS.REVOKED, label: "Đã thu hồi" },
];

const STATUS_TONE = {
  ELIGIBLE: "bg-emerald-100 text-emerald-700",
  PENDING_COMPLETION: "bg-amber-100 text-amber-700",
  PENDING_VERIFICATION: "bg-sky-100 text-sky-700",
  EXCLUDED: "bg-gray-200 text-ink-600",
  REVOKED: "bg-red-100 text-red-700",
};

function StatusChip({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] || "bg-gray-100 text-ink-600"}`}>
      {REFERENCE_STATUS_LABEL[status] || status}
    </span>
  );
}

/** Bảng "Hàng đợi duyệt" cũ — vẫn dùng cho kịch bản duyệt giao dịch. */
function ApprovalQueue({ transactions, getPhone, verifyTransaction, showToast, isManager }) {
  const [filter, setFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [reasonModal, setReasonModal] = useState(null);
  const [reason, setReason] = useState("");

  const counts = useMemo(
    () => ({
      "": transactions.length,
      PENDING: transactions.filter((t) => t.verification === "PENDING").length,
      NEEDS_INFO: transactions.filter((t) => t.verification === "NEEDS_INFO").length,
      VERIFIED: transactions.filter((t) => t.verification === "VERIFIED").length,
      DISPUTED: transactions.filter((t) => t.verification === "DISPUTED").length,
      RETURNED: transactions.filter(
        (t) => t.verification === "RETURNED" || t.verification === "REJECTED"
      ).length,
      CANCELLED: transactions.filter((t) => t.status === "CANCELLED").length,
    }),
    [transactions]
  );

  const list = useMemo(() => {
    let l = [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (filter === "RETURNED") {
      l = l.filter((t) => t.verification === "RETURNED" || t.verification === "REJECTED");
    } else if (filter) {
      l = l.filter(
        (t) =>
          t.verification === filter || (filter === "CANCELLED" && t.status === "CANCELLED")
      );
    }
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      l = l.filter((t) => {
        const phone = getPhone(t.phoneId);
        const name = phone ? phoneName(phone) : "";
        return (
          t.id.toLowerCase().includes(kw) ||
          String(t.orderId).toLowerCase().includes(kw) ||
          name.toLowerCase().includes(kw) ||
          t.buyer.toLowerCase().includes(kw) ||
          t.seller.toLowerCase().includes(kw)
        );
      });
    }
    return l;
  }, [transactions, filter, keyword, getPhone]);

  const act = (txId, action, msg) => {
    verifyTransaction(txId, action);
    showToast(msg);
  };

  const submitReason = () => {
    if (!reason.trim()) {
      showToast("Vui lòng nhập lý do.", "error");
      return;
    }
    const { txId, action } = reasonModal;
    verifyTransaction(txId, action, reason.trim());
    showToast(
      action === "reject" ? "Đã từ chối: dữ liệu không hợp lệ." : "Đã gửi yêu cầu bổ sung dữ liệu."
    );
    setReasonModal(null);
    setReason("");
  };

  return (
    <>
      <div className="card mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1.5">
          {QUEUE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === f.value ? "bg-brand-500 text-white" : "bg-gray-100 text-ink-700 hover:bg-gray-200"
              }`}
            >
              {f.label} ({counts[f.value] ?? 0})
            </button>
          ))}
        </div>
        <input
          type="search"
          className="input lg:ml-auto lg:w-72"
          placeholder="Tìm mã giao dịch, sản phẩm, người mua/bán..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Không có bản ghi nào"
            description="Thử thay đổi bộ lọc hoặc từ khóa."
            actionLabel="Xóa bộ lọc"
            to="/manager/transactions"
          />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Mã giao dịch</th>
                <th className="px-4 py-3">Sản phẩm</th>
                <th className="px-4 py-3 text-right">Giá giao dịch</th>
                <th className="px-4 py-3">Người mua / bán</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Kiểm tra</th>
                <th className="px-4 py-3">Tập tham khảo</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((t) => {
                const phone = getPhone(t.phoneId);
                const included = isValidReference(t);
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-ink-900">{t.id}</div>
                      <div className="text-xs text-ink-400">Đơn {t.orderId}</div>
                    </td>
                    <td className="px-4 py-3">
                      {phone ? phoneName(phone) : t.phoneId}{" "}
                      {phone && <span className="text-ink-400">{phone.storage}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatVND(t.transactionPrice ?? t.price)}
                    </td>
                    <td className="px-4 py-3">
                      <div>{t.buyer}</div>
                      <div className="text-xs text-ink-400">↔ {t.seller}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <VerificationBadge verification={t.verification} />
                    </td>
                    <td className="px-4 py-3">
                      {included ? (
                        <span className="text-xs font-semibold text-emerald-600">Có</span>
                      ) : (
                        <span className="text-xs font-medium text-ink-400">Không</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {t.verification === "PENDING" && isManager && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(t.id, "verify", "Đã duyệt: giao dịch hợp lệ.")}>
                              Duyệt
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setReasonModal({ txId: t.id, action: "needsInfo" }); setReason(""); }}>
                              Bổ sung
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => { setReasonModal({ txId: t.id, action: "reject" }); setReason(""); }}>
                              Từ chối
                            </Button>
                          </>
                        )}
                        {t.verification === "NEEDS_INFO" && isManager && (
                          <Button size="sm" variant="outline" onClick={() => act(t.id, "verify", "Đã duyệt: giao dịch hợp lệ.")}>
                            Duyệt lại
                          </Button>
                        )}
                        {t.verification === "DISPUTED" && isManager && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(t.id, "resolveAccept", "Kết thúc khiếu nại: xác nhận hợp lệ.")}>
                              Kết thúc: Hợp lệ
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => act(t.id, "resolveReturn", "Kết thúc khiếu nại: giao dịch hoàn trả.")}>
                              Kết thúc: Hoàn trả
                            </Button>
                          </>
                        )}
                        {(!isManager || !["PENDING", "NEEDS_INFO", "DISPUTED"].includes(t.verification)) && (
                          <span className="text-xs text-ink-300">—</span>
                        )}
                      </div>
                      <div className="mt-1 max-w-[300px] text-right text-xs text-ink-400">{t.note}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reasonModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReasonModal(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ink-900">
              {reasonModal.action === "reject" ? "Từ chối dữ liệu" : "Yêu cầu bổ sung dữ liệu"}
            </h3>
            <div className="mt-4">
              <label className="label" htmlFor="reason-text">Lý do</label>
              <textarea id="reason-text" className="input min-h-24 resize-y" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setReasonModal(null)}>Quay lại</Button>
              <Button variant={reasonModal.action === "reject" ? "danger" : "primary"} onClick={submitReason}>Xác nhận</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------- Dữ liệu tham chiếu (màn quản trị nâng cao) ------------------- */

const ACTION_META = {
  ALLOW: { label: "Cho phép sử dụng", variant: "outline" },
  PENDING: { label: "Tiếp tục chờ xác minh", variant: "outline" },
  EXCLUDE: { label: "Không sử dụng", variant: "danger" },
  REVOKE: { label: "Thu hồi khỏi dữ liệu tham chiếu", variant: "danger" },
  REVOKE_RECOMPUTE: { label: "Thu hồi và tính lại", variant: "danger" },
};

function ReferenceDataPanel({ details, groups, isManager, onAction }) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [flag, setFlag] = useState("");
  const [cluster, setCluster] = useState("");
  const [model, setModel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const models = useMemo(
    () => [...new Set(details.map((d) => d.phone_snapshot?.model).filter(Boolean))].sort(),
    [details]
  );
  const flagCodes = Object.values(FLAG_CODE);

  const list = useMemo(() => {
    let l = [...details];
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      l = l.filter(
        (d) =>
          String(d.order_id || "").toLowerCase().includes(kw) ||
          String(d.transaction_detail_id || "").toLowerCase().includes(kw) ||
          String(d.buyer_name || d.buyer_id || "").toLowerCase().includes(kw) ||
          String(d.seller_name || d.seller_id || "").toLowerCase().includes(kw)
      );
    }
    if (status) l = l.filter((d) => d.reference_data_status === status);
    if (flag) l = l.filter((d) => (d.suspicion_flags || []).some((f) => f.code === flag));
    if (cluster) l = l.filter((d) => String(d.cluster_id || "").toLowerCase().includes(cluster.toLowerCase()));
    if (model) l = l.filter((d) => d.phone_snapshot?.model === model);
    if (from) l = l.filter((d) => String(d.transaction_date) >= from);
    if (to) l = l.filter((d) => String(d.transaction_date) <= to);
    if (usedOnly) l = l.filter((d) => d.reference_data_status === REFERENCE_STATUS.ELIGIBLE);
    return l.sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
  }, [details, keyword, status, flag, cluster, model, from, to, usedOnly]);

  const selected = useMemo(
    () => details.find((d) => d.transaction_detail_id === selectedId) || null,
    [details, selectedId]
  );
  const clusterMembers = useMemo(
    () => (selected?.cluster_id ? details.filter((d) => d.cluster_id === selected.cluster_id) : []),
    [details, selected]
  );
  const groupInfo = useMemo(
    () =>
      selected
        ? groups.find(
            (g) => g.model === selected.phone_snapshot?.model && g.storage === selected.phone_snapshot?.storage
          )
        : null,
    [groups, selected]
  );

  const counts = useMemo(() => {
    const c = { "": details.length };
    for (const s of Object.values(REFERENCE_STATUS)) c[s] = 0;
    for (const d of details) c[d.reference_data_status] = (c[d.reference_data_status] || 0) + 1;
    return c;
  }, [details]);

  return (
    <>
      {/* Bộ lọc */}
      <div className="card mt-6 p-4">
        <div className="flex flex-wrap gap-1.5">
          {REF_STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                status === f.value ? "bg-brand-500 text-white" : "bg-gray-100 text-ink-700 hover:bg-gray-200"
              }`}
            >
              {f.label} ({counts[f.value] ?? 0})
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <input className="input" placeholder="Mã đơn / mã chi tiết / người mua / người bán" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">Tất cả model</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select className="input" value={flag} onChange={(e) => setFlag(e.target.value)}>
            <option value="">Tất cả loại cờ</option>
            {flagCodes.map((c) => (
              <option key={c} value={c}>{FLAG_LABEL[c]}</option>
            ))}
          </select>
          <input className="input" placeholder="Lọc theo cluster_id" value={cluster} onChange={(e) => setCluster(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-ink-600">
            Từ ngày
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-600">
            Đến ngày
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} />
            Chỉ giao dịch đang được dùng trong dải giá
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr,1fr]">
        {/* Bảng */}
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-3 py-3">Mã chi tiết / Đơn</th>
                <th className="px-3 py-3">Máy</th>
                <th className="px-3 py-3 text-right">Giá chốt (+ship)</th>
                <th className="px-3 py-3">Ngày</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Cờ</th>
                <th className="px-3 py-3">Cluster</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((d) => (
                <tr
                  key={d.transaction_detail_id}
                  onClick={() => setSelectedId(d.transaction_detail_id)}
                  className={`cursor-pointer hover:bg-gray-50 ${selectedId === d.transaction_detail_id ? "bg-brand-50" : ""}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-mono font-semibold text-ink-900">{d.transaction_detail_id}</div>
                    <div className="text-xs text-ink-400">Đơn {d.order_id || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {d.phone_snapshot?.model || "—"} <span className="text-ink-400">{d.phone_snapshot?.storage}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatVND(d.actual_paid_price)}
                    <div className="text-xs text-ink-400">+{formatVND(d.shipping_fee || 0)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-500">{d.transaction_date}</td>
                  <td className="px-3 py-2.5"><StatusChip status={d.reference_data_status} /></td>
                  <td className="px-3 py-2.5">
                    {(d.suspicion_flags || []).length > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        {d.suspicion_flags.length} cờ
                      </span>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {d.cluster_id ? (
                      <span className="font-mono text-xs text-ink-600" title={`${d.cluster_size} giao dịch`}>
                        {d.cluster_id} ({d.cluster_size})
                      </span>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="p-6 text-center text-sm text-ink-500">Không có bản ghi khớp bộ lọc.</div>
          )}
        </div>

        {/* Chi tiết */}
        <div className="card p-5">
          {!selected ? (
            <p className="text-sm text-ink-500">Chọn một giao dịch ở bảng bên trái để xem chi tiết.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-mono text-base font-bold text-ink-900">{selected.transaction_detail_id}</div>
                <div className="text-xs text-ink-500">Đơn {selected.order_id || "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-ink-400">Người mua:</span> {selected.buyer_name || selected.buyer_id || "—"}</div>
                <div><span className="text-ink-400">Người bán:</span> {selected.seller_name || selected.seller_id || "—"}</div>
                <div><span className="text-ink-400">Giá chốt:</span> {formatVND(selected.actual_paid_price)}</div>
                <div><span className="text-ink-400">Phí vận chuyển:</span> {formatVND(selected.shipping_fee || 0)}</div>
                <div><span className="text-ink-400">Thanh toán:</span> {selected.payment_status}</div>
                <div><span className="text-ink-400">Giao nhận:</span> {selected.delivery_status}</div>
                <div><span className="text-ink-400">Trả hàng:</span> {selected.return_status}</div>
                <div><span className="text-ink-400">Hoàn tiền:</span> {selected.refund_status}</div>
                <div><span className="text-ink-400">Tranh chấp:</span> {selected.dispute_status}</div>
                <div><span className="text-ink-400">Nguồn:</span> {selected.data_provenance}</div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="mb-1 text-xs font-semibold text-ink-600">Snapshot sản phẩm</div>
                <div className="text-xs text-ink-600">
                  {selected.phone_snapshot?.model} · {selected.phone_snapshot?.storage} ·{" "}
                  {selected.phone_snapshot?.color} · {selected.phone_snapshot?.condition}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="mb-1 text-xs font-semibold text-ink-600">
                  Condition Score — nhóm 4/4 tiêu chí
                </div>
                <ul className="space-y-0.5 text-xs text-ink-600">
                  <li>Ngoại hình: {selected.phone_snapshot?.appearance || "—"}</li>
                  <li>Chức năng: {selected.phone_snapshot?.functionality || "—"}</li>
                  <li>Pin: {selected.phone_snapshot?.batteryHealth ?? "—"}%</li>
                  <li>Tình trạng sửa chữa: {selected.phone_snapshot?.repairHistory || "—"}</li>
                </ul>
                <div className="mt-1 font-mono text-[11px] text-ink-400">
                  Nhóm: {conditionGroupKey(selected.phone_snapshot || {})}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-ink-600">Trạng thái dữ liệu tham chiếu</div>
                <StatusChip status={selected.reference_data_status} />
                {(selected.reference_reasons || []).length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-ink-500">
                    {selected.reference_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>

              {(selected.suspicion_flags || []).length > 0 && (
                <div className="rounded-lg bg-red-50 p-3">
                  <div className="mb-1 text-xs font-semibold text-red-700">Cờ nghi vấn (cần xem xét, không tự kết luận)</div>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-700">
                    {selected.suspicion_flags.map((f, i) => (
                      <li key={i}><b>{f.label}</b>: {f.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.cluster_id && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-1 text-xs font-semibold text-ink-600">
                    Cụm {selected.cluster_id} — {clusterMembers.length} giao dịch
                  </div>
                  <ul className="space-y-0.5 font-mono text-[11px] text-ink-500">
                    {clusterMembers.map((m) => (
                      <li key={m.transaction_detail_id}>{m.transaction_detail_id}</li>
                    ))}
                  </ul>
                  {(selected.cluster_reasons || []).length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-ink-500">
                      {selected.cluster_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {groupInfo && (
                <div className="rounded-lg bg-brand-50 p-3 text-xs text-brand-800">
                  <div className="font-semibold">Dải giá đang dùng giao dịch này</div>
                  <div>
                    {groupInfo.model} {groupInfo.storage}:{" "}
                    {groupInfo.reference.usedPrice.status === "RANGE"
                      ? `${formatVND(groupInfo.reference.usedPrice.lowerPrice)} – ${formatVND(groupInfo.reference.usedPrice.upperPrice)} (${groupInfo.reference.usedPrice.count} GD, cửa sổ ${groupInfo.reference.usedPrice.windowMonths} tháng)`
                      : groupInfo.reference.usedPrice.status === "INSUFFICIENT_DATA"
                        ? `chưa đủ (${groupInfo.reference.usedPrice.count}/${groupInfo.reference.usedPrice.minTransactions})`
                        : "chưa có dữ liệu"}
                  </div>
                </div>
              )}

              {(selected.review_history || []).length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-ink-600">Lịch sử quyết định</div>
                  <ul className="space-y-0.5 text-[11px] text-ink-500">
                    {selected.review_history.map((h, i) => (
                      <li key={i}>{h.at} · {h.by} · {ACTION_META[h.decision]?.label || h.decision} — {h.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {isManager ? (
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {Object.entries(ACTION_META).map(([decision, meta]) => (
                    <Button
                      key={decision}
                      size="sm"
                      variant={meta.variant}
                      onClick={() => onAction(selected.transaction_detail_id, decision)}
                    >
                      {meta.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-400">Chỉ Người quản lý mới thao tác được.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tính lại dải giá theo nhóm */}
      <div className="card mt-4 p-4">
        <div className="text-sm font-semibold text-ink-900">Tính lại dải giá theo nhóm (sau thu hồi)</div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-2">Nhóm (model · dung lượng)</th>
                <th className="py-2 text-right">Số GD</th>
                <th className="py-2">Cửa sổ</th>
                <th className="py-2 text-right">P10 – P90</th>
                <th className="py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.map((g) => {
                const u = g.reference.usedPrice;
                return (
                  <tr key={g.key}>
                    <td className="py-2">{g.model} · {g.storage}</td>
                    <td className="py-2 text-right tabular-nums">{g.count}</td>
                    <td className="py-2">{u.windowMonths ? `${u.windowMonths} tháng` : "—"}</td>
                    <td className="py-2 text-right tabular-nums">
                      {u.status === "RANGE" ? `${formatVND(u.lowerPrice)} – ${formatVND(u.upperPrice)}` : "—"}
                    </td>
                    <td className="py-2">{u.status === "RANGE" ? "Có dải" : u.status === "INSUFFICIENT_DATA" ? "Chưa đủ" : "Chưa có"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- Trang --------------------------------- */

export default function ManagerTransactionsPage() {
  const {
    user,
    loginAs,
    transactions,
    verifyTransaction,
    getPhone,
    showToast,
    referenceDetails,
    referenceGroups,
    setReferenceDecision,
  } = useApp();
  const [tab, setTab] = useState("queue");
  const [actionModal, setActionModal] = useState(null); // { detailId, decision }
  const [reason, setReason] = useState("");

  const isManager = user?.role === "manager";

  const submitAction = () => {
    if (!reason.trim()) {
      showToast("Vui lòng nhập lý do.", "error");
      return;
    }
    const { detailId, decision } = actionModal;
    const realDecision = decision === "REVOKE_RECOMPUTE" ? "REVOKE" : decision;
    setReferenceDecision(detailId, realDecision, reason.trim());
    showToast(
      decision === "REVOKE_RECOMPUTE"
        ? "Đã thu hồi giao dịch và tính lại dải giá liên quan."
        : `Đã ghi nhận quyết định: ${ACTION_META[decision]?.label}.`
    );
    setActionModal(null);
    setReason("");
  };

  const counts = useMemo(() => {
    const c = {};
    for (const d of referenceDetails) c[d.reference_data_status] = (c[d.reference_data_status] || 0) + 1;
    return c;
  }, [referenceDetails]);

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Quản trị giao dịch &amp; dữ liệu giá</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Hàng đợi duyệt giao dịch và tra cứu dữ liệu tham chiếu: trạng thái, cờ nghi vấn,
            cụm liên quan, nguồn gốc và thao tác thu hồi / tính lại. Toàn bộ dữ liệu là mô phỏng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/manager/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Quản lý đơn hàng →
          </Link>
          <DataBadge />
        </div>
      </div>

      {!isManager && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bạn đang xem với quyền <strong>không phải Người quản lý</strong> — chỉ xem được dữ liệu.{" "}
          <button onClick={() => loginAs("manager")} className="font-bold underline hover:no-underline">
            Đăng nhập nhanh với vai trò Người quản lý
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Đủ điều kiện" value={counts.ELIGIBLE || 0} sub="Đang tính vào dải giá" accent="green" />
        <StatCard label="Chờ hoàn tất / xác minh" value={(counts.PENDING_COMPLETION || 0) + (counts.PENDING_VERIFICATION || 0)} sub="Chưa tính" accent="amber" />
        <StatCard label="Bị loại" value={counts.EXCLUDED || 0} sub="Trả hàng/hoàn tiền/tranh chấp" accent="red" />
        <StatCard label="Đã thu hồi" value={counts.REVOKED || 0} sub="Giữ lịch sử, không xóa" accent="gray" />
      </div>

      {/* Chuyển tab */}
      <div className="mt-6 flex gap-2 border-b border-gray-200">
        {[
          { key: "queue", label: "Hàng đợi duyệt giá" },
          { key: "reference", label: "Dữ liệu tham chiếu" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <ApprovalQueue
          transactions={transactions}
          getPhone={getPhone}
          verifyTransaction={verifyTransaction}
          showToast={showToast}
          isManager={isManager}
        />
      ) : (
        <ReferenceDataPanel
          details={referenceDetails}
          groups={referenceGroups}
          isManager={isManager}
          onAction={(detailId, decision) => {
            setActionModal({ detailId, decision });
            setReason("");
          }}
        />
      )}

      {/* Xác nhận thao tác + lý do */}
      {actionModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setActionModal(null)}
        >
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ink-900">
              {ACTION_META[actionModal.decision]?.label}
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Mã chi tiết: <span className="font-mono">{actionModal.detailId}</span>. Thao tác chỉ
              tác động dữ liệu tham chiếu, không xóa đơn hàng hay khóa tài khoản.
            </p>
            <div className="mt-4">
              <label className="label" htmlFor="ref-reason">Lý do (bắt buộc)</label>
              <textarea
                id="ref-reason"
                className="input min-h-24 resize-y"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setActionModal(null)}>Quay lại</Button>
              <Button
                variant={ACTION_META[actionModal.decision]?.variant === "danger" ? "danger" : "primary"}
                onClick={submitAction}
              >
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
