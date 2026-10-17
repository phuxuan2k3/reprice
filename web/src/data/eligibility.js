/**
 * KIỂM TRA ĐIỀU KIỆN ĐƯA GIAO DỊCH VÀO DẢI GIÁ THAM KHẢO.
 *
 * Đây là nghiệp vụ trung tâm dùng chung (context + các trang quản lý), KHÔNG để
 * giao diện tự quyết định. Giao dịch chỉ được xét duyệt khi thỏa mọi điều kiện.
 * Dữ liệu vẫn là mô phỏng — không phải giao dịch thật.
 *
 * Phần XVI: trạng thái đơn hàng / thanh toán / giao nhận / trả hàng được tách
 * biệt và quy tắc lấy từ `orderRules.js`. Một đơn hoàn tất KHÔNG tự động đồng
 * nghĩa giao dịch đủ điều kiện công bố giá tham chiếu.
 */

import {
  CLOSED_RETURN_STATUSES,
  afterDeliveryWindowElapsed,
  deliveryClock,
  hasOpenReturn,
  isPaymentRefunded,
  isPaymentSettled,
  isRefundInProgress,
} from "./orderRules.js";

/** Các trạng thái yêu cầu hỗ trợ được coi là đã đóng (không còn chặn duyệt). */
export const CLOSED_SUPPORT_STATUS = CLOSED_RETURN_STATUSES;

/** Đơn hàng còn yêu cầu hỗ trợ/tranh chấp đang mở hay không. */
export function hasOpenSupport(order) {
  return hasOpenReturn(order);
}

/**
 * Kiểm tra một đơn hàng có đủ điều kiện sơ bộ để đưa bản ghi giao dịch vào
 * hàng đợi duyệt giá tham khảo hay không.
 *
 * Trả về { eligible: boolean, reasons: string[] }.
 * Khi không đủ điều kiện, `reasons` liệt kê lý do loại để lưu vết.
 */
export function checkReferenceEligibility(order) {
  const reasons = [];
  if (!order) {
    return { eligible: false, reasons: ["Không tìm thấy đơn hàng."] };
  }

  // 1. Hai bên đã xác nhận cùng một phiên bản đơn hàng.
  const buyerConf = (order.confirmations || []).find((c) => c.role === "buyer");
  const sellerConf = (order.confirmations || []).find((c) => c.role === "seller");
  if (!buyerConf || !sellerConf) {
    reasons.push("Hai bên chưa xác nhận đơn hàng.");
  } else if (buyerConf.version !== sellerConf.version) {
    reasons.push("Hai bên xác nhận khác phiên bản đơn hàng.");
  }

  // 2. Có bằng chứng giao hàng thành công (mô phỏng) được xác minh.
  if (!deliveryClock(order).hasProof) {
    reasons.push("Chưa có bằng chứng giao hàng thành công (mô phỏng).");
  }

  // 3. Đã hoàn tất nghiệp vụ: người mua xác nhận HOẶC đã hết 3 ngày hậu giao hàng.
  const received = !!order.receivedAt || !!order.supportExpired;
  if (!received && !afterDeliveryWindowElapsed(order)) {
    reasons.push(
      "Chưa hoàn tất: người mua chưa xác nhận nhận hàng và chưa hết thời hạn 3 ngày hậu giao hàng."
    );
  }

  // 4. Thanh toán/thu hộ đã được xác minh theo phương thức (COD phải đối soát).
  if (!isPaymentSettled(order)) {
    reasons.push(
      order.paymentMethod === "COD"
        ? "Chưa xác minh thu tiền và đối soát COD."
        : "Chưa xác minh thanh toán."
    );
  }

  // 5. Không hủy / thất bại / hoàn trả / tranh chấp / hoàn tiền.
  if (order.status === "CANCELLED" || order.status === "SELLER_REJECTED") {
    reasons.push("Đơn hàng đã bị hủy hoặc bị từ chối.");
  }
  if (order.shippingStatus === "FAILED") {
    reasons.push("Giao hàng thất bại.");
  }
  if (order.shippingStatus === "RETURNING" || order.shippingStatus === "RETURNED") {
    reasons.push("Đơn hàng đang/đã hoàn trả.");
  }
  if (isPaymentRefunded(order) || isRefundInProgress(order)) {
    reasons.push("Đơn hàng đang/đã hoàn tiền.");
  }
  if (hasOpenReturn(order)) {
    reasons.push("Còn yêu cầu hỗ trợ/tranh chấp đang mở.");
  }

  // 6. Đầy đủ thông tin model, dung lượng, tình trạng, giá.
  if (!order.phoneId || !order.negotiatedPrice) {
    reasons.push(
      "Thiếu thông tin model/dung lượng/tình trạng/giá giao dịch."
    );
  }

  return { eligible: reasons.length === 0, reasons };
}
