/** Nhãn tiếng Việt và tông màu (StatusBadge) cho các trạng thái của backend. */
export const NEGOTIATION_STATUS = {
  AWAITING_SELLER: { label: "Chờ người bán phản hồi", tone: "amber" },
  AWAITING_BUYER: { label: "Chờ người mua phản hồi", tone: "amber" },
  AGREED: { label: "Đã chốt giá", tone: "green" },
  REJECTED: { label: "Bị từ chối", tone: "red" },
  CANCELLED: { label: "Người mua đã hủy", tone: "gray" },
  CLOSED: { label: "Đã đóng", tone: "gray" },
};

export const ORDER_STATUS = {
  AWAITING_PAYMENT: { label: "Chờ thanh toán", tone: "amber" },
  CONFIRMED: { label: "Đã xác nhận, chờ gửi hàng", tone: "blue" },
  SHIPPING: { label: "Đang giao hàng", tone: "purple" },
  DELIVERED: { label: "Đã giao, đang kiểm tra", tone: "blue" },
  RECEIVED: { label: "Đã nhận hàng, đang kiểm tra", tone: "blue" },
  ON_HOLD: { label: "Đang xử lý yêu cầu", tone: "amber" },
  COMPLETED: { label: "Hoàn tất", tone: "green" },
  REFUNDED: { label: "Đã hoàn tiền", tone: "gray" },
  CANCELLED: { label: "Đã hủy", tone: "red" },
  RETURNED_TO_SELLER: { label: "Đã hoàn về người bán", tone: "red" },
};

export const PAYMENT_STATUS = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán (RePrice đang giữ tiền)",
  FAILED: "Thanh toán thất bại",
  COD_PENDING: "COD — chờ thu tiền khi giao",
  COD_COLLECTED: "COD — đã thu tiền",
  VOID: "Đã hủy",
};

export const PAYOUT_STATUS = {
  HELD: "RePrice đang giữ tiền",
  RELEASED: "Đã chuyển cho người bán",
  REVERSED: "Hoàn lại người mua",
};

export const SHIPMENT_STATUS = {
  AWAITING_PICKUP: "Chờ lấy hàng",
  PICKED_UP: "Đã lấy hàng",
  IN_TRANSIT: "Đang trung chuyển",
  OUT_FOR_DELIVERY: "Đang giao",
  DELIVERED: "Giao thành công",
  FAILED: "Giao thất bại",
  RETURNING: "Đang hoàn về người bán",
  RETURNED: "Đã hoàn về người bán",
  VOIDED: "Đã hủy",
  INCIDENT: "Sự cố vận chuyển",
};

export const PAYMENT_CHANNELS = [
  { value: "BANK_TRANSFER", label: "Chuyển khoản ngân hàng" },
  { value: "EWALLET", label: "Ví điện tử" },
  { value: "QR", label: "Quét mã QR" },
];

export const REFERENCE_STATUS = {
  PENDING_COMPLETION: { label: "Chờ hoàn tất đơn", tone: "gray" },
  PENDING_VERIFICATION: { label: "Chờ xác minh", tone: "amber" },
  ELIGIBLE: { label: "Đủ điều kiện", tone: "green" },
  EXCLUDED: { label: "Không sử dụng", tone: "red" },
  REVOKED: { label: "Đã thu hồi", tone: "purple" },
};

export const FLAG_LABEL = {
  PAYMENT_DELIVERY_CONTRADICTION: "Thanh toán và giao nhận mâu thuẫn",
  SNAPSHOT_MISSING_OR_INCONSISTENT: "Thông tin máy thiếu hoặc mâu thuẫn",
  DUPLICATE_DETAIL_CONFLICT: "Trùng mã chi tiết, dữ liệu xung đột",
  BUYER_SELLER_SAME_SUBJECT: "Người mua và người bán có thể là một",
  DEVICE_CIRCULATION: "Cùng máy chuyển vòng giữa các tài khoản",
  ELIGIBLE_THEN_RETURNED: "Đủ điều kiện rồi bị trả hàng",
};

export const RELATION_LABEL = {
  SAME_ORDER: "Cùng đơn",
  SAME_BUYER: "Cùng người mua",
  SAME_SELLER: "Cùng người bán",
  SAME_DEVICE: "Cùng thiết bị",
};

export const DECISION_ACTIONS = {
  ALLOW: { label: "Cho phép sử dụng", variant: "success", hint: "Giao dịch vào tập tính giá; cờ nghi vấn được đóng." },
  KEEP_PENDING: { label: "Tiếp tục chờ xác minh", variant: "outline", hint: "Giữ ngoài tập tính giá đến khi có kết quả." },
  EXCLUDE: { label: "Không sử dụng", variant: "danger", hint: "Loại khỏi dữ liệu tham chiếu; không ảnh hưởng đơn hàng." },
  REVOKE: { label: "Thu hồi", variant: "danger", hint: "Ngừng dùng giao dịch từng được chấp nhận; giữ nguyên lịch sử." },
  REVOKE_RECALC: { label: "Thu hồi và tính lại", variant: "danger", hint: "Thu hồi và tính lại ngay dải giá của nhóm máy." },
};

const APPEARANCE_VI = { EXCELLENT: "Xuất sắc", GOOD: "Tốt", FAIR: "Trung bình", POOR: "Kém" };
const FUNCTIONALITY_VI = { FULL: "Hoạt động đầy đủ", HAS_FAULTS: "Có lỗi", NOT_FULLY_CHECKED: "Chưa kiểm tra đủ" };
const BATTERY_VI = { GE_90: "Pin ≥ 90%", FROM_80_TO_89: "Pin 80–89%", LT_80: "Pin < 80%" };

/** "GOOD|FULL|FROM_80_TO_89" → "Tốt · Hoạt động đầy đủ · Pin 80–89%". */
export function conditionKeyLabel(key) {
  if (!key) return "Thiếu tiêu chí";
  const [a, f, b] = key.split("|");
  return [APPEARANCE_VI[a] || a, FUNCTIONALITY_VI[f] || f, BATTERY_VI[b] || b].join(" · ");
}

export const CASE_TYPE = { RETURN: "Trả hàng / hoàn tiền", NOT_RECEIVED: "Báo chưa nhận hàng", COMPLAINT: "Khiếu nại" };

export const CASE_REASON = {
  WRONG_DEVICE: "Sai máy / phiên bản",
  NOT_AS_DESCRIBED: "Sai mô tả",
  UNDISCLOSED_FAULT: "Lỗi chức năng chưa công bố",
  MISSING_ACCESSORY: "Thiếu / sai phụ kiện",
  SHIPPING_DAMAGE: "Hư hỏng khi vận chuyển",
  NOT_RECEIVED: "Chưa nhận được hàng",
  OTHER: "Khác",
};

export const CASE_STATUS = {
  AWAITING_SELLER: { label: "Chờ người bán phản hồi", tone: "amber" },
  AWAITING_BUYER_INFO: { label: "Chờ người mua bổ sung", tone: "amber" },
  AWAITING_SELLER_DECISION: { label: "Chờ người bán quyết định", tone: "amber" },
  AWAITING_BUYER_CHOICE: { label: "Chờ người mua lựa chọn", tone: "amber" },
  ADMIN_REVIEW: { label: "RePrice đang xem xét", tone: "purple" },
  PLAN_REVIEW: { label: "Đã có phương án, chờ hiệu lực", tone: "purple" },
  RETURN_APPROVED: { label: "Chấp thuận trả hàng", tone: "blue" },
  AWAITING_HANDOVER: { label: "Chờ người mua gửi trả", tone: "blue" },
  RETURNING: { label: "Đang chuyển hàng trả", tone: "blue" },
  RETURN_INSPECTION: { label: "Người bán kiểm tra hàng trả", tone: "blue" },
  REFUNDING: { label: "Đang hoàn tiền", tone: "blue" },
  RESOLVED: { label: "Đã giải quyết", tone: "green" },
  REJECTED: { label: "Không chấp thuận", tone: "red" },
  WITHDRAWN: { label: "Người mua đã rút", tone: "gray" },
};

export const REFUND_STATUS = {
  APPROVED: "Đã duyệt hoàn, chưa gửi lệnh",
  PROCESSING: "Đang xử lý hoàn",
  SUCCEEDED: "Hoàn thành công",
  FAILED: "Hoàn thất bại",
  RECONCILING: "Chờ đối soát",
};

export const RESOLUTION_DECISION = {
  APPROVE_RETURN: "Chấp thuận trả hàng và hoàn tiền",
  REFUND_NO_RETURN: "Hoàn tiền không cần trả máy",
  REJECT: "Không chấp thuận yêu cầu",
  CONTINUE_VERIFY: "Tiếp tục xác minh",
};

export const PARTY_LABEL = { BUYER: "Người mua", SELLER: "Người bán", ADMIN: "RePrice", SYSTEM: "Hệ thống" };

export const ACCESSORY_VI = { BOX: "Hộp", CHARGER: "Củ sạc", CABLE: "Cáp sạc", EARPHONES: "Tai nghe", CASE: "Ốp lưng", OTHER: "Khác" };

export const CASE_EVENT = {
  EVIDENCE: "Gửi bằng chứng",
  ASSIGN: "QTV nhận xử lý",
  VERIFY_SHIPPING: "Gửi xác minh vận chuyển",
  CONTINUE_VERIFY: "Tiếp tục xác minh",
  REFUND_NOT_RECEIVED: "Người mua báo chưa nhận được tiền hoàn",
};
