import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { caseApi, demoApi } from "../../api/client";
import {
  CASE_REASON,
  CASE_STATUS,
  CASE_TYPE,
  PARTY_LABEL,
  PAYMENT_STATUS,
  PAYOUT_STATUS,
  REFUND_STATUS,
  RESOLUTION_DECISION,
  SHIPMENT_STATUS,
  ACCESSORY_VI,
  CASE_EVENT,
} from "../../api/labels";
import { useAction, useResource } from "../../api/useResource";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import { formatDateTime, formatVND } from "../../utils/format";

/**
 * Hồ sơ trả hàng / hoàn tiền / khiếu nại (docs/SPEC.md mục 4). Dùng chung cho người mua, người bán
 * và QTV; nút hiện theo allowedActions do backend tính cho người đang xem.
 */
export default function TradeCasePage() {
  const { id } = useParams();
  const { apiSession, showToast, user } = useApp();
  const res = useResource(() => caseApi.get(id), [id, apiSession]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));
  const c = res.data;

  if (res.loading && !c) return <div className="container-x py-8 text-sm text-ink-500">Đang tải hồ sơ…</div>;
  if (res.error) {
    return (
      <div className="container-x py-8">
        <p className="text-sm text-red-600">{res.error.status === 404 ? "Không tìm thấy hồ sơ, hoặc bạn không phải bên liên quan." : res.error.message}</p>
        <Link to="/trades" className="mt-3 inline-block text-sm font-medium text-brand-600">Về Giao dịch của tôi</Link>
      </div>
    );
  }

  const can = (a) => c.allowedActions.includes(a);
  const st = CASE_STATUS[c.status] || { label: c.status, tone: "gray" };
  const isAdmin = user?.role === "manager";
  // Mọi thao tác trả về hồ sơ mới; cập nhật ngay.
  const act = async (key, fn, msg) => {
    const out = await run(key, fn);
    if (out) {
      if (out.code && out.id === c.id) res.setData(out);
      else res.reload();
      if (msg) showToast(msg);
    }
    return out;
  };

  return (
    <div className="container-x max-w-5xl py-8">
      <nav className="text-sm text-ink-500">
        <Link to={isAdmin ? "/manager/orders" : "/trades"} className="hover:text-brand-600">{isAdmin ? "Hồ sơ & hoàn tiền" : "Giao dịch của tôi"}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-900">Hồ sơ {c.code}</span>
      </nav>

      <div className="card mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-900">{CASE_TYPE[c.type]} · {c.code}</h1>
            <div className="mt-1 text-sm text-ink-500">
              Đơn <Link to={`/orders/${c.orderId}`} className="text-brand-600 hover:underline">{c.orderCode}</Link> · Người mua {c.buyer.fullName} ·
              Người bán {c.seller.fullName} · Mở lúc {formatDateTime(c.openedAt)}
              {c.assignedAdmin && <> · QTV phụ trách {c.assignedAdmin.fullName}</>}
            </div>
          </div>
          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        </div>
        {c.nextStep && (
          <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm">
            <b>{PARTY_LABEL[c.nextStep.party]} cần làm:</b> {c.nextStep.action}
            {c.nextStep.dueAt && <> — trước <b>{formatDateTime(c.nextStep.dueAt)}</b></>}
          </div>
        )}
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <Info label="Lý do" value={CASE_REASON[c.reason] || c.reason} />
          <Info label="Thanh toán" value={PAYMENT_STATUS[c.moneyStatus.payment] || c.moneyStatus.payment} />
          <Info
            label="Tiền của người bán"
            value={c.moneyStatus.payout ? PAYOUT_STATUS[c.moneyStatus.payout] : "Chưa phát sinh"}
          />
        </div>
        <p className="mt-3 text-sm text-ink-700"><span className="text-ink-500">Mô tả: </span>{c.description}</p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Actions c={c} can={can} busy={busy} act={act} />
          {isAdmin && <AdminPanel c={c} can={can} busy={busy} act={act} />}
          {c.returnShipment && <ReturnShipment c={c} busy={busy} act={act} />}
          {c.refund && <RefundBox c={c} isAdmin={isAdmin} busy={busy} act={act} can={can} />}
          {can("ADD_EVIDENCE") && <EvidenceForm busy={busy} onSend={(note, files) => act("evidence", () => caseApi.addEvidence(c.id, note, files), "Đã gửi bằng chứng.")} />}
          <EvidenceList evidence={c.evidence} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {c.committedSnapshot && (
            <div className="card p-5 text-sm">
              <h2 className="font-semibold text-ink-900">Cam kết lúc đặt hàng</h2>
              <p className="mt-2 font-medium">{c.committedSnapshot.title} · giá chốt {formatVND(c.committedSnapshot.agreedPrice)}</p>
              <SnapshotLines s={c.committedSnapshot.snapshot} />
            </div>
          )}
          {c.currentResolution && (
            <div className="card p-5 text-sm">
              <h2 className="font-semibold text-ink-900">Phương án của RePrice</h2>
              <p className="mt-2 font-medium">{RESOLUTION_DECISION[c.currentResolution.decision]}</p>
              <p className="text-ink-700">“{c.currentResolution.rationale}”</p>
              {c.currentResolution.refundAmount && <p className="mt-1">Số tiền hoàn: <b>{formatVND(c.currentResolution.refundAmount)}</b></p>}
              <p className="mt-1 text-xs text-ink-500">
                {c.currentResolution.issuedBy} · hạn đề nghị xem xét lại {formatDateTime(c.currentResolution.reviewDeadline)}
              </p>
            </div>
          )}
          {c.shippingVerifications.length > 0 && (
            <div className="card p-5 text-sm">
              <h2 className="font-semibold text-ink-900">Xác minh vận chuyển</h2>
              {c.shippingVerifications.map((v) => (
                <div key={v.id} className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs">
                  <div><b>Hỏi:</b> {v.question}</div>
                  <div><b>Trạng thái:</b> {v.status === "RESPONDED" ? `Đã phản hồi${v.outcome ? ` (${v.outcome})` : ""}` : "Đã gửi, chờ phản hồi"}</div>
                  {v.response && <div><b>Phản hồi:</b> {v.response}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="card p-5 text-sm">
            <h2 className="font-semibold text-ink-900">Dòng thời gian</h2>
            <ol className="mt-3 space-y-3">
              {c.timeline.map((e, i) => (
                <li key={i}>
                  <div className="font-medium text-ink-900">{e.to ? CASE_STATUS[e.to]?.label || e.to : CASE_EVENT[e.action] || e.action}</div>
                  <div className="text-xs text-ink-500">{formatDateTime(e.at)} · {e.actor ? e.actor.fullName : "Hệ thống"}</div>
                  {e.note && <div className="text-xs text-ink-700">{e.note}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="font-medium text-ink-900">{value}</div>
    </div>
  );
}

function SnapshotLines({ s }) {
  if (!s) return null;
  const c = s.condition || {};
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
      <li>Màu {s.variant?.color || "không rõ"} · pin {c.batteryHealthPct ?? "?"}%</li>
      <li>{c.faults?.length ? `Lỗi đã khai: ${c.faults.map((f) => f.component).join(", ")}` : "Không khai lỗi chức năng"}</li>
      <li>Phụ kiện: {s.accessories?.length ? s.accessories.map((a) => ACCESSORY_VI[a] || a).join(", ") : "không"}</li>
      {s.description && <li>Mô tả: {s.description}</li>}
    </ul>
  );
}

/** Thao tác của người mua / người bán theo bước hiện tại. */
function Actions({ c, can, busy, act }) {
  const [msg, setMsg] = useState("");
  const [problem, setProblem] = useState("WRONG_DEVICE");
  const any = ["SELLER_AGREE", "SELLER_REJECT", "SELLER_REQUEST_INFO", "BUYER_SUPPLEMENT", "BUYER_ESCALATE", "BUYER_WITHDRAW",
    "RETURN_HANDOVER", "RETURN_INSPECT", "REQUEST_REVIEW"].some(can);
  if (!any) return null;
  const done = () => (r) => r && setMsg("");
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Việc của bạn</h2>
      <label className="label mt-3" htmlFor="case-msg">Nội dung / lý do</label>
      <textarea id="case-msg" className="input min-h-[72px]" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        {can("SELLER_AGREE") && (
          <Button size="sm" variant="success" disabled={!!busy}
            onClick={() => act("s", () => caseApi.sellerResponse(c.id, "AGREE", msg), "Đã đồng ý trả hàng.").then(done())}>
            Đồng ý trả hàng
          </Button>
        )}
        {can("SELLER_REQUEST_INFO") && (
          <Button size="sm" variant="outline" disabled={!!busy || !msg.trim()}
            onClick={() => act("s", () => caseApi.sellerResponse(c.id, "REQUEST_INFO", msg), "Đã yêu cầu người mua bổ sung.").then(done())}>
            Yêu cầu bổ sung (1 lần)
          </Button>
        )}
        {can("SELLER_REJECT") && (
          <Button size="sm" variant="danger" disabled={!!busy || !msg.trim()}
            onClick={() => act("s", () => caseApi.sellerResponse(c.id, "REJECT", msg), "Đã từ chối yêu cầu.").then(done())}>
            Từ chối
          </Button>
        )}
        {can("BUYER_SUPPLEMENT") && (
          <Button size="sm" disabled={!!busy || !msg.trim()}
            onClick={() => act("b", () => caseApi.buyerSupplement(c.id, msg), "Đã gửi bổ sung.").then(done())}>
            Gửi bổ sung
          </Button>
        )}
        {can("BUYER_ESCALATE") && (
          <Button size="sm" disabled={!!busy}
            onClick={() => act("b", () => caseApi.buyerChoice(c.id, "ESCALATE", msg), "Đã chuyển RePrice giải quyết.").then(done())}>
            Yêu cầu RePrice giải quyết
          </Button>
        )}
        {can("BUYER_WITHDRAW") && (
          <Button size="sm" variant="ghost" disabled={!!busy}
            onClick={() => act("b", () => caseApi.buyerChoice(c.id, "WITHDRAW", msg), "Đã kết thúc yêu cầu.").then(done())}>
            Kết thúc yêu cầu
          </Button>
        )}
        {can("RETURN_HANDOVER") && (
          <>
            <Button size="sm" disabled={!!busy}
              onClick={() => act("b", () => caseApi.returnHandover(c.id, ""), "Đã bàn giao hàng trả.").then(done())}>
              Tôi đã bàn giao hàng trả
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy || !msg.trim()}
              onClick={() => act("b", () => caseApi.returnHandover(c.id, msg), "Đã báo trở ngại, RePrice sẽ xử lý.").then(done())}>
              Báo không thể gửi trả
            </Button>
          </>
        )}
        {can("RETURN_INSPECT") && (
          <>
            <Button size="sm" variant="success" disabled={!!busy}
              onClick={() => act("s", () => caseApi.returnInspection(c.id, "OK"), "Đã xác nhận hàng trả phù hợp.").then(done())}>
              Hàng trả phù hợp
            </Button>
            <select className="input w-auto py-1" value={problem} onChange={(e) => setProblem(e.target.value)} aria-label="Vấn đề hàng trả">
              <option value="WRONG_DEVICE">Sai máy</option>
              <option value="MISSING_ITEMS">Thiếu hàng</option>
              <option value="NEW_DAMAGE">Hư hỏng mới</option>
              <option value="OTHER">Vấn đề khác</option>
            </select>
            <Button size="sm" variant="danger" disabled={!!busy || !msg.trim()}
              onClick={() => act("s", () => caseApi.returnInspection(c.id, "PROBLEM", problem, msg), "Đã báo vấn đề hàng trả.").then(done())}>
              Báo vấn đề hàng trả
            </Button>
          </>
        )}
        {can("REQUEST_REVIEW") && (
          <Button size="sm" variant="outline" disabled={!!busy || !msg.trim()}
            onClick={() => act("r", () => caseApi.reviewRequest(c.id, msg), "Đã đề nghị xem xét lại.").then(done())}>
            Đề nghị xem xét lại phương án
          </Button>
        )}
      </div>
    </div>
  );
}

/** Thao tác của QTV khi hồ sơ ở RePrice. */
function AdminPanel({ c, can, busy, act }) {
  const [decision, setDecision] = useState("REFUND_NO_RETURN");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState(String(c.committedSnapshot?.agreedPrice || ""));
  const [party, setParty] = useState("SELLER");
  if (!["ADMIN_ASSIGN", "ADMIN_RESOLVE", "ADMIN_REQUEST_INFO", "ADMIN_VERIFY_SHIPPING"].some(can)) return null;
  return (
    <div className="card border-purple-200 p-5 text-sm">
      <h2 className="font-semibold text-purple-800">Xử lý của RePrice (QTV)</h2>
      {can("ADMIN_ASSIGN") && (
        <Button size="sm" variant="outline" className="mt-2" disabled={!!busy} onClick={() => act("a", () => caseApi.assign(c.id), "Đã nhận xử lý hồ sơ.")}>
          Nhận xử lý
        </Button>
      )}
      {can("ADMIN_RESOLVE") && (
        <>
          <label className="label mt-3" htmlFor="admin-text">Nội dung (căn cứ, câu hỏi hoặc yêu cầu)</label>
          <textarea id="admin-text" className="input min-h-[72px]" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)} aria-label="Phương án">
              {Object.entries(RESOLUTION_DECISION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {decision === "REFUND_NO_RETURN" && (
              <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label="Số tiền hoàn" />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy || !text.trim()}
              onClick={() => act("a", () => caseApi.resolve(c.id, decision, text, decision === "REFUND_NO_RETURN" ? Number(amount) : undefined), "Đã ban hành phương án.")}>
              Ban hành phương án
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <select className="input w-auto py-1" value={party} onChange={(e) => setParty(e.target.value)} aria-label="Bên cần bổ sung">
              <option value="SELLER">Người bán</option>
              <option value="BUYER">Người mua</option>
            </select>
            <Button size="sm" variant="outline" disabled={!!busy || !text.trim()}
              onClick={() => act("a", () => caseApi.requestInfo(c.id, party, text, 48), "Đã yêu cầu bổ sung (48 giờ).")}>
              Yêu cầu bổ sung
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !text.trim()}
              onClick={() => act("a", () => caseApi.verifyShipping(c.id, text), "Đã gửi yêu cầu xác minh vận chuyển (mô phỏng).")}>
              Gửi xác minh vận chuyển
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-500">Phương án có hiệu lực sau 48 giờ nếu hai bên không đề nghị xem xét lại.</p>
        </>
      )}
    </div>
  );
}

function ReturnShipment({ c, busy, act }) {
  const s = c.returnShipment;
  const canAdvance = ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(s.status);
  return (
    <div className="card p-5 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">Vận đơn trả hàng</h2>
        <span className="font-medium">{SHIPMENT_STATUS[s.status]}</span>
      </div>
      <p className="mt-1 text-xs text-ink-500">{s.carrier} · {s.trackingCode}</p>
      {c.returnAddress && (
        <p className="mt-1 text-xs text-ink-600">
          Gửi về: {c.returnAddress.recipientName} · {c.returnAddress.recipientPhone} · {c.returnAddress.addressLine}, {c.returnAddress.ward}, {c.returnAddress.province}
        </p>
      )}
      <ol className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3 text-xs">
        {s.events.map((e, i) => <li key={i}><b>{SHIPMENT_STATUS[e.status]}</b> · {formatDateTime(e.occurredAt)} · {e.note}</li>)}
      </ol>
      {canAdvance && (
        <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3">
          <div className="text-xs font-semibold text-amber-800">Đơn vị vận chuyển (mô phỏng)</div>
          <Button size="sm" variant="outline" className="mt-2" disabled={!!busy} onClick={() => act("ship", () => demoApi.advanceShipment(s.id))}>
            Báo mốc tiếp theo
          </Button>
        </div>
      )}
    </div>
  );
}

function RefundBox({ c, isAdmin, busy, act, can }) {
  const r = c.refund;
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Hoàn tiền</h2>
      <p className="mt-1"><b>{formatVND(r.amount)}</b> · {REFUND_STATUS[r.status]}</p>
      {r.failureReason && <p className="text-xs text-red-700">{r.failureReason}</p>}
      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.allowedActions.includes("PROCESS") && (
            <Button size="sm" disabled={!!busy} onClick={() => act("rf", () => caseApi.processRefund(r.id), "Đã gửi lệnh hoàn.")}>Gửi lệnh hoàn</Button>
          )}
          {r.allowedActions.includes("RETRY") && (
            <Button size="sm" disabled={!!busy} onClick={() => act("rf", () => caseApi.retryRefund(r.id), "Đã gửi lại lệnh hoàn.")}>Gửi lại lệnh hoàn</Button>
          )}
          {["PROCESSING", "RECONCILING"].includes(r.status) && (
            <span className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-2 py-1">
              <span className="text-xs text-amber-800">Cổng thanh toán (mô phỏng):</span>
              <Button size="sm" variant="success" disabled={!!busy} onClick={() => act("rf", () => caseApi.demoRefundResult(r.id, "SUCCEEDED"), "Hoàn tiền thành công.")}>Thành công</Button>
              <Button size="sm" variant="danger" disabled={!!busy} onClick={() => act("rf", () => caseApi.demoRefundResult(r.id, "FAILED"))}>Thất bại</Button>
              {r.status === "PROCESSING" && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("rf", () => caseApi.demoRefundResult(r.id, "UNKNOWN"))}>Chưa rõ kết quả</Button>
              )}
            </span>
          )}
        </div>
      )}
      {can("REPORT_REFUND_NOT_RECEIVED") && (
        <Button size="sm" variant="ghost" className="mt-2" disabled={!!busy}
          onClick={() => act("rf", () => caseApi.refundNotReceived(c.id, "Chưa thấy tiền về tài khoản"), "Đã báo RePrice kiểm tra.")}>
          Báo chưa nhận được tiền hoàn
        </Button>
      )}
    </div>
  );
}

function EvidenceForm({ busy, onSend }) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Gửi thêm bằng chứng</h2>
      <textarea className="input mt-2 min-h-[60px]" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú bằng chứng" />
      <input type="file" multiple accept="image/*,video/mp4,video/webm,application/pdf" className="mt-2 block text-xs" onChange={(e) => setFiles([...e.target.files].slice(0, 6))} aria-label="Tệp bằng chứng" />
      <p className="mt-1 text-xs text-ink-400">Ảnh, video MP4/WebM hoặc PDF; tối đa 6 tệp, mỗi tệp 20MB.</p>
      <Button size="sm" className="mt-2" disabled={!!busy || (!note.trim() && files.length === 0)}
        onClick={async () => {
          const ok = await onSend(note, files);
          if (ok) {
            setNote("");
            setFiles([]);
          }
        }}>
        {busy === "evidence" ? "Đang gửi…" : "Gửi bằng chứng"}
      </Button>
    </div>
  );
}

function EvidenceList({ evidence }) {
  if (!evidence.length) return null;
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Bằng chứng</h2>
      <ul className="mt-2 space-y-3">
        {evidence.map((e) => (
          <li key={e.id}>
            <div className="text-xs text-ink-500">{PARTY_LABEL[e.role]} {e.uploadedBy.fullName} · {formatDateTime(e.createdAt)}</div>
            {e.note && <div className="text-ink-800">{e.note}</div>}
            <div className="mt-1 flex flex-wrap gap-2">
              {e.files.map((f) =>
                f.mimeType.startsWith("image/") ? (
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt={f.fileName} className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
                  </a>
                ) : (
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="rounded border border-gray-200 px-2 py-1 text-xs text-brand-600">
                    {f.fileName}
                  </a>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
