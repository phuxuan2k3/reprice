/**
 * QUY TẮC NGHIỆP VỤ ĐƠN HÀNG — RePrice (Phần XVI).
 *
 * Toàn bộ hàm ở đây là HÀM THUẦN (không phụ thuộc React, không đọc localStorage)
 * để dùng chung cho: context (AppContext), các trang giao diện và bộ kiểm thử
 * tự động (`scripts/order-selftest.mjs`).
 *
 * NGUYÊN TẮC:
 *  - KHÔNG gộp trạng thái đơn hàng / thanh toán / giao nhận / trả hàng / dữ liệu
 *    giá tham chiếu vào một trường duy nhất. Mỗi nhóm có trạng thái riêng.
 *  - Mọi trạng thái tiền và sự kiện giao nhận là MÔ PHỎNG — dự án CHƯA tích hợp
 *    cổng thanh toán, đơn vị vận chuyển hay dịch vụ thu hộ thật.
 *  - Không tự đặt ngưỡng ngoài đặc tả. Các mốc có căn cứ: 3 ngày hậu giao hàng,
 *    48 giờ phản hồi của người bán, tối đa 1 lần giao lại.
 */

import { HANDOVER_SHIPPING_STATUSES, isHandoverStatus } from "./shipping.js";

/* ===================================================================== */
/* 1. PHƯƠNG THỨC THANH TOÁN                                             */
/* ===================================================================== */

/** Hai phương thức RePrice hỗ trợ (khóa kỹ thuật giữ tương thích dữ liệu cũ). */
export const PAYMENT_METHODS = {
  QR: "Thanh toán trước (chuyển khoản/QR — mô phỏng)",
  COD: "Thanh toán khi nhận hàng (COD)",
};

/** Phương thức thuộc nhóm nào. */
export function paymentMethodKind(method) {
  return method === "COD" ? "COD" : "PREPAID";
}

export function isCod(order) {
  return order?.paymentMethod === "COD";
}

/* ===================================================================== */
/* 2. TRẠNG THÁI THANH TOÁN (tách biệt khỏi trạng thái đơn hàng)         */
/* ===================================================================== */

export const PAYMENT_STATUS = {
  /** Chưa phát sinh giao dịch tiền (chưa chọn phương thức). */
  NONE: "NONE",
  /** Thanh toán trước: chờ người mua thanh toán. */
  PENDING_PAYMENT: "PENDING_PAYMENT",
  /** Thanh toán trước: đã thanh toán (mô phỏng). */
  PAID: "PAID",
  /** Thanh toán trước: cổng mô phỏng báo thất bại. */
  FAILED: "FAILED",
  /** COD: chờ thu tiền khi giao hàng. */
  PENDING_COD_COLLECTION: "PENDING_COD_COLLECTION",
  /** COD: đã thu tiền từ người mua (mô phỏng). */
  COD_COLLECTED: "COD_COLLECTED",
  /** COD: chờ đối soát với (đơn vị thu hộ mô phỏng). */
  PENDING_COD_RECONCILE: "PENDING_COD_RECONCILE",
  /** COD: đã đối soát (mô phỏng). */
  COD_RECONCILED: "COD_RECONCILED",
  /** Hoàn tiền đang xử lý (chưa có kết quả xác minh). */
  REFUND_PROCESSING: "REFUND_PROCESSING",
  /** Đã hoàn tiền (kết quả mô phỏng). */
  REFUNDED: "REFUNDED",
};

export const PAYMENT_STATUS_LABEL = {
  NONE: "Chưa phát sinh thanh toán",
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thanh toán thất bại",
  PENDING_COD_COLLECTION: "Chờ thu tiền COD",
  COD_COLLECTED: "Đã thu tiền COD",
  PENDING_COD_RECONCILE: "Chờ đối soát COD",
  COD_RECONCILED: "Đã đối soát COD",
  REFUND_PROCESSING: "Hoàn tiền đang xử lý",
  REFUNDED: "Đã hoàn tiền",
  // Tương thích dữ liệu cũ.
  NOT_PAID: "Chưa thanh toán",
  PENDING_CONFIRMATION: "Chờ xác nhận thanh toán",
};

/** Sắc thái hiển thị huy hiệu trạng thái thanh toán. */
export const PAYMENT_STATUS_TONE = {
  NONE: "gray",
  PENDING_PAYMENT: "amber",
  PAID: "green",
  FAILED: "red",
  PENDING_COD_COLLECTION: "amber",
  COD_COLLECTED: "blue",
  PENDING_COD_RECONCILE: "amber",
  COD_RECONCILED: "green",
  REFUND_PROCESSING: "purple",
  REFUNDED: "purple",
  NOT_PAID: "gray",
  PENDING_CONFIRMATION: "amber",
};

/** Trạng thái khởi tạo theo phương thức (KHÔNG tự coi COD là đã thu tiền). */
export function initialPaymentStatus(method) {
  return method === "COD"
    ? PAYMENT_STATUS.PENDING_COD_COLLECTION
    : PAYMENT_STATUS.PENDING_PAYMENT;
}

/** Bước kế tiếp trong luồng COD, hoặc null nếu đã đối soát xong. */
export const COD_FLOW = [
  PAYMENT_STATUS.PENDING_COD_COLLECTION,
  PAYMENT_STATUS.COD_COLLECTED,
  PAYMENT_STATUS.PENDING_COD_RECONCILE,
  PAYMENT_STATUS.COD_RECONCILED,
];

export function nextCodPaymentStatus(status) {
  const i = COD_FLOW.indexOf(status);
  if (i < 0 || i >= COD_FLOW.length - 1) return null;
  return COD_FLOW[i + 1];
}

/** Các trạng thái hợp lệ cho một phương thức (chỉ dùng đúng luồng thực tế). */
export function paymentStatusesForMethod(method) {
  return method === "COD"
    ? [PAYMENT_STATUS.PENDING_COD_COLLECTION, ...COD_FLOW.slice(1), PAYMENT_STATUS.REFUND_PROCESSING, PAYMENT_STATUS.REFUNDED]
    : [PAYMENT_STATUS.PENDING_PAYMENT, PAYMENT_STATUS.PAID, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.REFUND_PROCESSING, PAYMENT_STATUS.REFUNDED];
}

/** Thanh toán đã được xác minh (đủ điều kiện xét dữ liệu tham chiếu/chi trả). */
export function isPaymentSettled(order) {
  if (!order) return false;
  // Tương thích dữ liệu cũ: PAID của đơn thanh toán trước.
  if (order.paymentStatus === PAYMENT_STATUS.PAID) return paymentMethodKind(order.paymentMethod) === "PREPAID" || order.paymentMethod == null;
  return order.paymentStatus === PAYMENT_STATUS.COD_RECONCILED;
}

export function isPaymentRefunded(order) {
  return order?.paymentStatus === PAYMENT_STATUS.REFUNDED;
}

export function isRefundInProgress(order) {
  return order?.paymentStatus === PAYMENT_STATUS.REFUND_PROCESSING;
}

/** COD đã cho phép thao tác thu tiền/đối soát hay chưa (sau khi giao). */
export function canCollectCod(order) {
  if (!order || !isCod(order)) return false;
  return order.shippingStatus === "DELIVERED" || order.status === "COMPLETED";
}

/* ===================================================================== */
/* 3. QUY TẮC HỦY ĐƠN                                                    */
/* ===================================================================== */

export const CANCEL_PHASE = {
  BEFORE_CONFIRM: "BEFORE_CONFIRM", // trước khi hai bên xác nhận
  AFTER_CONFIRM_UNPAID: "AFTER_CONFIRM_UNPAID", // đã xác nhận nhưng CHƯA bàn giao hàng
  LOCKED: "LOCKED", // đã thanh toán / đã bàn giao → không hủy thông thường
};

/**
 * Sự kiện BÀN GIAO cho đơn vị vận chuyển đã được GHI NHẬN (không chỉ là việc
 * có mã vận đơn). Duyệt ngược để lấy sự kiện gần nhất.
 */
export function carrierHandoverEvent(order) {
  const events = order?.shippingEvents || [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const s = events[i]?.to || events[i]?.status;
    if (isHandoverStatus(s)) return events[i];
  }
  return null;
}

/**
 * Đã bàn giao kiện hàng cho đơn vị vận chuyển chưa?
 * Căn cứ vào SỰ KIỆN bàn giao đã ghi nhận (hoặc trạng thái vận chuyển hiện tại),
 * KHÔNG căn cứ vào việc chỉ có mã vận đơn. Vì vậy "đã có vận đơn nhưng chưa
 * bàn giao" vẫn cho phép hủy (Trường hợp B).
 */
export function hasCarrierHandover(order) {
  if (!order) return false;
  if (carrierHandoverEvent(order)) return true;
  return isHandoverStatus(order.shippingStatus);
}

/** Thời điểm ghi nhận bàn giao (nếu có). */
export function handoverAt(order) {
  return carrierHandoverEvent(order)?.time || null;
}

/** Đơn đã có mã vận đơn nhưng CHƯA bàn giao cho đơn vị vận chuyển. */
export function shipmentNotYetHandedOver(order) {
  return !!order?.trackingCode && !hasCarrierHandover(order);
}

/**
 * Giai đoạn hủy của đơn (KHÔNG xét quyền người dùng).
 * Sau khi đã thanh toán HOẶC hàng đã BÀN GIAO cho đơn vị vận chuyển ⇒ LOCKED.
 * Chuẩn bị hàng / chờ lấy hàng / đã có vận đơn nhưng chưa bàn giao ⇒ vẫn hủy được.
 */
export function cancelPhase(order) {
  if (!order) return CANCEL_PHASE.LOCKED;
  if (["CANCELLED", "SELLER_REJECTED"].includes(order.status)) return CANCEL_PHASE.LOCKED;

  const settled = isPaymentSettled(order) || isPaymentRefunded(order) || isRefundInProgress(order);
  if (settled || hasCarrierHandover(order)) return CANCEL_PHASE.LOCKED;

  if (["PENDING_BUYER", "PENDING_SELLER"].includes(order.status))
    return CANCEL_PHASE.BEFORE_CONFIRM;
  // Đã xác nhận (kể cả đang chuẩn bị hàng hoặc đã tạo vận đơn nhưng CHƯA bàn
  // giao): người mua vẫn hủy được nhưng phải xác nhận lại.
  if (["CONFIRMED", "SHIPPING"].includes(order.status))
    return CANCEL_PHASE.AFTER_CONFIRM_UNPAID;
  return CANCEL_PHASE.LOCKED;
}

/** Mã lý do khóa hủy — để giao diện hướng dẫn đúng luồng thay thế. */
export function cancelLockCode(order) {
  if (isPaymentSettled(order) || isPaymentRefunded(order) || isRefundInProgress(order))
    return "PAID";
  if (hasCarrierHandover(order)) return "HANDED_OVER";
  if (["CANCELLED", "SELLER_REJECTED"].includes(order?.status)) return "CLOSED";
  return "OTHER";
}

/** Thông báo dễ hiểu khi không thể hủy trực tiếp. */
export const CANCEL_LOCK_MESSAGE = {
  PAID: "Đơn đã thanh toán — không hủy thông thường. Hãy dùng luồng trả hàng/hoàn tiền/tranh chấp.",
  HANDED_OVER:
    "Đơn hàng đã được bàn giao cho đơn vị vận chuyển nên bạn không thể hủy trực tiếp. Bạn có thể theo dõi quá trình giao hàng.",
  CLOSED: "Đơn hàng đã kết thúc — không thể hủy.",
  OTHER: "Đơn hàng không thể hủy ở trạng thái hiện tại.",
};

/**
 * Người dùng hiện tại có được hủy đơn theo trạng thái + vai trò hay không.
 * Trả { allowed, phase, reason, requiresReason, requiresConfirm, mode, code }.
 *  - `mode: "CANCEL"` khi được hủy thường.
 *  - `mode: "ALT_FLOW"` khi KHÔNG hủy thường mà phải chuyển luồng
 *    (giao thất bại / trả hàng / hoàn tiền / tranh chấp).
 *  - `code`: "HANDED_OVER" | "PAID" | "CLOSED" | "OTHER" khi bị khóa.
 */
export function canCancelOrder(order, actor = {}) {
  const { userId = null, role = null } = actor;
  if (!order)
    return { allowed: false, phase: CANCEL_PHASE.LOCKED, mode: "NONE", code: "OTHER", reason: "Không tìm thấy đơn hàng." };

  const isBuyer = !!userId && order.buyerId === userId;
  const isSeller = !!userId && order.sellerId === userId;
  const isManager = role === "manager";
  if (!isBuyer && !isSeller && !isManager)
    return {
      allowed: false,
      phase: cancelPhase(order),
      mode: "NONE",
      code: "OTHER",
      reason: "Bạn không có quyền hủy đơn hàng này.",
    };

  const phase = cancelPhase(order);
  if (phase === CANCEL_PHASE.LOCKED) {
    const code = cancelLockCode(order);
    return {
      allowed: false,
      phase,
      mode: "ALT_FLOW",
      code,
      reason: CANCEL_LOCK_MESSAGE[code] || CANCEL_LOCK_MESSAGE.OTHER,
    };
  }

  return {
    allowed: true,
    phase,
    mode: "CANCEL",
    code: phase,
    // Sau khi hai bên xác nhận (Trường hợp B): bắt buộc ghi lý do và xác nhận lại.
    requiresReason: phase === CANCEL_PHASE.AFTER_CONFIRM_UNPAID,
    requiresConfirm: phase === CANCEL_PHASE.AFTER_CONFIRM_UNPAID,
    reason: "",
  };
}

/** Bản ghi hủy đơn: người hủy, vai trò, thời gian, lý do. */
export function makeCancelRecord(user, reason, at) {
  return {
    cancelledBy: user?.name || "Hệ thống",
    cancelledById: user?.id || null,
    cancelledByRole: user?.role || null,
    cancelledAt: at || new Date().toISOString(),
    reason: reason || "",
    simulated: true,
  };
}

/* ===================================================================== */
/* 4. XỬ LÝ GIAO HÀNG THẤT BẠI (giao lại tối đa 1 lần)                    */
/* ===================================================================== */

export const MAX_DELIVERY_ATTEMPTS = 2; // 1 giao lần đầu + 1 lần giao lại

/** Số lần giao đã thất bại. */
export function deliveryFailureCount(order) {
  return Number(order?.deliveryAttempts) || 0;
}

/** Loại lý do giao thất bại gần nhất (REFUSED nếu người mua từ chối nhận). */
export function deliveryFailureKind(order) {
  return order?.lastDeliveryFailureKind || null;
}

/** Còn được giao lại hay không (thất bại lần đầu). */
export function canRetryDelivery(order) {
  return order?.shippingStatus === "FAILED" && deliveryFailureCount(order) < MAX_DELIVERY_ATTEMPTS;
}

/** Đã giao lại và tiếp tục thất bại ⇒ BẮT BUỘC chuyển hoàn về người bán. */
export function mustReturnToSeller(order) {
  return order?.shippingStatus === "FAILED" && deliveryFailureCount(order) >= MAX_DELIVERY_ATTEMPTS;
}

/**
 * Người mua đã TỪ CHỐI NHẬN HÀNG (sự kiện giao thất bại do người mua từ chối).
 * Đây KHÔNG phải lỗi của bên nào và KHÔNG đồng nghĩa đã hoàn tiền.
 */
export function isBuyerRefusal(order) {
  if (order?.shippingStatus !== "FAILED") return false;
  if (order?.lastDeliveryFailureKind === "REFUSED") return true;
  return (order?.shippingEvents || []).some(
    (e) => e?.failureKind === "REFUSED" || e?.refusal === true
  );
}

/**
 * Được phép chuyển hoàn về người bán hay chưa:
 *  - Đã giao lại và tiếp tục thất bại, HOẶC
 *  - Người mua từ chối nhận hàng (hàng phải quay về người bán, không cần giao lại).
 */
export function canStartReturnToSeller(order) {
  if (order?.shippingStatus !== "FAILED") return false;
  return mustReturnToSeller(order) || isBuyerRefusal(order);
}

/* ===================================================================== */
/* 5. TRẢ HÀNG / KHIẾU NẠI                                               */
/* ===================================================================== */

export const RETURN_WINDOW_DAYS = 3; // thời hạn yêu cầu trả hàng/khiếu nại
export const SELLER_RESPONSE_HOURS = 48; // hạn người bán phản hồi

/**
 * Trạng thái HỒ SƠ (yêu cầu trả hàng/khiếu nại) — tách biệt hoàn toàn khỏi
 * trạng thái đơn hàng, thanh toán, vận đơn trả, chuyển tiền và hoàn tiền.
 * Mỗi hồ sơ chỉ có MỘT trạng thái đang hoạt động; hồ sơ cũ vẫn giữ lịch sử.
 */
export const RETURN_STATUS = {
  // --- Trao đổi trực tiếp giữa hai bên ---
  PENDING_SELLER: "PENDING_SELLER", // chờ người bán phản hồi (48 giờ)
  SELLER_SUPPLEMENT: "SELLER_SUPPLEMENT", // người bán đề nghị bổ sung → chờ người mua (48 giờ)
  IN_PROGRESS: "IN_PROGRESS", // người mua đã bổ sung → chờ người bán quyết định lại (24 giờ)
  AFTER_REJECT_BUYER: "AFTER_REJECT_BUYER", // người bán từ chối → chờ người mua chọn (48 giờ)
  // --- Quản trị viên ---
  PENDING_MANAGER: "PENDING_MANAGER", // đã chuyển QTV, chờ nhận phụ trách
  NEEDS_INFO: "NEEDS_INFO", // QTV yêu cầu bổ sung
  UNDER_REVIEW: "UNDER_REVIEW", // QTV đã nhận phụ trách, đang xác minh
  AWAITING_PLAN: "AWAITING_PLAN", // chờ hoàn thiện phương án (thiếu thông tin bắt buộc)
  PLAN_REVIEW: "PLAN_REVIEW", // phương án đã ban hành, đang trong 48 giờ xem xét lại
  PLAN_EFFECTIVE: "PLAN_EFFECTIVE", // phương án có hiệu lực
  // --- Trả hàng ---
  RETURN_PENDING_INFO: "RETURN_PENDING_INFO", // chờ hoàn thiện thông tin nhận trả
  ACCEPTED_RETURN: "ACCEPTED_RETURN", // đã thống nhất trả hàng (kế thừa dữ liệu cũ)
  RETURN_AWAITING_HANDOVER: "RETURN_AWAITING_HANDOVER", // chờ người mua bàn giao (3 ngày)
  RETURNING: "RETURNING", // đang vận chuyển trả
  RETURNED: "RETURNED", // đã giao trả, chờ người bán kiểm tra (48 giờ)
  RETURN_OBSTACLE: "RETURN_OBSTACLE", // có trở ngại gửi trả
  RETURN_DISPUTE: "RETURN_DISPUTE", // người bán báo vấn đề hàng trả → QTV
  // --- Hoàn tiền ---
  REFUND_ELIGIBLE: "REFUND_ELIGIBLE", // đủ điều kiện hoàn tiền
  REFUND_PROCESSING: "REFUND_PROCESSING", // đang xử lý hoàn (chưa có kết quả)
  PENDING_REFUND: "PENDING_REFUND", // chờ hoàn tiền (kế thừa dữ liệu cũ)
  REFUND_RECONCILE: "REFUND_RECONCILE", // hoàn thất bại/chờ đối soát
  REFUNDED: "REFUNDED", // đã hoàn tiền (kết quả mô phỏng)
  // --- Kết thúc ---
  REJECTED: "REJECTED", // kết luận không chấp thuận (đã đóng)
  WITHDRAWN: "WITHDRAWN", // người mua rút yêu cầu (đã đóng)
  RESOLVED: "RESOLVED", // đã giải quyết (đã đóng)
  CLOSED: "CLOSED", // đã đóng
};

/** Trạng thái được coi là ĐANG MỞ (chặn hoàn tất + chặn dữ liệu tham chiếu). */
export const OPEN_RETURN_STATUSES = [
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
];

/** Trạng thái đã khép lại. */
export const CLOSED_RETURN_STATUSES = [
  RETURN_STATUS.RESOLVED,
  RETURN_STATUS.CLOSED,
  RETURN_STATUS.REJECTED,
  RETURN_STATUS.WITHDRAWN,
  RETURN_STATUS.REFUNDED,
];

/** Nhãn hiển thị của trạng thái hồ sơ. */
export const RETURN_STATUS_LABEL = {
  [RETURN_STATUS.PENDING_SELLER]: "Chờ người bán phản hồi",
  [RETURN_STATUS.SELLER_SUPPLEMENT]: "Người bán đề nghị bổ sung",
  [RETURN_STATUS.IN_PROGRESS]: "Đang trao đổi",
  [RETURN_STATUS.AFTER_REJECT_BUYER]: "Người bán từ chối — chờ người mua",
  [RETURN_STATUS.PENDING_MANAGER]: "Chờ quản lý xử lý",
  [RETURN_STATUS.NEEDS_INFO]: "Quản lý yêu cầu bổ sung",
  [RETURN_STATUS.UNDER_REVIEW]: "Quản lý đang xác minh",
  [RETURN_STATUS.AWAITING_PLAN]: "Chờ hoàn thiện phương án",
  [RETURN_STATUS.PLAN_REVIEW]: "Phương án chờ hết hạn xem xét lại",
  [RETURN_STATUS.PLAN_EFFECTIVE]: "Phương án có hiệu lực",
  [RETURN_STATUS.RETURN_PENDING_INFO]: "Chờ hoàn thiện thông tin nhận trả",
  [RETURN_STATUS.ACCEPTED_RETURN]: "Chấp nhận trả hàng",
  [RETURN_STATUS.RETURN_AWAITING_HANDOVER]: "Chờ người mua bàn giao",
  [RETURN_STATUS.RETURNING]: "Đang vận chuyển trả",
  [RETURN_STATUS.RETURNED]: "Đã giao trả, chờ kiểm tra",
  [RETURN_STATUS.RETURN_OBSTACLE]: "Có trở ngại trả hàng",
  [RETURN_STATUS.RETURN_DISPUTE]: "Có tranh chấp hàng trả",
  [RETURN_STATUS.REFUND_ELIGIBLE]: "Đủ điều kiện hoàn tiền",
  [RETURN_STATUS.REFUND_PROCESSING]: "Hoàn tiền đang xử lý",
  [RETURN_STATUS.PENDING_REFUND]: "Chờ hoàn tiền",
  [RETURN_STATUS.REFUND_RECONCILE]: "Hoàn tiền chờ đối soát",
  [RETURN_STATUS.REFUNDED]: "Đã hoàn tiền",
  [RETURN_STATUS.REJECTED]: "Không chấp thuận",
  [RETURN_STATUS.WITHDRAWN]: "Đã rút yêu cầu",
  [RETURN_STATUS.RESOLVED]: "Đã giải quyết",
  [RETURN_STATUS.CLOSED]: "Đã đóng",
};

export function isReturnOpen(req) {
  return OPEN_RETURN_STATUSES.includes(req?.status);
}

export function openReturnRequests(order) {
  return (order?.supportRequests || []).filter(isReturnOpen);
}

export function hasOpenReturn(order) {
  return openReturnRequests(order).length > 0;
}

export const RETURN_REASON_OPTIONS = [
  "Hàng không đúng mô tả",
  "Hàng hư hỏng",
  "Thiếu phụ tùng/phụ kiện",
  "Không đáp ứng điều kiện đã thống nhất",
  "Chưa nhận được hàng",
  "Lý do khác",
];

/**
 * Kiểm tra yêu cầu trả hàng có đủ thông tin tối thiểu hay không.
 * Yêu cầu: lý do cụ thể + mô tả vấn đề (+ bằng chứng nếu có) + mã đơn/mã chi tiết.
 */
export function validateReturnRequest({ reason, description, evidence, orderId, detailId } = {}) {
  const errors = [];
  if (!reason || !String(reason).trim()) errors.push("Cần nêu lý do cụ thể.");
  if (!description || !String(description).trim()) errors.push("Cần mô tả vấn đề.");
  if (!orderId) errors.push("Thiếu mã đơn hàng liên quan.");
  // Bằng chứng là tuỳ chọn (chỉ khi có thể cung cấp), nhưng nếu khai báo thì phải có nội dung.
  const ev = normalizeEvidence(evidence);
  if (evidence && !ev.length && String(evidence).trim() === "") {
    errors.push("Bằng chứng đã khai báo nhưng chưa có nội dung.");
  }
  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      reason: String(reason || "").trim(),
      description: String(description || "").trim(),
      evidence: ev,
      orderId: orderId || null,
      detailId: detailId || null,
    },
  };
}

function normalizeEvidence(evidence) {
  if (!evidence) return [];
  if (Array.isArray(evidence)) return evidence.map((e) => String(e).trim()).filter(Boolean);
  return String(evidence)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* -------- Đồng hồ 3 ngày (tính từ bằng chứng giao hàng + đã thông báo) --- */

/**
 * Bằng chứng giao hàng xác minh + mốc 3 ngày.
 * Trả { verifiedAt, source, notifiedAt, startedAt, deadlineAt, hasProof }.
 */
export function deliveryClock(order) {
  const proof = order?.deliveryProof || null;
  const verifiedAt = proof?.at || order?.deliveredAt || null;
  const notifiedAt = proof?.notifiedAt || null;
  const startedAt = notifiedAt || verifiedAt;
  return {
    verifiedAt,
    source: proof?.source || (verifiedAt ? "SIMULATED" : null),
    notifiedAt,
    startedAt,
    deadlineAt: proof?.deadlineAt || (startedAt ? addDays(startedAt, RETURN_WINDOW_DAYS) : null),
    hasProof: !!verifiedAt,
  };
}

/** Đã hết thời hạn 3 ngày hậu giao hàng chưa. */
export function afterDeliveryWindowElapsed(order, now = new Date()) {
  const { startedAt } = deliveryClock(order);
  if (!startedAt) return false;
  return now.getTime() - parseTime(startedAt) >= RETURN_WINDOW_DAYS * DAY_MS;
}

/** Còn trong thời hạn gửi yêu cầu trả hàng/khiếu nại hay không. */
export function returnWindowOpen(order, now = new Date()) {
  const { startedAt, deadlineAt } = deliveryClock(order);
  if (!startedAt || !deadlineAt) return false;
  const t = now.getTime();
  return t >= parseTime(startedAt) && t <= parseTime(deadlineAt);
}

/** Người mua có thể gửi yêu cầu trả hàng/khiếu nại hay không. */
export function canRequestReturn(order, now = new Date()) {
  if (!order) return { allowed: false, reason: "Không tìm thấy đơn hàng." };
  if (!deliveryClock(order).hasProof)
    return { allowed: false, reason: "Chưa có bằng chứng giao hàng thành công được xác minh." };
  if (isPaymentRefunded(order))
    return { allowed: false, reason: "Đơn đã được hoàn tiền." };
  if (!returnWindowOpen(order, now))
    return { allowed: false, reason: `Đã quá thời hạn ${RETURN_WINDOW_DAYS} ngày kể từ khi giao hàng thành công.` };
  if (hasOpenReturn(order))
    return { allowed: false, reason: "Đang có yêu cầu trả hàng/khiếu nại mở cho đơn này." };
  return { allowed: true, reason: "" };
}

/** Hạn người bán phải phản hồi (48 giờ kể từ khi được thông báo). */
export function sellerResponseDueAt(req) {
  const base = req?.createdAt || req?.notifiedAt;
  if (!base) return null;
  return addHours(base, SELLER_RESPONSE_HOURS);
}

/** Người bán đã quá hạn 48 giờ mà chưa phản hồi (và yêu cầu còn mở). */
export function isSellerResponseOverdue(req, now = new Date()) {
  if (!req || req.sellerRespondedAt || !isReturnOpen(req)) return false;
  const due = sellerResponseDueAt(req);
  if (!due) return false;
  return now.getTime() > parseTime(due);
}

/* ===================================================================== */
/* 6. ĐIỀU KIỆN HOÀN TẤT ĐƠN                                             */
/* ===================================================================== */

/**
 * Đơn đã hoàn tất theo quy tắc 3 ngày hay chưa (không phụ thuộc việc người mua
 * bấm nút "đã nhận hàng").
 */
export function completionStatus(order, now = new Date()) {
  const reasons = [];
  if (!order) return { complete: false, reasons: ["Không tìm thấy đơn hàng."] };

  if (["CANCELLED", "SELLER_REJECTED"].includes(order.status))
    reasons.push("Đơn đã hủy hoặc bị người bán từ chối.");
  if (isPaymentRefunded(order) || isRefundInProgress(order)) reasons.push("Đang/đã hoàn tiền.");
  if (["RETURNING", "RETURNED"].includes(order.shippingStatus))
    reasons.push("Đang/đã hoàn hàng.");
  if (!deliveryClock(order).hasProof)
    reasons.push("Chưa có bằng chứng giao hàng thành công được xác minh.");
  else if (!afterDeliveryWindowElapsed(order, now))
    reasons.push(`Chưa hết ${RETURN_WINDOW_DAYS} ngày kể từ khi giao hàng thành công.`);
  if (hasOpenReturn(order))
    reasons.push("Còn yêu cầu trả hàng/khiếu nại đang mở.");

  const clock = deliveryClock(order);
  return {
    complete: reasons.length === 0,
    reasons,
    startedAt: clock.startedAt,
    deadlineAt: clock.deadlineAt,
  };
}

/* ===================================================================== */
/* 7. THỜI ĐIỂM NGƯỜI BÁN ĐƯỢC CHI TRẢ                                    */
/* ===================================================================== */

export const PAYOUT_STATUS = {
  NOT_APPLICABLE: "NOT_APPLICABLE",
  PENDING_ELIGIBILITY: "PENDING_ELIGIBILITY",
  ELIGIBLE: "ELIGIBLE",
  PAID_SIMULATED: "PAID_SIMULATED",
};

export const PAYOUT_STATUS_LABEL = {
  NOT_APPLICABLE: "Không áp dụng",
  PENDING_ELIGIBILITY: "Chờ đủ điều kiện chi trả",
  ELIGIBLE: "Đủ điều kiện chi trả",
  PAID_SIMULATED: "Đã ghi nhận chi trả (mô phỏng)",
};

export const PAYOUT_STATUS_TONE = {
  NOT_APPLICABLE: "gray",
  PENDING_ELIGIBILITY: "amber",
  ELIGIBLE: "green",
  PAID_SIMULATED: "green",
};

/**
 * Người bán có đủ điều kiện được ghi nhận chi trả hay không.
 * Trả { status, reasons, amount }.
 *  - Đơn hoàn tất + hết 3 ngày + không khiếu nại mở.
 *  - Không có vấn đề hoàn tiền chưa xử lý.
 *  - Thanh toán tương ứng đã xác minh (COD phải thu tiền VÀ đối soát).
 */
export function sellerPayoutEligibility(order, now = new Date()) {
  if (!order)
    return { status: PAYOUT_STATUS.NOT_APPLICABLE, reasons: ["Không tìm thấy đơn hàng."], amount: null };

  if (order.payout?.status === PAYOUT_STATUS.PAID_SIMULATED)
    return { status: PAYOUT_STATUS.PAID_SIMULATED, reasons: [], amount: order.payout.amount ?? order.negotiatedPrice ?? null };

  const reasons = [];
  const comp = completionStatus(order, now);
  if (!comp.complete) reasons.push(...comp.reasons);

  if (isRefundInProgress(order)) reasons.push("Còn khoản hoàn tiền đang xử lý.");
  if (isPaymentRefunded(order)) reasons.push("Đơn đã hoàn tiền — không chi trả.");

  if (!isPaymentSettled(order) && !isPaymentRefunded(order)) {
    if (isCod(order)) {
      if (order.paymentStatus === PAYMENT_STATUS.PENDING_COD_COLLECTION)
        reasons.push("Chưa xác minh đã thu tiền COD.");
      else if (order.paymentStatus === PAYMENT_STATUS.COD_COLLECTED)
        reasons.push("Chưa xác minh đối soát COD.");
      else if (order.paymentStatus === PAYMENT_STATUS.PENDING_COD_RECONCILE)
        reasons.push("Chưa hoàn tất đối soát COD.");
      else reasons.push("Chưa xác minh trạng thái thu tiền COD.");
    } else {
      reasons.push("Người mua chưa thanh toán.");
    }
  }

  const eligible = reasons.length === 0;
  return {
    status: eligible ? PAYOUT_STATUS.ELIGIBLE : PAYOUT_STATUS.PENDING_ELIGIBILITY,
    reasons,
    amount: order.negotiatedPrice ?? null,
  };
}

/* ===================================================================== */
/* 8. BƯỚC TIẾP THEO (gợi ý giao diện)                                   */
/* ===================================================================== */

/**
 * Cho biết bên nào đang cần thực hiện bước tiếp theo của đơn (gợi ý giao diện).
 * Trả { party: "BUYER"|"SELLER"|"MANAGER"|"CARRIER"|null, text }.
 * Chỉ để hiển thị — KHÔNG thay thế việc kiểm tra quyền trong từng hành động.
 */
export function nextActorFor(order) {
  if (!order) return { party: null, text: "Không tìm thấy đơn hàng." };
  if (openReturnRequests(order).length)
    return { party: null, text: "Đang xử lý hồ sơ trả hàng/khiếu nại của đơn." };
  if (order.status === "CANCELLED") return { party: null, text: "Đơn đã hủy." };
  if (order.status === "SELLER_REJECTED")
    return { party: null, text: "Người bán đã từ chối đơn hàng." };
  if (isPaymentRefunded(order)) return { party: null, text: "Đơn đã hoàn tiền." };
  if (isRefundInProgress(order))
    return { party: "MANAGER", text: "Quản lý đang xử lý hoàn tiền (mô phỏng)." };
  if (order.status === "PENDING_BUYER")
    return { party: "BUYER", text: "Người mua xác nhận đơn hàng." };
  if (order.status === "PENDING_SELLER")
    return { party: "SELLER", text: "Người bán xác nhận hoặc từ chối đơn hàng." };
  if (order.status === "CONFIRMED") {
    if (paymentMethodKind(order.paymentMethod) === "PREPAID" && !isPaymentSettled(order))
      return { party: "BUYER", text: "Người mua hoàn tất thanh toán (mô phỏng)." };
    return { party: "SELLER", text: "Người bán chuẩn bị hàng và tạo vận đơn." };
  }
  const s = order.shippingStatus;
  if (s === "PREPARING")
    return { party: "SELLER", text: "Người bán chuẩn bị hàng." };
  if (s === "AWAITING_PICKUP")
    return { party: "SELLER", text: "Người bán bàn giao kiện hàng cho đơn vị vận chuyển." };
  if (["ACCEPTED", "SORTING", "IN_TRANSIT", "ARRIVED_HUB"].includes(s))
    return { party: "CARRIER", text: "Đơn vị vận chuyển đang vận chuyển (mô phỏng)." };
  if (s === "OUT_FOR_DELIVERY")
    return { party: "CARRIER", text: "Đơn vị vận chuyển đang giao cho người mua (mô phỏng)." };
  if (s === "DELIVERED") {
    if (order.status === "COMPLETED") return { party: null, text: "Đơn đã hoàn tất." };
    const clock = deliveryClock(order);
    return {
      party: "BUYER",
      text: clock.deadlineAt
        ? `Người mua kiểm tra hàng; hạn ${RETURN_WINDOW_DAYS} ngày kết thúc ${clock.deadlineAt}.`
        : "Người mua kiểm tra hàng.",
    };
  }
  if (s === "FAILED") {
    if (canStartReturnToSeller(order))
      return {
        party: "SELLER",
        text: isBuyerRefusal(order)
          ? "Người mua từ chối nhận — chuyển hoàn hàng về người bán."
          : "Chuyển hoàn hàng về người bán để xử lý tiếp.",
      };
    return { party: "SELLER", text: "Người bán quyết định giao lại (1 lần) hoặc chuyển hoàn." };
  }
  if (s === "RETURNING")
    return { party: "SELLER", text: "Chờ hàng hoàn về và xác nhận đã nhận lại." };
  if (s === "RETURNED")
    return { party: "MANAGER", text: "Đối chiếu và xử lý khoản tiền theo phương thức thanh toán." };
  if (s === "VOIDED") return { party: null, text: "Vận đơn đã hủy cùng đơn hàng." };
  if (s === "INCIDENT")
    return { party: "MANAGER", text: "Quản lý xác minh sự cố vận chuyển theo luồng khiếu nại." };
  return { party: null, text: "Không có bước tiếp theo." };
}

/* ===================================================================== */
/* 9. TIỆN ÍCH THỜI GIAN                                                 */
/* ===================================================================== */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function parseTime(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function toISODateOnly(d) {
  return d.toISOString().slice(0, 10);
}

/** Cộng thêm ngày vào một mốc thời gian (ISO). Trả ISO (đầy đủ nếu đầu vào có giờ). */
export function addDays(value, days) {
  const t = parseTime(value);
  if (Number.isNaN(t)) return null;
  return new Date(t + days * DAY_MS).toISOString();
}

/** Cộng thêm giờ vào một mốc thời gian (ISO). */
export function addHours(value, hours) {
  const t = parseTime(value);
  if (Number.isNaN(t)) return null;
  return new Date(t + hours * HOUR_MS).toISOString();
}

/** Ngày hiện tại dạng YYYY-MM-DD. */
export function isoDateNow(now = new Date()) {
  return toISODateOnly(now);
}
