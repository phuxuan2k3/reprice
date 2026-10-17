/**
 * ĐƠN VỊ VẬN CHUYỂN MÔ PHỎNG cho đồ án RePrice.
 *
 * Toàn bộ trạng thái, sự kiện và mã vận đơn dưới đây là DỮ LIỆU MÔ PHỎNG phục
 * vụ demo. Dự án CHƯA tích hợp API của bất kỳ đơn vị vận chuyển thật nào.
 * Không được trình bày các thông tin này như dữ liệu vận chuyển đã xác minh.
 */

export const CARRIER_NAME = "RePrice Express (mô phỏng)";

/** Nhãn tiếng Việt của từng trạng thái vận chuyển. */
export const SHIPPING_STATUS_LABEL = {
  NOT_SHIPPED: "Chưa gửi hàng",
  PREPARING: "Chờ chuẩn bị hàng",
  AWAITING_PICKUP: "Chờ lấy hàng / chờ gửi tại điểm",
  ACCEPTED: "Đã tiếp nhận kiện hàng",
  SORTING: "Đang vận chuyển đến trung tâm phân loại",
  IN_TRANSIT: "Đang trung chuyển",
  ARRIVED_HUB: "Đã đến khu vực giao hàng",
  OUT_FOR_DELIVERY: "Đang giao cho người mua",
  DELIVERED: "Giao hàng thành công",
  FAILED: "Giao hàng thất bại",
  RETURNING: "Đang hoàn hàng về người bán",
  RETURNED: "Đã hoàn hàng về người bán",
  VOIDED: "Vận đơn đã hủy (chưa bàn giao)",
  INCIDENT: "Có sự cố vận chuyển",
};

/**
 * Các trạng thái cho thấy ĐÃ BÀN GIAO kiện hàng cho đơn vị vận chuyển
 * (tức là đơn vị vận chuyển đã TIẾP NHẬN, không chỉ "có mã vận đơn").
 * AWAITING_PICKUP (chờ lấy hàng) và PREPARING (chuẩn bị hàng) KHÔNG tính là
 * đã bàn giao — người mua vẫn có thể hủy ở các bước này.
 */
export const HANDOVER_SHIPPING_STATUSES = [
  "ACCEPTED",
  "SORTING",
  "IN_TRANSIT",
  "ARRIVED_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNING",
  "RETURNED",
];

/** Trạng thái này có nghĩa "đã bàn giao cho đơn vị vận chuyển" hay không. */
export function isHandoverStatus(status) {
  return HANDOVER_SHIPPING_STATUSES.includes(status);
}

/** Loại lý do giao hàng thất bại (mô phỏng). */
export const DELIVERY_FAILURE_KINDS = {
  REFUSED: "Người mua từ chối nhận hàng",
  UNREACHABLE: "Không liên lạc được người mua",
  WRONG_ADDRESS: "Sai địa chỉ giao hàng",
  OTHER: "Lý do khác",
};

export const DELIVERY_FAILURE_KIND_LABEL = DELIVERY_FAILURE_KINDS;

/** Bản ghi sự cố vận chuyển: KHÔNG kết luận bên nào có lỗi. */
export const SHIPPING_INCIDENT_OPTIONS = [
  "Thất lạc kiện hàng (mô phỏng)",
  "Giao nhầm người nhận (mô phỏng)",
  "Kiện hàng hư hỏng khi vận chuyển (mô phỏng)",
  "Lý do khác",
];

/**
 * Trình tự trạng thái vận chuyển hợp lệ (chỉ được tiến tới, không nhảy cóc).
 * Không bao gồm PREPARING (do người bán chủ động) và các nhánh FAILED/RETURNING.
 */
export const SHIPPING_SEQUENCE = [
  "AWAITING_PICKUP",
  "ACCEPTED",
  "SORTING",
  "IN_TRANSIT",
  "ARRIVED_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/** Hình thức bàn giao hàng cho đơn vị vận chuyển. */
export const HANDOVER_METHODS = {
  PICKUP: "Đơn vị vận chuyển đến lấy hàng tại người bán",
  DROP_OFF: "Người bán mang hàng đến điểm gửi",
};

/** Mô tả và địa điểm mô phỏng cho từng sự kiện vận chuyển. */
export const SHIPPING_EVENT_TEXT = {
  PREPARING: {
    desc: "Người bán đã xác nhận chuẩn bị hàng.",
    location: "Kho người bán (mô phỏng)",
  },
  AWAITING_PICKUP: {
    desc: "Chờ đơn vị vận chuyển đến lấy hàng hoặc chờ người bán gửi tại điểm.",
    location: "Kho người bán (mô phỏng)",
  },
  ACCEPTED: {
    desc: "Đơn vị vận chuyển mô phỏng đã tiếp nhận kiện hàng.",
    location: "Bưu cục tiếp nhận (mô phỏng)",
  },
  SORTING: {
    desc: "Kiện hàng đang được vận chuyển đến trung tâm phân loại.",
    location: "Trung tâm phân loại (mô phỏng)",
  },
  IN_TRANSIT: {
    desc: "Kiện hàng đang được trung chuyển giữa các kho.",
    location: "Tuyến trung chuyển (mô phỏng)",
  },
  ARRIVED_HUB: {
    desc: "Kiện hàng đã đến khu vực giao hàng.",
    location: "Kho giao hàng khu vực (mô phỏng)",
  },
  OUT_FOR_DELIVERY: {
    desc: "Nhân viên giao hàng đang giao kiện hàng cho người mua.",
    location: "Khu vực người mua (mô phỏng)",
  },
  DELIVERED: {
    desc: "Giao hàng thành công (mô phỏng).",
    location: "Địa chỉ người mua (mô phỏng)",
  },
  FAILED: {
    desc: "Giao hàng thất bại.",
    location: "Địa chỉ người mua (mô phỏng)",
  },
  RETURNING: {
    desc: "Đang xử lý hoàn hàng về người bán.",
    location: "Tuyến hoàn hàng (mô phỏng)",
  },
  RETURNED: {
    desc: "Kiện hàng đã được hoàn trả cho người bán.",
    location: "Kho người bán (mô phỏng)",
  },
  VOIDED: {
    desc: "Vận đơn đã hủy trước khi bàn giao cho đơn vị vận chuyển.",
    location: "Kho người bán (mô phỏng)",
  },
  INCIDENT: {
    desc: "Ghi nhận sự cố vận chuyển — chuyển sang luồng báo vấn đề/xác minh.",
    location: "Tuyến vận chuyển (mô phỏng)",
  },
};

/** Trạng thái kế tiếp trong trình tự vận chuyển, hoặc null nếu đã ở cuối. */
export function nextShippingStatus(current) {
  const i = SHIPPING_SEQUENCE.indexOf(current);
  if (i < 0 || i >= SHIPPING_SEQUENCE.length - 1) return null;
  return SHIPPING_SEQUENCE[i + 1];
}

/** Chuỗi trạng thái nhánh (không nằm trong trình tự chính). */
export const SHIPPING_BRANCH = new Set(["FAILED", "RETURNING", "RETURNED", "VOIDED", "INCIDENT"]);

let trackingCounter = 0;
/**
 * Tạo MÃ VẬN ĐƠN duy nhất cho một đơn hàng. Chỉ nên gọi MỘT LẦN cho mỗi
 * lần gửi — hàm cấp phát ở phía context còn phải kiểm tra đơn đã có mã chưa.
 */
export function makeTrackingCode(orderId) {
  trackingCounter += 1;
  const tail = String(orderId || "DH")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-6)
    .toUpperCase();
  return `RPX${Date.now().toString(36).toUpperCase()}${tail}${trackingCounter}`;
}

/** Thời gian giao dự kiến (mô phỏng): sau n ngày kể từ hôm nay. */
export function estimateDelivery(days = 3) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
