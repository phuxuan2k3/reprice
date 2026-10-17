import { PAYMENT_STATUS_LABEL, PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE } from "../data/orderRules";

/** Huy hiệu trạng thái dùng chung. */
const TONES = {
  red: "bg-red-50 text-red-700 border-red-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  gray: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function StatusBadge({ tone = "gray", children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Trạng thái đơn hàng. */
export function OrderStatusBadge({ status }) {
  const map = {
    PENDING_BUYER: { tone: "amber", label: "Chờ người mua xác nhận" },
    PENDING_SELLER: { tone: "amber", label: "Chờ người bán xác nhận" },
    CONFIRMED: { tone: "blue", label: "Hai bên đã xác nhận" },
    PAYMENT_PENDING: { tone: "amber", label: "Chờ thanh toán" },
    SHIPPING: { tone: "purple", label: "Đang giao hàng" },
    DELIVERED: { tone: "blue", label: "Đã giao hàng" },
    COMPLETED: { tone: "green", label: "Hoàn tất" },
    CANCELLED: { tone: "gray", label: "Đã hủy" },
    SELLER_REJECTED: { tone: "red", label: "Người bán từ chối" },
    REFUNDED: { tone: "red", label: "Hoàn tiền" },
  };
  const item = map[status] || { tone: "gray", label: status };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Trạng thái thanh toán (tách biệt với trạng thái đơn hàng). */
export function PaymentStatusBadge({ status }) {
  const map = {
    NOT_PAID: { tone: "gray", label: "Chưa thanh toán" },
    PENDING_CONFIRMATION: { tone: "amber", label: "Chờ xác nhận thanh toán" },
    PAID: { tone: "green", label: "Đã thanh toán" },
    FAILED: { tone: "red", label: "Thanh toán thất bại" },
    REFUNDED: { tone: "purple", label: "Đã hoàn tiền" },
    NONE: { tone: "gray", label: "Chưa phát sinh thanh toán" },
    PENDING_PAYMENT: { tone: "amber", label: "Chờ thanh toán" },
    PENDING_COD_COLLECTION: { tone: "amber", label: "Chờ thu tiền COD" },
    COD_COLLECTED: { tone: "blue", label: "Đã thu tiền COD" },
    PENDING_COD_RECONCILE: { tone: "amber", label: "Chờ đối soát COD" },
    COD_RECONCILED: { tone: "green", label: "Đã đối soát COD" },
    REFUND_PROCESSING: { tone: "purple", label: "Hoàn tiền đang xử lý" },
  };
  const item = map[status] || { tone: PAYMENT_STATUS_TONE[status] || "gray", label: status || "—" };
  return <StatusBadge tone={item.tone}>{PAYMENT_STATUS_LABEL[status] || item.label}</StatusBadge>;
}

/** Trạng thái chi trả cho người bán (mô phỏng). */
export function PayoutStatusBadge({ status }) {
  const map = {
    NOT_APPLICABLE: { tone: "gray", label: "Không áp dụng" },
    PENDING_ELIGIBILITY: { tone: "amber", label: "Chờ đủ điều kiện chi trả" },
    ELIGIBLE: { tone: "green", label: "Đủ điều kiện chi trả" },
    PAID_SIMULATED: { tone: "green", label: "Đã ghi nhận chi trả (mô phỏng)" },
  };
  const item = map[status] || {
    tone: PAYOUT_STATUS_TONE[status] || "gray",
    label: status || "—",
  };
  return <StatusBadge tone={item.tone}>{PAYOUT_STATUS_LABEL[status] || item.label}</StatusBadge>;
}

/** Trạng thái vận chuyển (tách biệt với trạng thái đơn hàng). */
export function ShippingStatusBadge({ status }) {
  const map = {
    NOT_SHIPPED: { tone: "gray", label: "Chưa gửi hàng" },
    PREPARING: { tone: "amber", label: "Chờ chuẩn bị hàng" },
    AWAITING_PICKUP: { tone: "amber", label: "Chờ lấy hàng / chờ gửi tại điểm" },
    ACCEPTED: { tone: "blue", label: "Đã tiếp nhận kiện hàng" },
    SORTING: { tone: "blue", label: "Đang vận chuyển đến trung tâm phân loại" },
    IN_TRANSIT: { tone: "blue", label: "Đang trung chuyển" },
    ARRIVED_HUB: { tone: "purple", label: "Đã đến khu vực giao hàng" },
    OUT_FOR_DELIVERY: { tone: "purple", label: "Đang giao cho người mua" },
    DELIVERED: { tone: "green", label: "Giao hàng thành công" },
    FAILED: { tone: "red", label: "Giao hàng thất bại" },
    RETURNING: { tone: "purple", label: "Đang hoàn hàng về người bán" },
    RETURNED: { tone: "gray", label: "Đã hoàn hàng về người bán" },
    VOIDED: { tone: "gray", label: "Vận đơn đã hủy (chưa bàn giao)" },
    INCIDENT: { tone: "red", label: "Có sự cố vận chuyển" },
    // Tương thích dữ liệu cũ
    HANDED_OVER: { tone: "amber", label: "Đã bàn giao đơn vị vận chuyển" },
  };
  const item = map[status] || { tone: "gray", label: status || "—" };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Trạng thái yêu cầu hỗ trợ / khiếu nại / hoàn trả. */
export function SupportStatusBadge({ status }) {
  const map = {
    PENDING_SELLER: { tone: "amber", label: "Chờ người bán phản hồi" },
    SELLER_SUPPLEMENT: { tone: "amber", label: "Người bán đề nghị bổ sung" },
    IN_PROGRESS: { tone: "blue", label: "Đang trao đổi" },
    AFTER_REJECT_BUYER: { tone: "amber", label: "Người bán từ chối — chờ người mua" },
    PENDING_MANAGER: { tone: "purple", label: "Chờ quản lý xử lý" },
    NEEDS_INFO: { tone: "amber", label: "Quản lý yêu cầu bổ sung" },
    UNDER_REVIEW: { tone: "purple", label: "Quản lý đang xác minh" },
    AWAITING_PLAN: { tone: "amber", label: "Chờ hoàn thiện phương án" },
    PLAN_REVIEW: { tone: "blue", label: "Phương án chờ xem xét lại" },
    PLAN_EFFECTIVE: { tone: "green", label: "Phương án có hiệu lực" },
    RETURN_PENDING_INFO: { tone: "amber", label: "Chờ thông tin nhận trả" },
    ACCEPTED_RETURN: { tone: "blue", label: "Chấp nhận trả hàng" },
    RETURN_AWAITING_HANDOVER: { tone: "amber", label: "Chờ bàn giao hàng trả" },
    RETURNING: { tone: "purple", label: "Đang vận chuyển trả" },
    RETURNED: { tone: "purple", label: "Đã giao trả, chờ kiểm tra" },
    RETURN_OBSTACLE: { tone: "red", label: "Có trở ngại trả hàng" },
    RETURN_DISPUTE: { tone: "red", label: "Có tranh chấp hàng trả" },
    REFUND_ELIGIBLE: { tone: "green", label: "Đủ điều kiện hoàn tiền" },
    PENDING_REFUND: { tone: "amber", label: "Chờ hoàn tiền" },
    REFUND_PROCESSING: { tone: "purple", label: "Hoàn tiền đang xử lý" },
    REFUND_RECONCILE: { tone: "amber", label: "Hoàn tiền chờ đối soát" },
    REFUNDED: { tone: "green", label: "Đã hoàn tiền" },
    REJECTED: { tone: "gray", label: "Không chấp thuận" },
    WITHDRAWN: { tone: "gray", label: "Đã rút yêu cầu" },
    NEEDS_INFO_MANAGER: { tone: "amber", label: "Cần bổ sung thông tin" },
    RESOLVED: { tone: "green", label: "Đã giải quyết" },
    CLOSED: { tone: "gray", label: "Đã đóng" },
  };
  const item = map[status] || { tone: "gray", label: status || "—" };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Trạng thái giao dịch hoàn tiền (mô phỏng). */
export function RefundStatusBadge({ status }) {
  const map = {
    APPROVED: { tone: "blue", label: "Đã duyệt hoàn" },
    PROCESSING: { tone: "purple", label: "Đang xử lý hoàn" },
    DONE: { tone: "green", label: "Hoàn thành công" },
    FAILED: { tone: "red", label: "Hoàn thất bại" },
    RECONCILE: { tone: "amber", label: "Chờ đối soát" },
  };
  const item = map[status] || { tone: "gray", label: status || "—" };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Trạng thái phiếu xác minh vận chuyển. */
export function VerificationTicketBadge({ status }) {
  const map = {
    NOT_SENT: { tone: "gray", label: "Chưa gửi" },
    SENT: { tone: "blue", label: "Đã gửi" },
    AWAITING: { tone: "amber", label: "Chờ phản hồi" },
    RESPONDED: { tone: "green", label: "Đã phản hồi" },
  };
  const item = map[status] || { tone: "gray", label: status || "—" };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Trạng thái kiểm tra dữ liệu giao dịch. */
export function VerificationBadge({ verification }) {
  const map = {
    VERIFIED: { tone: "green", label: "Hợp lệ" },
    PENDING: { tone: "amber", label: "Chờ kiểm tra" },
    NEEDS_INFO: { tone: "amber", label: "Cần bổ sung dữ liệu" },
    DISPUTED: { tone: "red", label: "Đang khiếu nại" },
    RETURNED: { tone: "purple", label: "Hoàn trả" },
    REJECTED: { tone: "gray", label: "Không hợp lệ" },
    NONE: { tone: "gray", label: "Không áp dụng" },
  };
  const item = map[verification] || { tone: "gray", label: verification };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Tình trạng điện thoại. */
export function ConditionBadge({ condition }) {
  const map = {
    "Rất tốt": "green",
    Tốt: "blue",
    Khá: "amber",
  };
  return <StatusBadge tone={map[condition] || "gray"}>{condition}</StatusBadge>;
}

/** Trạng thái tin đăng. */
export function ListingStatusBadge({ status }) {
  const map = {
    ACTIVE: { tone: "green", label: "Đang hoạt động" },
    PAUSED: { tone: "amber", label: "Tạm ẩn" },
    SOLD: { tone: "gray", label: "Đã bán" },
  };
  const item = map[status] || { tone: "gray", label: status };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}
