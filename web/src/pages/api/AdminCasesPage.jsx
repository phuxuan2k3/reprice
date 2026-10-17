import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { caseApi } from "../../api/client";
import { CASE_STATUS, CASE_TYPE, PARTY_LABEL, REFUND_STATUS } from "../../api/labels";
import { useAction, useResource } from "../../api/useResource";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import AccessNotice from "../../components/AccessNotice";
import { formatDateTime, formatVND } from "../../utils/format";

/** QTV: danh sách hồ sơ trả hàng / khiếu nại và lệnh hoàn tiền (UC56, UC59). */
export default function AdminCasesPage() {
  const { user, loginAs, apiSession, showToast } = useApp();
  const isAdmin = user?.role === "manager";
  const [tab, setTab] = useState("open");
  const cases = useResource(() => (isAdmin ? caseApi.all(tab === "open") : Promise.resolve({ items: [] })), [apiSession, tab]);
  const refunds = useResource(() => (isAdmin ? caseApi.refunds() : Promise.resolve({ items: [] })), [apiSession]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));

  if (!isAdmin) {
    return (
      <AccessNotice requiredRole="manager" requiredLabel="Người quản lý" title="Trang dành cho quản trị viên"
        description="Chỉ quản trị viên xử lý hồ sơ và hoàn tiền." onLogin={() => loginAs("manager")} />
    );
  }
  const refundAct = async (fn, msg) => {
    if (await run("rf", fn)) {
      showToast(msg);
      refunds.reload();
      cases.reload();
    }
  };

  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-bold text-ink-900">Hồ sơ & hoàn tiền</h1>
      <p className="mt-1 text-sm text-ink-500">Hồ sơ quá hạn phản hồi tự chuyển về RePrice. Mọi giao dịch tiền là mô phỏng.</p>
      <div className="mt-5 flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
        {[["open", "Hồ sơ đang mở"], ["all", "Tất cả hồ sơ"], ["refunds", "Lệnh hoàn tiền"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab !== "refunds" ? (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Hồ sơ</th>
                <th className="px-3 py-2">Đơn · máy</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Chờ ai · hạn</th>
                <th className="px-3 py-2">Phụ trách</th>
              </tr>
            </thead>
            <tbody>
              {(cases.data?.items || []).map((c) => {
                const st = CASE_STATUS[c.status] || { label: c.status, tone: "gray" };
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link to={`/cases/${c.id}`} className="font-medium text-brand-600 hover:underline">{c.code}</Link>
                      <div className="text-xs text-ink-500">{CASE_TYPE[c.type]}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{c.orderCode}</div>
                      <div className="text-xs text-ink-500">{c.title} · {c.buyer} → {c.seller}</div>
                    </td>
                    <td className="px-3 py-2"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                    <td className="px-3 py-2 text-xs">
                      {c.awaitingParty ? PARTY_LABEL[c.awaitingParty] : "—"}
                      {c.dueAt && <div className={c.overdue ? "font-semibold text-red-600" : "text-ink-500"}>{formatDateTime(c.dueAt)}{c.overdue ? " · quá hạn" : ""}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.assignedAdmin || "Chưa nhận"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!cases.loading && (cases.data?.items || []).length === 0 && <p className="p-6 text-center text-sm text-ink-500">Không có hồ sơ.</p>}
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Đơn</th>
                <th className="px-3 py-2 text-right">Số tiền</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(refunds.data?.items || []).map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <Link to={`/orders/${r.orderId}`} className="text-brand-600 hover:underline">{r.orderCode}</Link>
                    <div className="text-xs text-ink-500">{r.caseId ? <Link to={`/cases/${r.caseId}`} className="hover:underline">xem hồ sơ</Link> : "hoàn do hủy đơn"}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatVND(r.amount)}</td>
                  <td className="px-3 py-2">
                    {REFUND_STATUS[r.status]}
                    {r.failureReason && <div className="text-xs text-red-700">{r.failureReason}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.allowedActions.includes("PROCESS") && <Button size="sm" disabled={!!busy} onClick={() => refundAct(() => caseApi.processRefund(r.id), "Đã gửi lệnh hoàn.")}>Gửi lệnh hoàn</Button>}
                      {r.allowedActions.includes("RETRY") && <Button size="sm" disabled={!!busy} onClick={() => refundAct(() => caseApi.retryRefund(r.id), "Đã gửi lại lệnh hoàn.")}>Gửi lại</Button>}
                      {["PROCESSING", "RECONCILING"].includes(r.status) && (
                        <>
                          <Button size="sm" variant="success" disabled={!!busy} onClick={() => refundAct(() => caseApi.demoRefundResult(r.id, "SUCCEEDED"), "Hoàn tiền thành công (mô phỏng).")}>Cổng báo thành công</Button>
                          <Button size="sm" variant="danger" disabled={!!busy} onClick={() => refundAct(() => caseApi.demoRefundResult(r.id, "FAILED"), "Hoàn tiền thất bại (mô phỏng).")}>Cổng báo thất bại</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!refunds.loading && (refunds.data?.items || []).length === 0 && <p className="p-6 text-center text-sm text-ink-500">Chưa có lệnh hoàn tiền.</p>}
        </div>
      )}
    </div>
  );
}
