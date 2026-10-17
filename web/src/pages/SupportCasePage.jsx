import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import EvidenceUploader from "../components/EvidenceUploader";
import DataBadge from "../components/DataBadge";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  ShippingStatusBadge,
  SupportStatusBadge,
  RefundStatusBadge,
  VerificationTicketBadge,
  PayoutStatusBadge,
} from "../components/StatusBadge";
import { formatVND, formatDate, phoneName } from "../utils/format";

/**
 * CHI TIẾT HỒ SƠ TRẢ HÀNG – HOÀN TIỀN – KHIẾU NẠI (mô phỏng).
 * Người mua, người bán và quản lý cùng xem MỘT hồ sơ, cùng mã, cùng dữ liệu.
 * Không có backend: mọi thao tác chỉ mô phỏng và lưu trong localStorage.
 */

/** Hiển thị thời điểm: ISO có giờ → định dạng; chuỗi "YYYY-MM-DD HH:mm" giữ nguyên. */
function fmtTime(t) {
  if (!t) return "";
  const s = String(t);
  if (s.includes("T")) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  }
  return s;
}

function Row({ label, children }) {  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function Card({ title, badge, children }) {
  return (
    <div className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          {title}
        </h2>
        {badge}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function SupportCasePage() {
  const { id, caseId } = useParams();
  const app = useApp();
  const {
    orders,
    user,
    getPhone,
    transactions,
    sellerPayoutEligibility,
    // actions
    addCaseEvidence,
    sellerRespondCase,
    buyerSupplementCase,
    buyerChooseAfterReject,
    withdrawCase,
    managerTakeCase,
    managerRequestCaseInfo,
    managerVerifyShipping,
    managerRequestTechnicalCheck,
    managerIssuePlan,
    managerResolvePlanReview,
    sellerProvideReturnInfo,
    buyerMarkReturnHandedOver,
    advanceReturnShipment,
    reportReturnProblem,
    sellerConfirmReturnOk,
    reportReturnObstacle,
    startRefund,
    confirmRefundDone,
    markRefundFailed,
    confirmRefundReconcile,
    buyerReportRefundNotReceived,
    closeCase,
    demoMakeOverdue,
    simulateSupportExpiry,
    showToast,
    // rules & constants
    RETURN_STATUS,
    RETURN_STATUS_LABEL,
    PAYMENT_STATUS_LABEL,
    RETURN_SHIPMENT_STATUS,
    RETURN_SHIPMENT_STATUS_LABEL,
    RETURN_OBSTACLES,
    REFUND_STATUS,
    VERIFICATION_STATUS,
    VERIFICATION_OUTCOME,
    VERIFICATION_OUTCOME_LABEL,
    CASE_TYPE,
    CASE_TYPE_LABEL,
    CASE_DEADLINES,
    CASE_REASON_OPTIONS,
    RETURN_REASON_KEYS,
    remainingText,
    casePendingStep,
    canWithdrawCase,
    planMissingFields,
    planTotals,
    maskAddress,
    maskTracking,
    maskPaymentMethod,
    partyOf,
    isRefundRunning,
    isReturnInMotion,
  } = app;

  const order = orders.find((o) => o.id === id);
  const req = order
    ? (order.supportRequests || []).find((r) => r.id === caseId)
    : null;

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Form states
  const [evText, setEvText] = useState("");
  const [evFiles, setEvFiles] = useState([]);
  const [sellerFiles, setSellerFiles] = useState([]);
  const [sellerAction, setSellerAction] = useState("AGREE");
  const [sellerNote, setSellerNote] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [suppText, setSuppText] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [plan, setPlan] = useState({
    conclusion: "",
    basis: "",
    requiresReturn: true,
    goodsAmount: order?.negotiatedPrice ?? "",
    feesText: "",
    returnAddress: "",
    tasksText: "",
    refundMethod: "",
  });
  const [verify, setVerify] = useState({ issue: "", question: "", channel: "", response: "", outcome: "" });
  const [infoNote, setInfoNote] = useState("");
  const [techNote, setTechNote] = useState("");
  const [problem, setProblem] = useState({ reason: RETURN_OBSTACLES[0], description: "" });
  const [refundFailReason, setRefundFailReason] = useState("");
  const [notReceivedNote, setNotReceivedNote] = useState("");

  const phone = order ? getPhone(order.phoneId) : null;

  const party = order ? partyOf(order, { userId: user?.id, role: user?.role }) : "OUTSIDER";
  const isBuyer = party === "BUYER";
  const isSeller = party === "SELLER";
  const isManager = party === "MANAGER";

  const myEvidence = useMemo(() => {
    if (!req) return [];
    return (req.evidenceList || []).filter(
      (e) => e.visibility !== "ADMIN" || isManager
    );
  }, [req, isManager]);

  if (!order) return <Navigate to="/phones" replace />;
  if (!req) {
    return (
      <div className="container-x py-10">
        <p className="text-ink-700">Không tìm thấy hồ sơ.</p>
        <Link to={`/orders/${id}`} className="text-brand-600">← Về đơn hàng</Link>
      </div>
    );
  }
  if (party === "OUTSIDER") {
    return (
      <div className="container-x py-10">
        <div className="card mx-auto max-w-xl p-6">
          <h1 className="text-lg font-semibold text-ink-900">Không có quyền xem hồ sơ</h1>
          <p className="mt-2 text-sm text-ink-600">
            Chỉ người mua, người bán của đơn và quản lý RePrice được xem hồ sơ này.
          </p>
          <Link to="/phones" className="mt-3 inline-block text-brand-600">← Về trang chủ</Link>
        </div>
      </div>
    );
  }

  const step = casePendingStep(req);
  const open = [
    RETURN_STATUS.PENDING_SELLER,
    RETURN_STATUS.SELLER_SUPPLEMENT,
    RETURN_STATUS.IN_PROGRESS,
    RETURN_STATUS.AFTER_REJECT_BUYER,
    RETURN_STATUS.PENDING_MANAGER,
    RETURN_STATUS.NEEDS_INFO,
    RETURN_STATUS.UNDER_REVIEW,
    RETURN_STATUS.AWAITING_PLAN,
    RETURN_STATUS.PLAN_REVIEW,
    RETURN_STATUS.RETURN_PENDING_INFO,
    RETURN_STATUS.ACCEPTED_RETURN,
    RETURN_STATUS.RETURN_AWAITING_HANDOVER,
    RETURN_STATUS.RETURNING,
    RETURN_STATUS.RETURNED,
    RETURN_STATUS.RETURN_OBSTACLE,
    RETURN_STATUS.RETURN_DISPUTE,
    RETURN_STATUS.REFUND_ELIGIBLE,
    RETURN_STATUS.REFUND_PROCESSING,
    RETURN_STATUS.PENDING_REFUND,
    RETURN_STATUS.REFUND_RECONCILE,
  ].includes(req.status);

  const withdrawGate = canWithdrawCase(order, req, { userId: user?.id, role: user?.role });
  const refundRunning = isRefundRunning(req);
  const returnInMotion = isReturnInMotion(req);
  const payout = sellerPayoutEligibility(order, new Date());
  const tx = (transactions || []).find((t) => t.orderId === order.id);
  const planTotal = planTotals(req.plan || {});

  const run = (res, okMsg) => {
    if (res?.ok) {
      showToast(okMsg);
      setError("");
    } else {
      setError(res?.reason || "Không thể thực hiện thao tác.");
    }
    return res;
  };

  const planInput = () => ({
    conclusion: plan.conclusion,
    basis: plan.basis,
    requiresReturn: plan.requiresReturn,
    goodsAmount: Number(plan.goodsAmount),
    fees: String(plan.feesText)
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [label, amount] = s.split("=");
        return { label: (label || "Phí").trim(), amount: Number((amount || "").trim()) || 0 };
      }),
    returnAddress: plan.returnAddress,
    tasks: String(plan.tasksText)
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [who, what, dueAt] = s.split("|").map((x) => (x || "").trim());
        return { who, what, dueAt };
      }),
    refundMethod: plan.refundMethod,
  });

  const missingPlan = planMissingFields(planInput());

  return (
    <div className="container-x py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Hồ sơ {req.id}</h1>
            <p className="mt-1 text-sm text-ink-500">
              {CASE_TYPE_LABEL[req.type] || "Yêu cầu"} · Đơn {order.id} · Mở lúc {formatDate(req.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataBadge />
            <SupportStatusBadge status={req.status} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
          <ShippingStatusBadge status={order.shippingStatus} />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Ai cần làm gì trước thời điểm nào */}
        <div className="card mt-4 border-brand-200 bg-brand-50 p-5">
          <div className="text-sm font-semibold text-brand-900">
            {open ? "Việc cần làm tiếp theo" : "Hồ sơ đã khép lại"}
          </div>
          {open ? (
            <p className="mt-1 text-sm text-brand-800">
              {step.party === "BUYER"
                ? "Người mua"
                : step.party === "SELLER"
                ? "Người bán"
                : step.party === "MANAGER"
                ? "Quản lý RePrice"
                : step.party === "CARRIER"
                ? "Đơn vị vận chuyển (mô phỏng)"
                : "Hệ thống"}{" "}
              cần: <strong>{step.text}</strong>
              {step.dueAt ? (
                <>
                  {" "}· Hạn {formatDate(step.dueAt)} ({remainingText(step.dueAt)})
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-brand-800">{req.resolution || RETURN_STATUS_LABEL[req.status]}</p>
          )}
        </div>

        {/* Vấn đề & cam kết lúc mua */}
        <Card title="Vấn đề & thông tin máy lúc đặt hàng">
          <dl>
            <Row label="Lý do">{req.reason}</Row>
            <Row label="Mã chi tiết">TXD-{order.id}-{order.phoneId}</Row>
            <Row label="Thời điểm phát hiện">{formatDate(req.detectedAt)}</Row>
            <Row label="Mã hồ sơ trước">{req.prevCaseId || "—"}</Row>
          </dl>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{req.description}</p>
          {req.reflectionNote && (
            <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-ink-700">
              <span className="font-semibold">Ghi chú phản ánh: </span>
              {req.reflectionNote}
            </p>
          )}
          <div className="mt-4 rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Cam kết lúc mua (bản ghi tại thời điểm đặt hàng)
            </div>
            {order.agreementSnapshot ? (
              <dl className="mt-2">
                <Row label="Máy">
                  {order.agreementSnapshot.model || "—"} · {order.agreementSnapshot.storage || "—"} ·{" "}
                  {order.agreementSnapshot.color || "—"}
                </Row>
                <Row label="Tình trạng">{order.agreementSnapshot.condition || "—"}</Row>
                <Row label="Pin">{order.agreementSnapshot.batteryHealth ?? "—"}%</Row>
                <Row label="Giá chốt">{formatVND(order.agreementSnapshot.finalPrice)}</Row>
                <Row label="Phiên bản chính sách">{order.agreementSnapshot.policyVersion}</Row>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                Chưa có dữ liệu lưu tại thời điểm đặt hàng (đơn cũ). Không lấy tin đăng hiện tại thay thế.
              </p>
            )}
          </div>
        </Card>

        {/* Bằng chứng */}
        <Card title="Bằng chứng" badge={<span className="text-xs text-ink-400">Đã gửi thì không sửa/xóa</span>}>
          {myEvidence.length === 0 ? (
            <p className="text-sm text-ink-500">Chưa có bằng chứng.</p>
          ) : (
            <ul className="space-y-2">
              {myEvidence.map((e) => (
                <li key={e.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                    <span>
                      {e.by} · {formatDate(e.at)}
                      {e.visibility === "ADMIN" ? " · chỉ quản trị" : ""}
                    </span>
                    <span className="font-mono">{e.id}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-800">{e.text}</p>
                  {e.files && e.files.length > 0 && (
                    <p className="mt-1 text-xs text-ink-500">
                      Ảnh/video đính kèm (chỉ lưu tên/kích thước/loại, không lưu
                      nội dung):{" "}
                      {e.files
                        .map((f) => `${f.name}${f.size ? ` (${Math.round(f.size / 1024)} KB)` : ""}`)
                        .join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {open && (isBuyer || isSeller || isManager) && (
            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <textarea
                className="input w-full"
                rows={2}
                placeholder="Bổ sung bằng chứng/mô tả (không thể sửa hay xóa sau khi gửi)"
                value={evText}
                onChange={(e) => setEvText(e.target.value)}
              />
              <div className="mt-2">
                <EvidenceUploader files={evFiles} onChange={setEvFiles} />
              </div>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const res = run(
                      addCaseEvidence(order.id, req.id, {
                        text: evText,
                        files: evFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
                        visibility: isManager ? "ADMIN" : "PARTIES",
                      }),
                      "Đã bổ sung bằng chứng."
                    );
                    if (res?.ok) {
                      setEvText("");
                      setEvFiles([]);
                    }
                  }}
                >
                  Bổ sung bằng chứng
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Phản hồi cho các bên */}
        <Card title="Trao đổi giữa các bên">
          {(req.messages || []).length === 0 ? (
            <p className="text-sm text-ink-500">Chưa có trao đổi.</p>
          ) : (
            <div className="space-y-2">
              {req.messages.map((m, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-2 text-sm">
                  <span className="font-medium">
                    {m.from === "buyer" ? "Người mua" : m.from === "seller" ? "Người bán" : "Quản lý"}:
                  </span>{" "}
                  {m.text}
                  <span className="ml-1 text-xs text-ink-400">({fmtTime(m.time)})</span>
                </div>
              ))}
            </div>
          )}
          {isManager && (req.internalNotes || []).length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold text-amber-800">Ghi chú nội bộ (chỉ quản lý)</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                {req.internalNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Người bán phản hồi */}
        {isSeller && req.status === RETURN_STATUS.PENDING_SELLER && (
          <Card title="Phản hồi của người bán" badge={<span className="text-xs text-ink-400">Hạn {CASE_DEADLINES.SELLER_RESPONSE_HOURS} giờ</span>}>
            <div className="flex flex-wrap gap-2">
              {["AGREE", "REJECT", "REQUEST_INFO"].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setSellerAction(a)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    sellerAction === a
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-ink-600"
                  }`}
                >
                  {a === "AGREE" ? "Đồng ý trả hàng" : a === "REJECT" ? "Từ chối" : "Đề nghị bổ sung"}
                </button>
              ))}
            </div>
            <textarea
              className="input mt-2 w-full"
              rows={2}
              placeholder={sellerAction === "REJECT" ? "Lý do từ chối (bắt buộc)" : "Nội dung"}
              value={sellerNote}
              onChange={(e) => setSellerNote(e.target.value)}
            />
            {sellerAction === "AGREE" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder="Người nhận trả (nếu đã xác định)"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Địa chỉ nhận trả (nếu đã xác định)"
                  value={receiverAddress}
                  onChange={(e) => setReceiverAddress(e.target.value)}
                />
              </div>
            )}
            <p className="mt-2 text-xs text-ink-500">
              Nếu người bán không phản hồi trong {CASE_DEADLINES.SELLER_RESPONSE_HOURS} giờ, người mua có thể chuyển quản lý.
              Không yêu cầu mật khẩu, tháo máy hoặc tự chịu phí kiểm tra.
            </p>
            <div className="mt-2">
              <div className="label">Ảnh/video bằng chứng (tuỳ chọn)</div>
              <EvidenceUploader files={sellerFiles} onChange={setSellerFiles} />
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => {
                  const res = run(
                    sellerRespondCase(order.id, req.id, sellerAction, {
                      note: sellerNote,
                      receiverName,
                      receiverAddress,
                      files: sellerFiles.map((f) => ({
                        name: f.name,
                        size: f.size,
                        type: f.type,
                      })),
                    }),
                    "Đã gửi phản hồi."
                  );
                  if (res?.ok) {
                    setSellerNote("");
                    setSellerFiles([]);
                  }
                }}
              >
                Gửi phản hồi
              </Button>
            </div>
          </Card>
        )}

        {/* Người mua bổ sung */}
        {isBuyer &&
          [RETURN_STATUS.SELLER_SUPPLEMENT, RETURN_STATUS.NEEDS_INFO].includes(req.status) && (
            <Card title="Bổ sung theo yêu cầu">
              <textarea
                className="input w-full"
                rows={2}
                placeholder="Trả lời / giải thích vì sao chưa cung cấp được"
                value={suppText}
                onChange={(e) => setSuppText(e.target.value)}
              />
              <div className="mt-2">
                <Button
                  size="sm"
                  onClick={() =>
                    run(buyerSupplementCase(order.id, req.id, { text: suppText }), "Đã bổ sung.")
                  }
                >
                  Gửi bổ sung
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-500">
                Hạn bổ sung {CASE_DEADLINES.BUYER_SUPPLEMENT_HOURS} giờ; sau đó người bán có{" "}
                {CASE_DEADLINES.SELLER_AFTER_SUPPLEMENT_HOURS} giờ để quyết định lại.
              </p>
            </Card>
          )}

        {/* Sau khi người bán từ chối */}
        {isBuyer && req.status === RETURN_STATUS.AFTER_REJECT_BUYER && (
          <div className="card mt-4 border-amber-200 bg-amber-50 p-5">
            <div className="text-sm font-semibold text-amber-900">Người bán đã từ chối</div>
            <p className="mt-1 text-sm text-amber-800">
              Bạn có {CASE_DEADLINES.BUYER_AFTER_REJECT_HOURS} giờ để chọn. Không phản hồi sẽ tự chuyển quản lý
              (không coi im lặng là đồng ý).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run(buyerChooseAfterReject(order.id, req.id, "ESCALATE"), "Đã chuyển quản lý.")}>
                Yêu cầu RePrice giải quyết
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(buyerChooseAfterReject(order.id, req.id, "CLOSE"), "Đã kết thúc yêu cầu.")}>
                Đồng ý kết thúc yêu cầu
              </Button>
            </div>
          </div>
        )}

        {/* Quản lý xử lý */}
        {isManager && open && (
          <Card title="Công cụ quản lý" badge={<DataBadge />}>
            <div className="flex flex-wrap gap-2">
              {[RETURN_STATUS.PENDING_MANAGER, RETURN_STATUS.NEEDS_INFO, RETURN_STATUS.UNDER_REVIEW, RETURN_STATUS.PLAN_REVIEW].includes(req.status) && (
                <Button size="sm" variant="outline" onClick={() => run(managerTakeCase(order.id, req.id), "Đã nhận phụ trách.")}>
                  Nhận phụ trách
                </Button>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <div className="text-xs font-semibold text-ink-600">Yêu cầu bổ sung</div>
              <input
                className="input mt-2 w-full"
                placeholder="Nội dung cần bổ sung"
                value={infoNote}
                onChange={(e) => setInfoNote(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => run(managerRequestCaseInfo(order.id, req.id, infoNote, "BUYER"), "Đã yêu cầu người mua bổ sung.")}>
                  Yêu cầu người mua
                </Button>
                <Button size="sm" variant="outline" onClick={() => run(managerRequestCaseInfo(order.id, req.id, infoNote, "SELLER"), "Đã yêu cầu người bán bổ sung.")}>
                  Yêu cầu người bán
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <div className="text-xs font-semibold text-ink-600">Cần kiểm tra kỹ thuật</div>
              <input className="input mt-2 w-full" placeholder="Ghi nhận nội dung cần kiểm tra" value={techNote} onChange={(e) => setTechNote(e.target.value)} />
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => run(managerRequestTechnicalCheck(order.id, req.id, techNote), "Đã ghi nhận — chờ hoàn thiện phương án.")}>
                  Ghi nhận (chờ hoàn thiện phương án)
                </Button>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Phí/đơn vị kiểm tra kỹ thuật chưa được chốt — hệ thống không tự quyết.
              </p>
            </div>

            {/* Phiếu xác minh vận chuyển */}
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-ink-600">Phiếu xác minh vận chuyển</div>
                {req.verification && <VerificationTicketBadge status={req.verification.status} />}
              </div>
              {req.verification ? (
                <dl className="mt-2">
                  <Row label="Mã vận đơn">{maskTracking(req.verification.trackingCode, true)}</Row>
                  <Row label="Mã yêu cầu">{req.verification.requestCode}</Row>
                  <Row label="Kênh gửi">{req.verification.channel}</Row>
                  <Row label="Nội dung">{req.verification.question || req.verification.issue}</Row>
                  {req.verification.response && <Row label="Phản hồi">{req.verification.response}</Row>}
                  {req.verification.outcome && (
                    <Row label="Nhánh kết quả">{VERIFICATION_OUTCOME_LABEL[req.verification.outcome]}</Row>
                  )}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-ink-500">Chưa lập phiếu.</p>
              )}
              <div className="mt-2 grid gap-2">
                <input className="input" placeholder="Vấn đề cần xác minh" value={verify.issue} onChange={(e) => setVerify({ ...verify, issue: e.target.value })} />
                <input className="input" placeholder="Câu hỏi gửi đơn vị vận chuyển" value={verify.question} onChange={(e) => setVerify({ ...verify, question: e.target.value })} />
                <input className="input" placeholder="Kênh gửi (mô phỏng)" value={verify.channel} onChange={(e) => setVerify({ ...verify, channel: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => run(managerVerifyShipping(order.id, req.id, "send", verify), "Đã lập phiếu xác minh (mô phỏng).")}>
                    Lập/gửi phiếu
                  </Button>
                </div>
                {req.verification && (
                  <>
                    <input className="input" placeholder="Nội dung phản hồi nhận được" value={verify.response} onChange={(e) => setVerify({ ...verify, response: e.target.value })} />
                    <Button size="sm" variant="outline" onClick={() => run(managerVerifyShipping(order.id, req.id, "respond", verify), "Đã ghi nhận phản hồi.")}>
                      Ghi nhận phản hồi
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(VERIFICATION_OUTCOME).map((o) => (
                        <Button
                          key={o}
                          size="sm"
                          variant="outline"
                          onClick={() => run(managerVerifyShipping(order.id, req.id, "outcome", { outcome: o }), "Đã ghi nhận nhánh kết quả.")}
                        >
                          {VERIFICATION_OUTCOME_LABEL[o]}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Phương án xử lý */}
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <div className="text-xs font-semibold text-ink-600">Phương án xử lý</div>
              <input className="input mt-2 w-full" placeholder="Kết luận" value={plan.conclusion} onChange={(e) => setPlan({ ...plan, conclusion: e.target.value })} />
              <input className="input mt-2 w-full" placeholder="Căn cứ / bằng chứng làm cơ sở" value={plan.basis} onChange={(e) => setPlan({ ...plan, basis: e.target.value })} />
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={plan.requiresReturn} onChange={(e) => setPlan({ ...plan, requiresReturn: e.target.checked })} />
                Có trả hàng
              </label>
              <input className="input mt-2 w-full" placeholder="Tiền hàng được hoàn (VND)" value={plan.goodsAmount} onChange={(e) => setPlan({ ...plan, goodsAmount: e.target.value })} />
              <input className="input mt-2 w-full" placeholder="Các khoản phí, mỗi dòng: Tên= số tiền" value={plan.feesText} onChange={(e) => setPlan({ ...plan, feesText: e.target.value })} />
              <input className="input mt-2 w-full" placeholder="Nơi nhận trả (nếu có trả hàng)" value={plan.returnAddress} onChange={(e) => setPlan({ ...plan, returnAddress: e.target.value })} />
              <input className="input mt-2 w-full" placeholder="Nhiệm vụ, mỗi dòng: Ai | Làm gì | Hạn" value={plan.tasksText} onChange={(e) => setPlan({ ...plan, tasksText: e.target.value })} />
              <input className="input mt-2 w-full" placeholder="Phương thức nhận hoàn (đã che khi hiển thị)" value={plan.refundMethod} onChange={(e) => setPlan({ ...plan, refundMethod: e.target.value })} />
              {missingPlan.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">Còn thiếu: {missingPlan.join(", ")}.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => run(managerIssuePlan(order.id, req.id, planInput()), "Đã ban hành phương án (chờ hết hạn xem xét lại).")}>
                  Ban hành / cập nhật phương án
                </Button>
                {req.status === RETURN_STATUS.PLAN_REVIEW && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => run(managerResolvePlanReview(order.id, req.id, { reopen: false }), "Phương án đã có hiệu lực.")}>
                      Cho phương án có hiệu lực
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => run(managerResolvePlanReview(order.id, req.id, { reopen: true }), "Đã mở lại để xem xét.")}>
                      Mở lại xem xét
                    </Button>
                  </>
                )}
              </div>
              {req.plan && (
                <dl className="mt-3 border-t border-gray-100 pt-3">
                  <Row label="Kết luận">{req.plan.conclusion}</Row>
                  <Row label="Có trả hàng">{req.plan.requiresReturn ? "Có" : "Không"}</Row>
                  <Row label="Tiền hàng">{formatVND(planTotal.goods)}</Row>
                  <Row label="Phí">{formatVND(planTotal.feeTotal)}</Row>
                  <Row label="Tổng hoàn">{formatVND(planTotal.total)}</Row>
                  <Row label="Hạn xem xét lại">{req.plan.reviewUntil ? formatDate(req.plan.reviewUntil) : "—"}</Row>
                </dl>
              )}
            </div>
          </Card>
        )}

        {/* Thông tin nhận trả (người bán / quản lý) */}
        {(isSeller || isManager) &&
          [RETURN_STATUS.RETURN_PENDING_INFO, RETURN_STATUS.PLAN_EFFECTIVE, RETURN_STATUS.ACCEPTED_RETURN].includes(req.status) && (
            <Card title="Thông tin nhận trả">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input" placeholder="Người nhận" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
                <input className="input" placeholder="Địa chỉ nhận trả" value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} />
              </div>
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => run(sellerProvideReturnInfo(order.id, req.id, { receiverName, receiverAddress }), "Đã cập nhật thông tin nhận trả.")}>
                  Cập nhật thông tin nhận trả
                </Button>
              </div>
            </Card>
          )}

        {/* Vận đơn trả */}
        {req.returnShipment && (
          <Card title="Vận đơn trả" badge={<DataBadge />}>
            <dl>
              <Row label="Trạng thái">{RETURN_SHIPMENT_STATUS_LABEL[req.returnShipment.status] || req.returnShipment.status}</Row>
              <Row label="Mã vận đơn">{maskTracking(req.returnShipment.trackingCode, isManager || isBuyer || isSeller)}</Row>
              <Row label="Người nhận">{req.returnShipment.receiverName || "—"}</Row>
              <Row label="Địa chỉ nhận">{maskAddress(req.returnShipment.receiverAddress, isManager || isSeller)}</Row>
              {req.returnShipment.handoverDueAt && (
                <Row label="Hạn bàn giao">
                  {formatDate(req.returnShipment.handoverDueAt)} ({remainingText(req.returnShipment.handoverDueAt)})
                </Row>
              )}
              {req.returnInspectDueAt && (
                <Row label="Hạn người bán kiểm tra">
                  {formatDate(req.returnInspectDueAt)} ({remainingText(req.returnInspectDueAt)})
                </Row>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {isBuyer && req.status === RETURN_STATUS.RETURN_AWAITING_HANDOVER && (
                <Button size="sm" onClick={() => run(buyerMarkReturnHandedOver(order.id, req.id), "Đã xác nhận bàn giao hàng trả.")}>
                  Đã bàn giao hàng trả
                </Button>
              )}
              {(isSeller || isManager) &&
                [RETURN_STATUS.RETURN_PENDING_INFO, RETURN_STATUS.RETURN_AWAITING_HANDOVER, RETURN_STATUS.RETURNING].includes(req.status) && (
                  <Button size="sm" variant="outline" onClick={() => run(advanceReturnShipment(order.id, req.id), "Đã cập nhật vận đơn trả.")}>
                    Việc cần làm (vận đơn trả)
                  </Button>
                )}
            </div>
            {req.returnShipment.events && req.returnShipment.events.length > 0 && (
              <ol className="mt-3 space-y-2">
                {[...req.returnShipment.events].reverse().map((e, i) => (
                  <li key={i} className="text-xs text-ink-500">
                    {e.time} · {RETURN_SHIPMENT_STATUS_LABEL[e.status] || e.status} — {e.description}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}

        {/* Người bán kiểm tra hàng trả */}
        {isSeller && req.status === RETURN_STATUS.RETURNED && (
          <Card title="Kiểm tra hàng trả" badge={<span className="text-xs text-ink-400">Hạn {CASE_DEADLINES.RETURN_INSPECT_HOURS} giờ</span>}>
            <Button size="sm" onClick={() => run(sellerConfirmReturnOk(order.id, req.id), "Đã xác nhận hàng trả phù hợp.")}>
              Xác nhận hàng trả phù hợp
            </Button>
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <div className="text-xs font-semibold text-ink-600">Báo vấn đề hàng trả</div>
              <input className="input mt-2 w-full" placeholder="Vấn đề (sai máy, thiếu hàng, hư hỏng mới)" value={problem.reason} onChange={(e) => setProblem({ ...problem, reason: e.target.value })} />
              <textarea className="input mt-2 w-full" rows={2} placeholder="Mô tả" value={problem.description} onChange={(e) => setProblem({ ...problem, description: e.target.value })} />
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => run(reportReturnProblem(order.id, req.id, problem), "Đã báo vấn đề — chuyển quản lý.")}>
                  Báo vấn đề hàng trả
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Trở ngại trả hàng */}
        {open && (isBuyer || isSeller || isManager) && (
          <Card title="Báo trở ngại gửi trả">
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1" placeholder="Trở ngại" value={problem.reason} onChange={(e) => setProblem({ ...problem, reason: e.target.value })} />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  run(reportReturnObstacle(order.id, req.id, { reason: problem.reason, note: problem.description }), "Đã ghi nhận trở ngại.")
                }
              >
                Ghi nhận trở ngại
              </Button>
            </div>
          </Card>
        )}

        {/* Trạng thái tiền & hoàn tiền */}
        <Card
          title="Trạng thái tiền"
          badge={req.refund ? <RefundStatusBadge status={req.refund.status} /> : <span className="text-xs text-ink-400">Mô phỏng</span>}
        >
          <dl>
            <Row label="Trạng thái thanh toán">{PAYMENT_STATUS_LABEL[order.paymentStatus] || order.paymentStatus}</Row>
            <Row label="Chi trả người bán">{payout.status === "PAID_SIMULATED" ? "Đã ghi nhận chi trả (mô phỏng)" : payout.status === "ELIGIBLE" ? "Đủ điều kiện chi trả" : "Chờ đủ điều kiện chi trả"}</Row>
            {tx && <Row label="Bản ghi giao dịch">{tx.id}</Row>}
          </dl>
          {req.refund && (
            <dl className="mt-3 border-t border-gray-100 pt-3">
              <Row label="Mã giao dịch hoàn">{req.refund.id}</Row>
              <Row label="Mã thanh toán gốc">{req.refund.paymentRefId || "—"}</Row>
              <Row label="Tiền hàng">{formatVND(req.refund.goodsAmount)}</Row>
              <Row label="Phí">{formatVND((req.refund.fees || []).reduce((s, f) => s + (Number(f.amount) || 0), 0))}</Row>
              <Row label="Tổng tiền hoàn">{formatVND(req.refund.totalAmount)}</Row>
              <Row label="Phương thức nhận">{maskPaymentMethod(req.refund.method, isManager)}</Row>
              {req.refund.completedAt && <Row label="Hoàn lúc">{formatDate(req.refund.completedAt)}</Row>}
              {req.refund.failureReason && <Row label="Lý do">{req.refund.failureReason}</Row>}
            </dl>
          )}
          {refundRunning && isBuyer && (
            <div className="mt-3">
              <input className="input w-full" placeholder="Ghi chú (nếu chưa nhận được tiền)" value={notReceivedNote} onChange={(e) => setNotReceivedNote(e.target.value)} />
              <Button size="sm" variant="outline" className="mt-2" onClick={() => run(buyerReportRefundNotReceived(order.id, req.id, notReceivedNote), "Đã ghi nhận — quản lý sẽ đối soát.")}>
                Báo chưa nhận được tiền hoàn
              </Button>
            </div>
          )}

          {/* Quản lý: hoàn tiền */}
          {isManager && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[RETURN_STATUS.RETURNED, RETURN_STATUS.REFUND_ELIGIBLE, RETURN_STATUS.PLAN_EFFECTIVE].includes(req.status) && (
                <Button size="sm" onClick={() => run(startRefund(order.id, req.id), "Đã khởi tạo hoàn tiền (đang xử lý, mô phỏng).")}>
                  Khởi tạo hoàn tiền
                </Button>
              )}
              {req.refund?.status === REFUND_STATUS.PROCESSING && (
                <>
                  <Button size="sm" variant="success" onClick={() => run(confirmRefundDone(order.id, req.id), "Đã xác nhận hoàn thành công (mô phỏng).")}>
                    Hoàn thành công
                  </Button>
                  <input className="input" placeholder="Lý do thất bại" value={refundFailReason} onChange={(e) => setRefundFailReason(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => run(markRefundFailed(order.id, req.id, refundFailReason), "Đã ghi nhận hoàn thất bại — chờ đối soát.")}>
                    Ghi nhận hoàn thất bại
                  </Button>
                </>
              )}
              {[REFUND_STATUS.FAILED, REFUND_STATUS.RECONCILE].includes(req.refund?.status) && (
                <Button size="sm" variant="outline" onClick={() => run(confirmRefundReconcile(order.id, req.id), "Đã đối soát thành công (mô phỏng).")}>
                  Đối soát thành công
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Rút yêu cầu */}
        {open && isBuyer && (
          <div className="card mt-4 p-5">
            <div className="text-sm font-semibold text-ink-800">Rút yêu cầu</div>
            <p className="mt-1 text-xs text-ink-500">
              {withdrawGate.allowed
                ? "Rút yêu cầu sẽ lưu lịch sử và không bắt đầu lại thời hạn 3 ngày."
                : withdrawGate.reason}
            </p>
            {withdrawGate.allowed && (
              <>
                <input className="input mt-2 w-full" placeholder="Lý do rút (không bắt buộc)" value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                <Button size="sm" variant="danger" className="mt-2" onClick={() => run(withdrawCase(order.id, req.id, withdrawReason), "Đã rút yêu cầu.")}>
                  Xác nhận rút yêu cầu
                </Button>
              </>
            )}
          </div>
        )}

        {/* Dòng thời gian */}
        <Card title="Dòng thời gian">
          <ol className="space-y-3">
            {[...(req.history || [])].reverse().map((h, i) => (
              <li key={i} className={`flex gap-3 ${h.visibility === "ADMIN" && !isManager ? "hidden" : ""}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900">{h.action}</div>
                  <div className="text-xs text-ink-500">
                    {h.actor} · {fmtTime(h.time)}
                    {h.visibility === "ADMIN" ? " · nội bộ" : ""}
                  </div>
                  {h.note && <div className="mt-0.5 text-xs text-ink-500">{h.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* Công cụ kiểm thử: chỉ Quản lý thấy (không thuộc luồng người dùng) */}
        {isManager && (
        <div className="card mt-4 border-dashed p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Điều khiển demo</h2>
            <DataBadge />
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Chỉ dùng để trình diễn luồng quá hạn. Thực tế phải do backend/scheduler thực thi — đây KHÔNG phải
            tính năng thật của khách hàng.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["SELLER_RESPONSE", "Quá hạn 48h phản hồi người bán"],
              ["BUYER_SUPPLEMENT", "Quá hạn 48h bổ sung của người mua"],
              ["SELLER_REDECISION", "Quá hạn 24h người bán quyết định lại"],
              ["BUYER_REJECT_CHOICE", "Quá hạn 48h người mua chọn sau từ chối"],
              ["PLAN_REVIEW", "Hết 48h xem xét lại phương án"],
              ["RETURN_HANDOVER", "Quá hạn 3 ngày bàn giao hàng trả"],
              ["RETURN_INSPECT", "Quá hạn 48h người bán kiểm tra hàng trả"],
            ].map(([phase, label]) => (
              <Button key={phase} size="sm" variant="outline" onClick={() => run(demoMakeOverdue(order.id, req.id, phase), "Đã mô phỏng quá hạn.")}>
                {label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => run(simulateSupportExpiry(order.id), "Đã mô phỏng hết 3 ngày hậu giao hàng.")}>
              Mô phỏng hết 3 ngày hậu giao hàng
            </Button>
          </div>
        </div>
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          <Link to={`/orders/${order.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            ← Về đơn hàng
          </Link>
          <button className="text-sm font-medium text-ink-500" onClick={() => window.history.back()}>
            Quay lại
          </button>
        </div>
      </div>
    </div>
  );
}
