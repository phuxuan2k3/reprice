import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import EvidenceUploader from "../components/EvidenceUploader";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  ShippingStatusBadge,
  SupportStatusBadge,
  VerificationBadge,
  PayoutStatusBadge,
} from "../components/StatusBadge";
import StatusBadge from "../components/StatusBadge";
import { formatVND, formatDate, phoneName, phoneUsage } from "../utils/format";
import { CARRIER_NAME, HANDOVER_METHODS, SHIPPING_STATUS_LABEL, DELIVERY_FAILURE_KINDS, SHIPPING_INCIDENT_OPTIONS } from "../data/shipping";

/** Nhãn trách nhiệm chi phí trả hàng (sau khi đã xác minh). */
const COST_LABEL = {
  SELLER: "Người bán chịu",
  BUYER: "Người mua chịu",
  ADMIN: "Quản lý quyết định",
};

const CANCEL_REASONS = [
  "Tôi đổi ý không mua nữa",
  "Tìm được mức giá tốt hơn",
  "Sai thông tin sản phẩm",
  "Không liên lạc được với người bán",
  "Lý do khác",
];

const SELLER_REJECT_REASONS = [
  "Máy đã bán cho người khác",
  "Không thể giao hàng trong khu vực này",
  "Thông tin đơn hàng không chính xác",
  "Lý do khác",
];

const FAIL_REASONS = Object.entries(DELIVERY_FAILURE_KINDS).map(([value, label]) => ({
  value,
  label,
}));

const INCIDENT_OPTIONS = SHIPPING_INCIDENT_OPTIONS;

const RESOLVE_DECISIONS = [
  { value: "ACCEPT_RETURN", label: "Chấp nhận cho trả hàng" },
  { value: "REFUND_DIRECT", label: "Khởi tạo hoàn tiền (đang xử lý, mô phỏng)" },
  { value: "NEEDS_INFO", label: "Yêu cầu bổ sung thông tin" },
  { value: "REJECT", label: "Từ chối yêu cầu" },
];

const COST_OPTIONS = [
  { value: "", label: "Chưa xác định / không áp dụng" },
  { value: "SELLER", label: "Người bán chịu" },
  { value: "BUYER", label: "Người mua chịu" },
  { value: "ADMIN", label: "Quản lý quyết định" },
];

/** Nhãn trạng thái để hiển thị trong dòng lịch sử nghiệp vụ. */
const STATUS_LABEL = {
  PENDING_BUYER: "Chờ người mua xác nhận",
  PENDING_SELLER: "Chờ người bán xác nhận",
  CONFIRMED: "Hai bên đã xác nhận",
  SHIPPING: "Đang giao hàng",
  DELIVERED: "Đã giao hàng",
  COMPLETED: "Đã nhận hàng",
  CANCELLED: "Đã hủy",
  SELLER_REJECTED: "Người bán từ chối",
  REFUNDED: "Hoàn tiền",
  ...SHIPPING_STATUS_LABEL,
};

const labelOf = (s) => STATUS_LABEL[s] || s || "—";

function Modal({ title, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function Condition({ ok, children }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
          ok ? "bg-emerald-500" : "bg-gray-300"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <span className={ok ? "text-ink-700" : "text-ink-500"}>{children}</span>
    </li>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const {
    user,
    orders,
    transactions,
    getPhone,
    confirmOrderByBuyer,
    respondOrderBySeller,
    cancelOrder,
    setOrderPaymentMethod,
    initiateQrPayment,
    simulatePaymentResult,
    advanceCodPayment,
    canStartShipping,
    prepareOrder,
    createShipment,
    advanceShipping,
    markDeliveryFailed,
    retryDelivery,
    startReturnToSeller,
    markReturnedToSeller,
    confirmOrderRefundDone,
    reportShippingIncident,
    recordSellerPayout,
    confirmReceipt,
    simulateSupportExpiry,
    createSupportRequest,
    respondSupportRequest,
    escalateOverdueSupport,
    resolveSupportRequest,
    confirmReturnReceived,
    startRefund,
    confirmRefundDone,
    openCase,
    addCaseEvidence,
    CASE_TYPE,
    CASE_TYPE_LABEL,
    CASE_REASON_OPTIONS,
    activeCase,
    partyOf,
    casePendingStep,
    RETURN_STATUS_LABEL,
    checkReferenceEligibility,
    PAYMENT_METHODS,
    PAYMENT_STATUS,
    PAYMENT_STATUS_LABEL,
    PAYOUT_STATUS,
    canCancelOrder,
    canRequestReturn,
    canRetryDelivery,
    mustReturnToSeller,
    canStartReturnToSeller,
    hasCarrierHandover,
    isBuyerRefusal,
    nextActorFor,
    canCollectCod,
    deliveryClock,
    completionStatus,
    sellerPayoutEligibility,
    isPaymentSettled,
    isPaymentRefunded,
    isRefundInProgress,
    isReturnOpen,
    isSellerResponseOverdue,
    RETURN_WINDOW_DAYS,
    SELLER_RESPONSE_HOURS,
    MAX_DELIVERY_ATTEMPTS,
    hasReviewedOrder,
    userReviews,
    showToast,
  } = useApp();

  const [modal, setModal] = useState(null);
  const [sellerAction, setSellerAction] = useState("confirm");
  const [sellerReason, setSellerReason] = useState(SELLER_REJECT_REASONS[0]);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelNote, setCancelNote] = useState("");
  const [handover, setHandover] = useState("PICKUP");
  const [failKind, setFailKind] = useState("UNREACHABLE");
  const [failNote, setFailNote] = useState("");
  const [incidentNote, setIncidentNote] = useState("");
  const [refuseNote, setRefuseNote] = useState("");
  const [supportType, setSupportType] = useState(CASE_REASON_OPTIONS[0]);
  const [caseType, setCaseType] = useState(CASE_TYPE.RETURN);
  const [supportDesc, setSupportDesc] = useState("");
  const [supportFiles, setSupportFiles] = useState([]);
  const [supportReflection, setSupportReflection] = useState("");
  const [respondMsg, setRespondMsg] = useState("");
  const [respondEscalate, setRespondEscalate] = useState(false);
  const [resolveDecision, setResolveDecision] = useState("ACCEPT_RETURN");
  const [resolveReason, setResolveReason] = useState("");
  const [resolveCost, setResolveCost] = useState("");
  const [reqId, setReqId] = useState(null);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [error, setError] = useState("");

  // Mỗi lần mở hộp thoại mở hồ sơ, làm mới tệp bằng chứng + ghi chú phản ánh.
  useEffect(() => {
    if (modal === "support") {
      setSupportFiles([]);
      setSupportReflection("");
    }
  }, [modal]);

  const order = orders.find((o) => o.id === id);
  if (!order) return <Navigate to="/phones" replace />;

  const phone = getPhone(order.phoneId);
  const isBuyer = !!user && order.buyerId === user.id;
  const isSeller = !!user && order.sellerId === user.id;
  const isManager = user?.role === "manager";
  const isParty = isBuyer || isSeller;

  const tx = order.transactionId
    ? transactions.find((t) => t.id === order.transactionId)
    : transactions.find((t) => t.orderId === order.id);

  const reviewed = hasReviewedOrder(order.id);
  const myReview = userReviews.find((r) => r.orderId === order.id);

  const eligibility = checkReferenceEligibility(order);
  const openRequests = (order.supportRequests || []).filter((r) => isReturnOpen(r));
  const clock = deliveryClock(order);
  const completion = completionStatus(order, new Date());
  const payout = sellerPayoutEligibility(order, new Date());

  const cancelCheck = canCancelOrder(order, { userId: user?.id, role: user?.role });
  const canBuyerConfirm = isBuyer && order.status === "PENDING_BUYER";
  const canSellerRespond = isSeller && order.status === "PENDING_SELLER";
  const canCancel = (isBuyer || isSeller || isManager) && cancelCheck.allowed;
  const showAltFlow =
    (isBuyer || isSeller || isManager) && cancelCheck.mode === "ALT_FLOW";
  const canChoosePayment =
    isBuyer &&
    order.status === "CONFIRMED" &&
    !isPaymentSettled(order) &&
    !isPaymentRefunded(order) &&
    !isRefundInProgress(order);
  const canInitiatePayment =
    isBuyer &&
    order.paymentMethod === "QR" &&
    !isPaymentSettled(order) &&
    !isPaymentRefunded(order) &&
    !isRefundInProgress(order);
  const canConfirmPayment =
    isBuyer &&
    order.paymentMethod === "QR" &&
    [PAYMENT_STATUS.PENDING_PAYMENT, PAYMENT_STATUS.FAILED].includes(order.paymentStatus);
  const canAdvanceCod =
    (isSeller || isManager) &&
    order.paymentMethod === "COD" &&
    canCollectCod(order) &&
    order.paymentStatus !== PAYMENT_STATUS.COD_RECONCILED &&
    !isPaymentRefunded(order) &&
    !isRefundInProgress(order);
  const canPrepare = isSeller && canStartShipping(order) && order.prepareStatus !== "READY";
  const canCreateShipment =
    isSeller && order.prepareStatus === "READY" && !order.trackingCode && canStartShipping(order);
  const shippingActive =
    (isSeller || isManager) &&
    !!order.trackingCode &&
    !["DELIVERED", "FAILED", "RETURNING", "RETURNED", "VOIDED"].includes(order.shippingStatus);
  const canFail =
    (isSeller || isManager) && order.shippingStatus === "OUT_FOR_DELIVERY";
  const canRefuseDelivery =
    isBuyer && order.shippingStatus === "OUT_FOR_DELIVERY";
  const canRetry = (isSeller || isManager) && canRetryDelivery(order);
  const canReturnToSeller = (isSeller || isManager) && canStartReturnToSeller(order);
  const canMarkReturned =
    (isSeller || isManager) && order.shippingStatus === "RETURNING";
  const canReportIncident =
    (isBuyer || isSeller || isManager) &&
    !!order.trackingCode &&
    !["DELIVERED", "RETURNED", "VOIDED"].includes(order.shippingStatus);
  const canConfirmOrderRefund =
    isManager && order.refund?.scope === "SHIPPING_RETURN" && isRefundInProgress(order);
  const nextStep = nextActorFor(order);
  const canConfirmReceipt =
    isBuyer &&
    order.shippingStatus === "DELIVERED" &&
    !order.receivedAt &&
    openRequests.length === 0;
  const canExpireSupport =
    (isBuyer || isManager) &&
    clock.hasProof &&
    !order.receivedAt &&
    !order.supportExpired &&
    completion.reasons.every((r) => r.includes(String(RETURN_WINDOW_DAYS)) || r.includes("khiếu nại"));
  const openCaseRow = activeCase(order);
  const canCreateSupport =
    isBuyer &&
    !openCaseRow &&
    (canRequestReturn(order, new Date()).allowed || order.status === "COMPLETED");
  const canReportNotReceived =
    isBuyer &&
    !openCaseRow &&
    (!!order.trackingCode || ["SHIPPING", "DELIVERED", "COMPLETED"].includes(order.status)) &&
    !isPaymentRefunded(order);
  const canEscalateOverdue =
    (isBuyer || isManager) &&
    openRequests.some((r) => isSellerResponseOverdue(r, new Date()));
  const canReconcileCod = canAdvanceCod;
  const canRecordPayout =
    (isManager || isSeller) && payout.status === PAYOUT_STATUS.ELIGIBLE;
  const canStartRefund =
    isManager &&
    isPaymentSettled(order) &&
    !isPaymentRefunded(order) &&
    !isRefundInProgress(order) &&
    (order.supportRequests || []).some((r) => r.status === "RETURNED");
  const canConfirmRefund = isManager && isRefundInProgress(order);

  const run = (res, okMsg) => {
    if (res?.ok) {
      showToast(okMsg);
      setModal(null);
      setError("");
    } else {
      setError(res?.reason || "Không thể thực hiện thao tác.");
    }
  };

  const timeline = [...order.history].reverse();
  const journey = [...(order.shippingEvents || [])].reverse();

  return (
    <div className="container-x py-8">
      <div className="mx-auto max-w-3xl">
        {/* Đầu trang */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Đơn hàng {order.id}</h1>
            <p className="mt-1 text-sm text-ink-500">
              Đặt lúc {formatDate(order.createdAt)}
              {order.updatedAt && order.updatedAt !== order.createdAt
                ? ` · Cập nhật ${formatDate(order.updatedAt)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
            <ShippingStatusBadge status={order.shippingStatus} />
          </div>
        </div>

        {/* Thông tin sản phẩm & giá */}
        <div className="card mt-6 p-5">
          <div className="flex flex-wrap items-center gap-4">
            {phone && (
              <div className="shrink-0 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
                <PhoneImage phone={phone} className="h-28 w-auto" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold text-ink-900">
                {phone ? phoneName(phone) : order.phoneId}
                {phone && (
                  <span className="ml-2 text-base font-normal text-ink-500">
                    {phone.storage}
                  </span>
                )}
              </div>
              {phone && (
                <div className="mt-1 text-sm text-ink-500">
                  {phone.condition}
                  {phone.usageTime ? ` · Dùng ${phoneUsage(phone)}` : ""}
                  {phone.batteryHealth != null ? ` · Pin ${phone.batteryHealth}%` : ""}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-ink-500">Giá rao bán: </span>
                  <span className="font-medium text-ink-900">
                    {formatVND(order.listingPrice ?? phone?.price ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="text-ink-500">Giá hai bên thống nhất: </span>
                  <span className="font-semibold text-brand-600">
                    {formatVND(order.negotiatedPrice)}
                  </span>
                </div>
                {tx && (
                  <div>
                    <span className="text-ink-500">Giá giao dịch (mô phỏng): </span>
                    <span className="font-semibold text-emerald-600">
                      {formatVND(tx.transactionPrice ?? tx.price)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <DataBadge />
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <button
              type="button"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
              onClick={() => setShowSnapshot((v) => !v)}
            >
              {showSnapshot ? "Ẩn" : "Xem"} thông tin máy lúc đặt hàng
            </button>
            {showSnapshot &&
              (order.agreementSnapshot ? (
                <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                  <InfoRow label="Model">{order.agreementSnapshot.model || "—"}</InfoRow>
                  <InfoRow label="Dung lượng">{order.agreementSnapshot.storage || "—"}</InfoRow>
                  <InfoRow label="Màu">{order.agreementSnapshot.color || "—"}</InfoRow>
                  <InfoRow label="Tình trạng">{order.agreementSnapshot.condition || "—"}</InfoRow>
                  <InfoRow label="Pin">{order.agreementSnapshot.batteryHealth ?? "—"}%</InfoRow>
                  <InfoRow label="Giá chốt">{formatVND(order.agreementSnapshot.finalPrice)}</InfoRow>
                  <InfoRow label="Phiên bản chính sách">
                    {order.agreementSnapshot.policyVersion}
                  </InfoRow>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-amber-700">
                  Chưa có dữ liệu lưu tại thời điểm đặt hàng (đơn cũ). Không lấy tin đăng hiện tại
                  thay thế.
                </p>
              ))}
          </div>
        </div>

        {/* Thông tin đơn hàng */}
        <div className="card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Thông tin đơn hàng
          </h2>
          <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
            <InfoRow label="Người mua">
              {order.buyerName}
              {isBuyer && <span className="ml-1 text-xs text-brand-600">(Bạn)</span>}
            </InfoRow>
            <InfoRow label="Người bán">
              {order.sellerName}
              {isSeller && <span className="ml-1 text-xs text-brand-600">(Bạn)</span>}
            </InfoRow>
            <InfoRow label="Địa chỉ nhận hàng">{order.address}</InfoRow>
            <InfoRow label="Hình thức thanh toán">
              {PAYMENT_METHODS[order.paymentMethod] || order.payment || "—"}
            </InfoRow>
            <InfoRow label="Phiên bản đơn hàng">
              v{order.orderVersion}
              {order.versionValid ? " (còn hiệu lực)" : " (hết hiệu lực)"}
            </InfoRow>
            <InfoRow label="Xác nhận">
              {order.confirmations.length > 0
                ? order.confirmations
                    .map(
                      (c) =>
                        `${c.role === "buyer" ? "Người mua" : "Người bán"} (v${c.version})`
                    )
                    .join(", ")
                : "Chưa có xác nhận"}
            </InfoRow>
          </dl>
        </div>

        {/* Bước tiếp theo */}
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="text-sm text-ink-700">
            <span className="font-semibold text-ink-900">Việc cần làm tiếp theo: </span>
            {nextStep.text}
          </div>
          {nextStep.party && (
            <StatusBadge
              tone={
                nextStep.party === "BUYER"
                  ? "blue"
                  : nextStep.party === "SELLER"
                  ? "amber"
                  : nextStep.party === "MANAGER"
                  ? "purple"
                  : "gray"
              }
            >
              {nextStep.party === "BUYER"
                ? "Người mua"
                : nextStep.party === "SELLER"
                ? "Người bán"
                : nextStep.party === "MANAGER"
                ? "Quản lý"
                : "Đơn vị vận chuyển"}
            </StatusBadge>
          )}
        </div>

        {/* Hàng đợi / thao tác theo vai trò */}
        <div className="card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Thao tác
          </h2>

          {!isParty && !isManager && (
            <p className="mt-3 text-sm text-ink-500">
              Bạn không phải người mua/người bán của đơn này — chỉ xem được thông tin.
            </p>
          )}

          {/* Người mua xác nhận */}
          {canBuyerConfirm && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-sm font-semibold text-blue-900">Xác nhận đơn hàng</div>
              <p className="mt-1 text-xs text-blue-700">
                Bạn xác nhận phiên bản v{order.orderVersion} với giá{" "}
                {formatVND(order.negotiatedPrice)}. Sau khi xác nhận, đơn chuyển cho
                người bán.
              </p>
              <div className="mt-3">
                <Button onClick={() => setModal("confirm")}>Xác nhận đơn hàng</Button>
              </div>
            </div>
          )}

          {/* Người bán xác nhận / từ chối */}
          {canSellerRespond && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                Người bán xác nhận đơn hàng
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Người mua {order.buyerName} đã xác nhận v{order.orderVersion}. Chỉ xác
                nhận khi bạn đồng ý bán với giá {formatVND(order.negotiatedPrice)}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setSellerAction("confirm");
                    setError("");
                    setModal("seller");
                  }}
                >
                  Xác nhận đơn
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setSellerAction("reject");
                    setSellerReason(SELLER_REJECT_REASONS[0]);
                    setError("");
                    setModal("seller");
                  }}
                >
                  Từ chối đơn
                </Button>
              </div>
            </div>
          )}

          {/* Người mua chọn / thực hiện thanh toán */}
          {canChoosePayment && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <DataBadge />
                <span className="text-xs font-medium text-ink-600">
                  Thanh toán mô phỏng — chưa tích hợp cổng thanh toán thật
                </span>
              </div>
              <div className="mt-3">
                <label className="label" htmlFor="pay-method">
                  Hình thức thanh toán
                </label>
                <select
                  id="pay-method"
                  className="input max-w-xs"
                  value={order.paymentMethod || "QR"}
                  onChange={(e) => {
                    const res = setOrderPaymentMethod(order.id, e.target.value);
                    if (!res.ok) showToast(res.reason, "error");
                  }}
                >
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {canInitiatePayment && (
                <div className="mt-3">
                  <Button
                    onClick={() =>
                      run(initiateQrPayment(order.id), "Đã khởi tạo thanh toán (mô phỏng).")
                    }
                  >
                    Khởi tạo thanh toán QR
                  </Button>
                </div>
              )}
              {canConfirmPayment && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-600">
                    Cổng thanh toán mô phỏng trả kết quả:
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        simulatePaymentResult(order.id, true),
                        "Cổng thanh toán (mô phỏng) báo thành công."
                      )
                    }
                  >
                    Thành công
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        simulatePaymentResult(order.id, false),
                        "Cổng thanh toán (mô phỏng) báo thất bại."
                      )
                    }
                  >
                    Thất bại
                  </Button>
                </div>
              )}
              {order.paymentMethod === "COD" && !isPaymentSettled(order) && (
                <p className="mt-3 text-xs text-ink-500">
                  Đơn COD sẽ thu tiền khi giao hàng. Trạng thái hiện tại:{" "}
                  <strong>{PAYMENT_STATUS_LABEL?.[order.paymentStatus] || order.paymentStatus}</strong>.
                  Việc chọn COD KHÔNG đồng nghĩa đã thu tiền/đã đối soát. Người bán có
                  thể chuẩn bị và gửi hàng ngay.
                </p>
              )}
              {order.paymentMethod === "QR" && (
                <p className="mt-3 text-xs text-ink-500">
                  Trạng thái thanh toán trước:{" "}
                  <strong>{order.paymentStatus === "PENDING_PAYMENT" ? "Chờ thanh toán" : order.paymentStatus}</strong>.
                  Toàn bộ là mô phỏng — không phải giao dịch thanh toán thật.
                </p>
              )}
            </div>
          )}

          {/* Người bán: chuẩn bị hàng & tạo vận đơn */}
          {isSeller && (canPrepare || canCreateShipment) && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Chuẩn bị & gửi hàng</div>
              <p className="mt-1 text-xs text-amber-700">
                Đơn vị vận chuyển: {CARRIER_NAME}. Toàn bộ hành trình bên dưới là dữ
                liệu mô phỏng.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canPrepare && (
                  <Button
                    onClick={() => run(prepareOrder(order.id), "Đã đánh dấu chuẩn bị hàng.")}
                  >
                    Đã chuẩn bị hàng
                  </Button>
                )}
                {canCreateShipment && (
                  <Button variant="success" onClick={() => setModal("ship")}>
                    Tạo vận đơn &amp; gửi hàng
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Đẩy trạng thái vận chuyển (người bán / quản lý / người mua từ chối) */}
          {(shippingActive ||
            canFail ||
            canRefuseDelivery ||
            canRetry ||
            canReturnToSeller ||
            canMarkReturned ||
            canReportIncident) && (
            <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <DataBadge />
                <span className="text-xs font-medium text-ink-600">
                  Kích hoạt bước vận chuyển kế tiếp (mô phỏng)
                </span>
              </div>
              {order.deliveryAttempts > 0 && (
                <p className="mt-2 text-xs text-ink-600">
                  {isBuyerRefusal(order) ? (
                    <>
                      Người mua đã <strong>từ chối nhận hàng</strong> — cần chuyển hoàn về
                      người bán hoặc xử lý theo luồng báo vấn đề.
                    </>
                  ) : (
                    <>
                      Số lần giao không thành công: <strong>{order.deliveryAttempts}</strong>/
                      {MAX_DELIVERY_ATTEMPTS}.{" "}
                      {mustReturnToSeller(order)
                        ? "Đã dùng hết 1 lần giao lại — phải chuyển hoàn về người bán."
                        : "Được giao lại đúng một lần."}
                    </>
                  )}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {shippingActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(advanceShipping(order.id), "Đã cập nhật vận chuyển.")}
                  >
                    Chuyển bước vận chuyển kế tiếp
                  </Button>
                )}
                {canFail && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFailKind("UNREACHABLE");
                      setFailNote("");
                      setError("");
                      setModal("fail");
                    }}
                  >
                    Ghi nhận giao không thành công
                  </Button>
                )}
                {canRefuseDelivery && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRefuseNote("");
                      setError("");
                      setModal("refuse");
                    }}
                  >
                    Từ chối nhận hàng
                  </Button>
                )}
                {canReportIncident && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIncidentNote(INCIDENT_OPTIONS[0]);
                      setError("");
                      setModal("incident");
                    }}
                  >
                    Báo sự cố vận chuyển
                  </Button>
                )}
                {canRetry && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(retryDelivery(order.id), "Đã chuyển sang giao lại (lần duy nhất).")}
                  >
                    Giao lại (1 lần)
                  </Button>
                )}
                {canReturnToSeller && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(startReturnToSeller(order.id), "Đã chuyển hoàn hàng về người bán (mô phỏng).")
                    }
                  >
                    Chuyển hoàn về người bán
                  </Button>
                )}
                {canMarkReturned && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(markReturnedToSeller(order.id), "Đã ghi nhận nhận lại hàng hoàn (mô phỏng).")
                    }
                  >
                    Đã nhận lại hàng hoàn
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Không có nút "Đã nhận hàng": hoàn tất tính tự động theo mốc 3 ngày */}
          {isBuyer && order.shippingStatus === "DELIVERED" && !completion.complete && (
            <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-ink-800">
                Không cần bấm “đã nhận hàng”
              </div>
              <p className="mt-1 text-xs text-ink-600">
                Thời hạn {RETURN_WINDOW_DAYS} ngày kiểm tra được tính từ lúc hệ thống ghi nhận
                bằng chứng giao hàng thành công (mô phỏng) và đã thông báo cho bạn — không phụ
                thuộc thao tác bấm nút. Đơn tự đủ điều kiện hoàn tất sau khi hết hạn và không còn
                hồ sơ/trở ngại.
              </p>
            </div>
          )}

          {/* Thu tiền / đối soát COD (mô phỏng) */}
          {canReconcileCod && (
            <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-ink-900">
                Bước thu tiền COD (mô phỏng)
              </div>
              <p className="mt-1 text-xs text-ink-600">
                Trạng thái hiện tại:{" "}
                <strong>{PAYMENT_STATUS_LABEL?.[order.paymentStatus] || order.paymentStatus}</strong>.
                Mỗi lần bấm tiến đúng một bước: Chờ thu tiền → Đã thu tiền → Chờ đối soát
                → Đã đối soát. KHÔNG có cổng thu hộ/đối soát thật.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(advanceCodPayment(order.id), "Đã cập nhật một bước thu tiền COD (mô phỏng).")
                  }
                >
                  {order.paymentStatus === PAYMENT_STATUS.PENDING_COD_COLLECTION
                    ? "Ghi nhận đã thu tiền COD"
                    : order.paymentStatus === PAYMENT_STATUS.COD_COLLECTED
                    ? "Chuyển sang chờ đối soát"
                    : "Xác nhận đã đối soát COD"}
                </Button>
              </div>
            </div>
          )}

          {/* Người mua mở hồ sơ trả hàng/hoàn tiền/khiếu nại */}
          {canCreateSupport && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCaseType(CASE_TYPE.RETURN);
                  setSupportType(CASE_REASON_OPTIONS[0]);
                  setSupportDesc("");
                  setError("");
                  setModal("support");
                }}
              >
                Yêu cầu trả hàng/hoàn tiền
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCaseType(CASE_TYPE.DISPUTE);
                  setSupportType("Lý do khác");
                  setSupportDesc("");
                  setError("");
                  setModal("support");
                }}
              >
                Yêu cầu hỗ trợ/khiếu nại
              </Button>
            </div>
          )}
          {canReportNotReceived && (
            <div className="mt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCaseType(CASE_TYPE.NOT_RECEIVED);
                  setSupportType("Chưa nhận được hàng");
                  setSupportDesc("");
                  setError("");
                  setModal("support");
                }}
              >
                Báo chưa nhận được hàng
              </Button>
            </div>
          )}

          {/* Hủy đơn */}
          {canCancel && (
            <div className="mt-4">
              <Button
                variant="danger"
                onClick={() => {
                  setCancelReason(CANCEL_REASONS[0]);
                  setCancelNote("");
                  setError("");
                  setModal("cancel");
                }}
              >
                Hủy đơn
              </Button>
              {cancelCheck.requiresReason && (
                <p className="mt-2 text-xs text-ink-500">
                  {cancelCheck.requiresConfirm
                    ? "Đơn đã được người bán xác nhận nhưng CHƯA bàn giao cho đơn vị vận chuyển: cần xác nhận lại và ghi rõ lý do. Hệ thống lưu người hủy, thời gian và lý do."
                    : "Hệ thống lưu người hủy, thời gian và lý do."}
                </p>
              )}
            </div>
          )}
          {showAltFlow && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                Không thể hủy trực tiếp
              </div>
              <p className="mt-1 text-xs text-amber-700">{cancelCheck.reason}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {cancelCheck.code === "HANDED_OVER" && (
                  <a href="#shipping" className="font-medium text-brand-600 hover:text-brand-700">
                    Theo dõi quá trình giao hàng ↓
                  </a>
                )}
                {cancelCheck.code === "HANDED_OVER" && isBuyer && canReportNotReceived && (
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:text-brand-700"
                    onClick={() => {
                      setCaseType(CASE_TYPE.NOT_RECEIVED);
                      setSupportType("Chưa nhận được hàng");
                      setSupportDesc("");
                      setError("");
                      setModal("support");
                    }}
                  >
                    Báo chưa nhận được hàng
                  </button>
                )}
                {cancelCheck.code === "PAID" && isBuyer && canCreateSupport && (
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:text-brand-700"
                    onClick={() => {
                      setCaseType(CASE_TYPE.RETURN);
                      setSupportType(CASE_REASON_OPTIONS[0]);
                      setSupportDesc("");
                      setError("");
                      setModal("support");
                    }}
                  >
                    Yêu cầu trả hàng/hoàn tiền
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Hoàn tiền cấp đơn khi hàng hoàn về người bán (mô phỏng) */}
          {canConfirmOrderRefund && (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-ink-900">
                Hoàn tiền do hàng hoàn về người bán (mô phỏng)
              </div>
              <p className="mt-1 text-xs text-ink-600">
                Hàng đã về người bán và đơn đã thu tiền trước. Khoản hoàn đang ở trạng thái
                xử lý — chỉ ghi nhận kết quả khi có xác nhận (mô phỏng). Không tự động
                chuyển tiền thật.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(
                      confirmOrderRefundDone(order.id),
                      "Đã ghi nhận kết quả hoàn tiền (mô phỏng)."
                    )
                  }
                >
                  Xác nhận hoàn tiền xong (kết quả mô phỏng)
                </Button>
              </div>
            </div>
          )}

          {/* Công cụ kiểm thử: chỉ hiển thị cho Quản lý (không thuộc luồng người dùng) */}
          {isManager && canExpireSupport && (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <DataBadge />
                <span className="text-xs font-medium text-ink-600">
                  Thực tế phải do backend/scheduler chạy — nút này chỉ mô phỏng
                </span>
              </div>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(
                      simulateSupportExpiry(order.id),
                      "Đã mô phỏng: hết 3 ngày hậu giao hàng, đơn chuyển hoàn tất."
                    )
                  }
                >
                  Mô phỏng hoàn tất sau {RETURN_WINDOW_DAYS} ngày
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Vận chuyển (mô phỏng) */}
        {(order.trackingCode || order.shippingStatus !== "NOT_SHIPPED") && (
          <div id="shipping" className="card mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Vận chuyển (mô phỏng)
              </h2>
              <div className="flex items-center gap-2">
                <ShippingStatusBadge status={order.shippingStatus} />
                <DataBadge />
              </div>
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <InfoRow label="Đơn vị vận chuyển">{order.carrier || CARRIER_NAME}</InfoRow>
              <InfoRow label="Mã vận đơn">
                <span className="font-mono">{order.trackingCode || "—"}</span>
              </InfoRow>
              <InfoRow label="Hình thức bàn giao">
                {HANDOVER_METHODS[order.handoverMethod] || "—"}
              </InfoRow>
              <InfoRow label="Đã bàn giao cho ĐVVC">
                {hasCarrierHandover(order) ? "Đã ghi nhận" : "Chưa"}
              </InfoRow>
              <InfoRow label="Dự kiến giao">{formatDate(order.etaDelivery)}</InfoRow>
              <InfoRow label="Giao thành công lúc">{formatDate(order.deliveredAt)}</InfoRow>
              <InfoRow label="Người mua đã nhận">{order.receivedAt ? "Có" : "Chưa"}</InfoRow>
              <InfoRow label="Bằng chứng giao hàng (mô phỏng)">
                {clock.hasProof ? `Có · nguồn ${clock.source}` : "Chưa"}
              </InfoRow>
              <InfoRow label="Đã thông báo người mua">
                {clock.notifiedAt ? formatDate(clock.notifiedAt) : "—"}
              </InfoRow>
              <InfoRow label={`Hết hạn ${RETURN_WINDOW_DAYS} ngày trả hàng`}>
                {clock.deadlineAt ? formatDate(clock.deadlineAt) : "—"}
              </InfoRow>
              {order.deliveryAttempts > 0 && (
                <InfoRow label="Số lần giao không thành công">
                  {order.deliveryAttempts}/{MAX_DELIVERY_ATTEMPTS}
                </InfoRow>
              )}
              {order.lastDeliveryFailureKind && (
                <InfoRow label="Lý do gần nhất">
                  {DELIVERY_FAILURE_KINDS[order.lastDeliveryFailureKind] ||
                    order.lastDeliveryFailureKind}
                </InfoRow>
              )}
              {order.shippingIncident?.note && (
                <InfoRow label="Sự cố vận chuyển">
                  {order.shippingIncident.note}
                </InfoRow>
              )}
            </dl>

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Hành trình
              </div>
              {journey.length === 0 ? (
                <p className="mt-2 text-sm text-ink-500">Chưa có sự kiện vận chuyển.</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {journey.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          e.status === "FAILED" || e.status === "INCIDENT"
                            ? "bg-red-500"
                            : e.status === "DELIVERED"
                              ? "bg-emerald-500"
                              : e.status === "RETURNING" || e.status === "RETURNED"
                                ? "bg-purple-500"
                                : "bg-brand-500"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-900">
                          {SHIPPING_STATUS_LABEL[e.status] || e.status}
                        </div>
                        <div className="text-xs text-ink-500">
                          {e.time} · {e.location}
                        </div>
                        {e.description && (
                          <div className="mt-0.5 text-xs text-ink-500">{e.description}</div>
                        )}
                        {e.failureKind && (
                          <div className="mt-0.5 text-xs text-ink-600">
                            Loại: {DELIVERY_FAILURE_KINDS[e.failureKind] || e.failureKind}
                          </div>
                        )}
                        {e.failureReason && (
                          <div className="mt-0.5 text-xs text-red-600">
                            Lý do: {e.failureReason}
                          </div>
                        )}
                        {e.note && (
                          <div className="mt-0.5 text-xs text-ink-500">{e.note}</div>
                        )}
                        <div className="mt-0.5 text-[11px] text-ink-400">
                          Nguồn: hệ thống mô phỏng
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        {/* Chi trả người bán (mô phỏng) */}
        {(isSeller || isManager || isBuyer) && (
          <div className="card mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Chi trả cho người bán
              </h2>
              <div className="flex items-center gap-2">
                <StatusBadge tone="gray">Mô phỏng</StatusBadge>
                <PayoutStatusBadge status={payout.status} />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Điều kiện chi trả: đơn hoàn tất + hết {RETURN_WINDOW_DAYS} ngày hậu giao hàng +
              không có khiếu nại mở + không có khoản hoàn tiền chưa xử lý + thanh toán/thu
              hộ đã được xác minh (COD phải thu tiền VÀ đối soát). Đây KHÔNG phải giao
              dịch chuyển tiền thật.
            </p>
            <div className="mt-3 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <InfoRow label="Số tiền ghi nhận">
                {formatVND(payout.amount ?? order.negotiatedPrice)}
              </InfoRow>
              <InfoRow label="Người mua đã trả">
                {isPaymentSettled(order) ? "Đã xác minh" : "Chưa xác minh"}
              </InfoRow>
              {order.payout?.at && (
                <InfoRow label="Ghi nhận lúc">{formatDate(order.payout.at)}</InfoRow>
              )}
            </div>
            {payout.status !== PAYOUT_STATUS.ELIGIBLE &&
              payout.status !== PAYOUT_STATUS.PAID_SIMULATED &&
              payout.reasons.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-xs text-ink-600">
                  {payout.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            {canRecordPayout && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(
                      recordSellerPayout(order.id),
                      "Đã ghi nhận chi trả cho người bán (mô phỏng — không phải chuyển tiền thật)."
                    )
                  }
                >
                  Ghi nhận chi trả (mô phỏng)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Điều kiện đưa vào dữ liệu giá tham khảo */}
        <div className="card mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Điều kiện ghi nhận vào dải giá tham khảo
            </h2>
            <DataBadge />
          </div>
          <ul className="mt-3 space-y-1.5">
            <Condition
              ok={
                order.confirmations.some((c) => c.role === "buyer") &&
                order.confirmations.some((c) => c.role === "seller")
              }
            >
              Hai bên đã xác nhận cùng một phiên bản đơn hàng
            </Condition>
            <Condition ok={clock.hasProof}>
              Giao hàng thành công + có bằng chứng xác minh (mô phỏng)
            </Condition>
            <Condition ok={!!order.receivedAt || !!order.supportExpired || completion.reasons.every((x) => !x.includes(String(RETURN_WINDOW_DAYS)))}>
              Người mua xác nhận nhận hàng hoặc đã hết {RETURN_WINDOW_DAYS} ngày hậu giao hàng
            </Condition>
            <Condition ok={isPaymentSettled(order)}>
              Đã xác minh thanh toán / đã thu &amp; đối soát COD
            </Condition>
            <Condition
              ok={
                !["CANCELLED", "SELLER_REJECTED"].includes(order.status) &&
                !["RETURNING", "RETURNED"].includes(order.shippingStatus) &&
                !isPaymentRefunded(order) &&
                !isRefundInProgress(order)
              }
            >
              Không bị hủy / hoàn trả / hoàn tiền
            </Condition>
            <Condition ok={openRequests.length === 0}>
              Không còn khiếu nại/tranh chấp đang mở
            </Condition>
          </ul>

          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            {eligibility.eligible ? (
              <span className="text-emerald-700">
                Đơn đã đủ điều kiện sơ bộ. Giao dịch được đưa vào hàng đợi chờ quản lý
                duyệt — chỉ sau khi duyệt mới vào dải giá tham khảo.
              </span>
            ) : (
              <div>
                <div className="font-medium text-ink-700">Chưa đủ điều kiện:</div>
                <ul className="mt-1 list-disc pl-5 text-ink-600">
                  {eligibility.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {tx && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-500">Bản ghi giao dịch:</span>
              <VerificationBadge verification={tx.verification} />
              <Link
                to={`/transactions/${tx.id}`}
                className="text-brand-600 hover:text-brand-700"
              >
                Xem chi tiết →
              </Link>
            </div>
          )}
        </div>

        {/* Hồ sơ trả hàng / hoàn tiền / khiếu nại */}
        {(order.supportRequests || []).length > 0 && (
          <div className="card mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Hồ sơ trả hàng / hoàn tiền / khiếu nại
              </h2>
              <DataBadge />
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Người mua, người bán và quản lý cùng xem một hồ sơ. Mỗi đơn chỉ có một hồ sơ hoạt động.
            </p>
            <div className="mt-3 space-y-4">
              {order.supportRequests.map((r) => {
                const overdue = isSellerResponseOverdue(r, new Date());
                return (
                  <div key={r.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-ink-900">{r.reason || r.type}</div>
                      <div className="flex items-center gap-2">
                        {overdue && <StatusBadge tone="red">Người bán quá hạn 48h</StatusBadge>}
                        <SupportStatusBadge status={r.status} />
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      {r.id} · {r.createdBy} · {formatDate(r.createdAt)}
                      {r.detailId ? ` · Mã chi tiết: ${r.detailId}` : ""}
                    </div>
                    <p className="mt-2 text-sm text-ink-700">{r.description}</p>
                    {r.reflectionNote && (
                      <p className="mt-1 text-sm text-ink-600">
                        <span className="font-semibold">Ghi chú phản ánh: </span>
                        {r.reflectionNote}
                      </p>
                    )}
                    {r.evidence && r.evidence.length > 0 && (
                      <p className="mt-1 text-xs text-ink-500">
                        Bằng chứng (mô tả): {r.evidence.join("; ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-ink-500">
                      Hạn người bán phản hồi: {formatDate(r.sellerResponseDueAt)} ({SELLER_RESPONSE_HOURS} giờ)
                      {r.sellerRespondedAt ? " · đã phản hồi" : ""}
                    </p>

                    <div className="mt-3 space-y-2">
                      {r.messages.map((m, i) => (
                        <div key={i} className="rounded-lg bg-gray-50 p-2 text-sm">
                          <span className="font-medium">
                            {m.from === "buyer"
                              ? "Người mua"
                              : m.from === "seller"
                              ? "Người bán"
                              : "Quản lý"}
                            :
                          </span>{" "}
                          {m.text}
                          <span className="ml-1 text-xs text-ink-400">({m.time})</span>
                        </div>
                      ))}
                    </div>

                    {r.resolution && (
                      <p className="mt-2 text-xs text-ink-600">
                        Kết quả: {r.resolution} — {r.resolvedBy} ({formatDate(r.resolvedAt)})
                        {r.costResponsibility
                          ? ` · Chi phí trả hàng: ${COST_LABEL[r.costResponsibility] || r.costResponsibility}`
                          : ""}
                      </p>
                    )}

                    <div className="mt-3">
                      <Link to={`/orders/${order.id}/cases/${r.id}`}>
                        <Button size="sm" variant="outline">
                          Xem hồ sơ / xử lý đầy đủ
                        </Button>
                      </Link>
                    </div>

                    {/* Hành động trên yêu cầu */}
                    {isReturnOpen(r) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(isSeller || isManager) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReqId(r.id);
                              setRespondMsg("");
                              setRespondEscalate(false);
                              setError("");
                              setModal("respond");
                            }}
                          >
                            Phản hồi
                          </Button>
                        )}
                        {isManager && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setReqId(r.id);
                              setResolveDecision("ACCEPT_RETURN");
                              setResolveReason("");
                              setResolveCost("");
                              setError("");
                              setModal("resolve");
                            }}
                          >
                            Quản lý xử lý
                          </Button>
                        )}
                        {overdue && (isBuyer || isManager) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              run(
                                escalateOverdueSupport(order.id, r.id),
                                "Đã ghi nhận quá hạn và chuyển quản lý xử lý."
                              )
                            }
                          >
                            Chuyển quản lý (quá hạn)
                          </Button>
                        )}
                      </div>
                    )}

                    {(r.status === "ACCEPTED_RETURN" || r.status === "RETURNING") &&
                      (isSeller || isManager) && (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              run(confirmReturnReceived(order.id, r.id), "Đã xác nhận nhận lại hàng.")
                            }
                          >
                            Đã nhận lại hàng hoàn
                          </Button>
                        </div>
                      )}

                    {r.status === "RETURNED" && isManager && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            run(
                              startRefund(order.id, r.id),
                              "Đã khởi tạo hoàn tiền (đang xử lý, mô phỏng)."
                            )
                          }
                        >
                          Khởi tạo hoàn tiền (mô phỏng)
                        </Button>
                      </div>
                    )}

                    {r.status === "REFUND_PROCESSING" && isManager && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={() =>
                            run(
                              confirmRefundDone(order.id, r.id),
                              "Đã ghi nhận kết quả hoàn tiền (mô phỏng)."
                            )
                          }
                        >
                          Xác nhận hoàn tiền xong (kết quả mô phỏng)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lịch sử nghiệp vụ */}
        <div className="card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Lịch sử nghiệp vụ
          </h2>
          <ol className="mt-3 space-y-3">
            {timeline.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900">{h.action}</div>
                  <div className="text-xs text-ink-500">
                    {h.actor} · {h.time}
                    {(h.from || h.to) && (
                      <>
                        {" · "}
                        {h.from ? `${labelOf(h.from)} → ` : ""}
                        {labelOf(h.to)}
                      </>
                    )}
                  </div>
                  {h.note && <div className="mt-0.5 text-xs text-ink-500">{h.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Giao dịch đã hoàn tất: đánh giá */}
        {order.status === "COMPLETED" && isBuyer && (
          <div className="card mt-6 p-5">
            <p className="text-sm text-ink-700">
              Giao dịch đã hoàn tất. Bản ghi giao dịch chỉ được đưa vào dải giá tham
              khảo sau khi quản lý kiểm tra và duyệt.
            </p>
            {!reviewed && (
              <Link to={`/orders/${order.id}/review`} className="mt-3 inline-block">
                <Button variant="success">Đánh giá người bán</Button>
              </Link>
            )}
            {reviewed && myReview && (
              <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-ink-700">
                <div className="font-semibold text-ink-900">
                  Bạn đã đánh giá người bán này ({myReview.rating}/5)
                </div>
                <p className="mt-1 text-ink-700">{myReview.comment}</p>
              </div>
            )}
          </div>
        )}

        {order.status === "SELLER_REJECTED" && (
          <div className="card mt-6 border-red-200 bg-red-50 p-5">
            <div className="text-sm font-semibold text-red-900">
              Người bán đã từ chối đơn hàng
            </div>
            {order.rejectReason && (
              <p className="mt-1 text-sm text-red-700">Lý do: {order.rejectReason}</p>
            )}
            <p className="mt-2 text-xs text-red-600">
              Đơn bị từ chối giữ trong lịch sử và không được đưa vào dữ liệu tham khảo giá.
            </p>
          </div>
        )}

        <div className="mt-6">
          <Link
            to={user?.role === "seller" ? "/seller/listings" : user?.role === "manager" ? "/manager/orders" : "/phones"}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← Quay lại
          </Link>
        </div>
      </div>

      {/* Modal: người mua xác nhận */}
      {modal === "confirm" && (
        <Modal title="Xác nhận đơn hàng" onClose={() => setModal(null)}>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-ink-700">
            Đơn <strong>{order.id}</strong> — {phone ? phoneName(phone) : order.phoneId}
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Giá rao bán</dt>
              <dd className="font-medium">{formatVND(order.listingPrice ?? phone?.price ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Giá hai bên thống nhất</dt>
              <dd className="font-semibold text-brand-600">
                {formatVND(order.negotiatedPrice)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Phiên bản</dt>
              <dd className="font-medium">v{order.orderVersion}</dd>
            </div>
          </dl>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              onClick={() =>
                run(confirmOrderByBuyer(order.id), "Bạn đã xác nhận đơn hàng.")
              }
            >
              Xác nhận đơn hàng
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: người bán xác nhận / từ chối */}
      {modal === "seller" && (
        <Modal
          title={sellerAction === "confirm" ? "Xác nhận đơn hàng" : "Từ chối đơn hàng"}
          onClose={() => setModal(null)}
        >
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-ink-700">
            Đơn <strong>{order.id}</strong> — {phone ? phoneName(phone) : order.phoneId}{" "}
            <span className="text-ink-500">({formatVND(order.negotiatedPrice)})</span>
          </div>
          {sellerAction === "reject" && (
            <div className="mt-4">
              <label className="label" htmlFor="seller-reject-reason">
                Lý do từ chối
              </label>
              <select
                id="seller-reject-reason"
                className="input"
                value={sellerReason}
                onChange={(e) => setSellerReason(e.target.value)}
              >
                {SELLER_REJECT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              variant={sellerAction === "confirm" ? "primary" : "danger"}
              onClick={() =>
                run(
                  respondOrderBySeller(order.id, sellerAction, sellerReason),
                  sellerAction === "confirm"
                    ? "Bạn đã xác nhận đơn hàng."
                    : "Đơn hàng đã bị từ chối."
                )
              }
            >
              {sellerAction === "confirm" ? "Xác nhận đơn" : "Xác nhận từ chối"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: hủy đơn */}
      {modal === "cancel" && (
        <Modal title="Xác nhận hủy đơn" onClose={() => setModal(null)}>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-ink-700">
            Đơn <strong>{order.id}</strong> — {phone ? phoneName(phone) : order.phoneId}
          </div>
          <div
            className={`mt-3 rounded-lg border p-3 text-xs ${
              cancelCheck.requiresConfirm
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-gray-50 text-ink-600"
            }`}
          >
            {cancelCheck.requiresConfirm ? (
              <>
                <strong>Đơn đã được người bán xác nhận</strong> nhưng chưa bàn giao cho đơn
                vị vận chuyển. Bạn cần xác nhận lại lần nữa trước khi hủy để tránh bấm nhầm.
                {order.trackingCode && (
                  <>
                    {" "}
                    Vận đơn <span className="font-mono">{order.trackingCode}</span> sẽ bị hủy
                    (chưa bàn giao).
                  </>
                )}
              </>
            ) : (
              <>Đơn chưa được người bán xác nhận — bạn có thể hủy trực tiếp.</>
            )}
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="cancel-reason">
              Lý do hủy
            </label>
            <select
              id="cancel-reason"
              className="input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="cancel-note">
              Ghi chú bổ sung (tuỳ chọn)
            </label>
            <textarea
              id="cancel-note"
              className="input min-h-20 resize-y"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
            />
          </div>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-ink-500">
            Đơn bị hủy giữ trong lịch sử và KHÔNG được đưa vào dữ liệu giá tham khảo. Trạng
            thái thanh toán giữ theo tình hình thực tế — hệ thống không tự đánh dấu hoàn tiền.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                run(cancelOrder(order.id, [cancelReason, cancelNote].filter(Boolean).join(" — ")), "Đơn hàng đã bị hủy.")
              }
            >
              {cancelCheck.requiresConfirm ? "Xác nhận lại & hủy đơn" : "Xác nhận hủy"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: tạo vận đơn */}
      {modal === "ship" && (
        <Modal title="Tạo vận đơn & gửi hàng" onClose={() => setModal(null)}>
          <div className="mt-3 flex items-center gap-2">
            <DataBadge />
            <span className="text-xs text-ink-600">Đơn vị vận chuyển mô phỏng</span>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Hệ thống sẽ cấp MỘT mã vận đơn duy nhất cho đơn này khi bạn xác nhận.
          </p>
          <div className="mt-4">
            <label className="label" htmlFor="handover-method">
              Hình thức bàn giao
            </label>
            <select
              id="handover-method"
              className="input"
              value={handover}
              onChange={(e) => setHandover(e.target.value)}
            >
              {Object.entries(HANDOVER_METHODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              variant="success"
              onClick={() =>
                run(createShipment(order.id, handover), "Đã tạo vận đơn (mô phỏng) và gửi hàng.")
              }
            >
              Tạo vận đơn
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: ghi nhận giao không thành công */}
      {modal === "fail" && (
        <Modal title="Ghi nhận giao không thành công" onClose={() => setModal(null)}>
          <div className="mt-4">
            <label className="label" htmlFor="fail-kind">
              Loại lý do
            </label>
            <select
              id="fail-kind"
              className="input"
              value={failKind}
              onChange={(e) => setFailKind(e.target.value)}
            >
              {FAIL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="fail-note">
              Ghi chú (tuỳ chọn)
            </label>
            <textarea
              id="fail-note"
              className="input min-h-16 resize-y"
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
            />
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Giao không thành công KHÔNG đồng nghĩa đã hoàn tiền và KHÔNG kết luận bên nào có
            lỗi. Nếu người mua từ chối nhận, hàng sẽ chuyển hoàn về người bán.
          </p>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                run(
                  markDeliveryFailed(
                    order.id,
                    failNote || DELIVERY_FAILURE_KINDS[failKind],
                    failKind
                  ),
                  "Đã ghi nhận giao không thành công."
                )
              }
            >
              Xác nhận
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: người mua từ chối nhận hàng */}
      {modal === "refuse" && (
        <Modal title="Từ chối nhận hàng" onClose={() => setModal(null)}>
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-ink-600">
            Bạn xác nhận TỪ CHỐI nhận kiện hàng đang giao. Hệ thống ghi nhận sự kiện giao
            không thành công; hàng sẽ chuyển hoàn về người bán. Việc từ chối không đồng nghĩa
            hệ thống tự hoàn tiền — khoản tiền xử lý theo tình hình thực tế.
          </p>
          <div className="mt-3">
            <label className="label" htmlFor="refuse-note">
              Lý do từ chối (tuỳ chọn)
            </label>
            <textarea
              id="refuse-note"
              className="input min-h-16 resize-y"
              value={refuseNote}
              onChange={(e) => setRefuseNote(e.target.value)}
            />
          </div>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                run(
                  markDeliveryFailed(
                    order.id,
                    refuseNote || DELIVERY_FAILURE_KINDS.REFUSED,
                    "REFUSED"
                  ),
                  "Đã ghi nhận bạn từ chối nhận hàng."
                )
              }
            >
              Xác nhận từ chối nhận
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: báo sự cố vận chuyển */}
      {modal === "incident" && (
        <Modal title="Báo sự cố vận chuyển" onClose={() => setModal(null)}>
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-ink-600">
            Ghi nhận sự cố vận chuyển (mô phỏng). Hệ thống giữ nguyên lịch sử sự kiện và
            chuyển sang luồng báo vấn đề/xác minh hiện có — KHÔNG kết luận bên nào có lỗi và
            KHÔNG tự hoàn tiền.
          </p>
          <div className="mt-4">
            <label className="label" htmlFor="incident-note">
              Nội dung sự cố
            </label>
            <textarea
              id="incident-note"
              className="input min-h-16 resize-y"
              value={incidentNote}
              onChange={(e) => setIncidentNote(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink-400">
              Gợi ý: {INCIDENT_OPTIONS.join(" · ")}
            </p>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              onClick={() =>
                run(
                  reportShippingIncident(order.id, incidentNote),
                  "Đã ghi nhận sự cố vận chuyển — chuyển luồng báo vấn đề."
                )
              }
            >
              Ghi nhận sự cố
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: tạo yêu cầu trả hàng/khiếu nại */}
      {modal === "support" && (
        <Modal title="Mở hồ sơ (mô phỏng)" onClose={() => setModal(null)}>
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-ink-600">
            Hồ sơ trả hàng/hoàn tiền chỉ gửi được trong {RETURN_WINDOW_DAYS} ngày kể từ khi hệ
            thống ghi nhận giao hàng thành công và đã thông báo. Sau thời hạn vẫn có kênh
            “Yêu cầu hỗ trợ/khiếu nại”. Cần nêu lý do cụ thể và mô tả vấn đề; bằng chứng là tuỳ
            chọn. Toàn bộ là dữ liệu mô phỏng.
          </p>
          <div className="mt-4">
            <label className="label" htmlFor="case-type">
              Loại yêu cầu
            </label>
            <select
              id="case-type"
              className="input"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
            >
              {[CASE_TYPE.RETURN, CASE_TYPE.NOT_RECEIVED, CASE_TYPE.DISPUTE].map((t) => (
                <option key={t} value={t}>
                  {CASE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="support-type">
              Lý do cụ thể
            </label>
            <select
              id="support-type"
              className="input"
              value={supportType}
              onChange={(e) => setSupportType(e.target.value)}
            >
              {CASE_REASON_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="support-desc">
              {caseType === CASE_TYPE.RETURN ? "Mô tả vấn đề" : "Đánh giá/nhận xét"}
            </label>
            <textarea
              id="support-desc"
              className="input min-h-24 resize-y"
              placeholder={
                caseType === CASE_TYPE.RETURN
                  ? "Mô tả tình trạng máy khi nhận..."
                  : "Nêu đánh giá/nhận xét của bạn về đơn hàng, người bán hoặc vấn đề gặp phải..."
              }
              value={supportDesc}
              onChange={(e) => setSupportDesc(e.target.value)}
            />
          </div>
          {caseType === CASE_TYPE.RETURN && (
            <div className="mt-3">
              <label className="label" htmlFor="support-reflection">
                Ghi chú phản ánh
              </label>
              <textarea
                id="support-reflection"
                className="input min-h-16 resize-y"
                placeholder="Phản ánh thêm của bạn (mong muốn xử lý, mức độ ảnh hưởng…)"
                value={supportReflection}
                onChange={(e) => setSupportReflection(e.target.value)}
              />
            </div>
          )}
          <div className="mt-3">
            <div className="label">Ảnh/video bằng chứng (tuỳ chọn)</div>
            <EvidenceUploader files={supportFiles} onChange={setSupportFiles} />
          </div>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              onClick={() =>
                run(
                  openCase(order.id, {
                    type: caseType,
                    reason: supportType,
                    description: supportDesc,
                    evidenceFiles: supportFiles,
                    reflectionNote: caseType === CASE_TYPE.RETURN ? supportReflection : "",
                  }),
                  "Đã mở hồ sơ — chuyển chờ người bán phản hồi."
                )
              }
            >
              Gửi yêu cầu
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: phản hồi yêu cầu */}
      {modal === "respond" && (
        <Modal title="Phản hồi yêu cầu hỗ trợ" onClose={() => setModal(null)}>
          <div className="mt-4">
            <label className="label" htmlFor="respond-msg">
              Nội dung phản hồi
            </label>
            <textarea
              id="respond-msg"
              className="input min-h-24 resize-y"
              value={respondMsg}
              onChange={(e) => setRespondMsg(e.target.value)}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={respondEscalate}
              onChange={(e) => setRespondEscalate(e.target.checked)}
            />
            Chuyển cho quản lý xử lý
          </label>
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              onClick={() =>
                run(
                  respondSupportRequest(order.id, reqId, {
                    message: respondMsg,
                    escalate: respondEscalate,
                  }),
                  "Đã gửi phản hồi."
                )
              }
            >
              Gửi phản hồi
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: quản lý xử lý yêu cầu */}
      {modal === "resolve" && (
        <Modal title="Quản lý xử lý yêu cầu" onClose={() => setModal(null)}>
          <div className="mt-4">
            <label className="label" htmlFor="resolve-decision">
              Quyết định
            </label>
            <select
              id="resolve-decision"
              className="input"
              value={resolveDecision}
              onChange={(e) => setResolveDecision(e.target.value)}
            >
              {RESOLVE_DECISIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="resolve-reason">
              Lý do / ghi chú
            </label>
            <textarea
              id="resolve-reason"
              className="input min-h-20 resize-y"
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
            />
          </div>
          {(resolveDecision === "ACCEPT_RETURN" || resolveDecision === "REJECT") && (
            <div className="mt-3">
              <label className="label" htmlFor="resolve-cost">
                Trách nhiệm chi phí trả hàng (sau khi đã xác minh)
              </label>
              <select
                id="resolve-cost"
                className="input"
                value={resolveCost}
                onChange={(e) => setResolveCost(e.target.value)}
              >
                {COST_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setModal(null)}>
              Quay lại
            </Button>
            <Button
              onClick={() =>
                run(
                  resolveSupportRequest(
                    order.id,
                    reqId,
                    resolveDecision,
                    resolveReason,
                    resolveCost || null
                  ),
                  "Đã xử lý yêu cầu."
                )
              }
            >
              Xác nhận xử lý
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
