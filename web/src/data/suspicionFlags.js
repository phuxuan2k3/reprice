/**
 * CỜ NGHI VẤN TỰ ĐỘNG — CHỈ gắn khi có BẰNG CHỨNG DỮ LIỆU RÕ RÀNG (theo đặc tả).
 *
 * Gắn cờ (để chuyển quản trị viên xem xét):
 *  - Thanh toán và giao nhận mâu thuẫn.
 *  - Snapshot giao dịch thiếu/mâu thuẫn với dữ liệu đã xác minh.
 *  - Cùng mã chi tiết nhưng nhiều giá/trạng thái chính thức khác nhau.
 *  - Có bằng chứng người mua và người bán cùng chủ thể kiểm soát.
 *  - Có bằng chứng cùng một máy chuyển vòng giữa các tài khoản.
 *  - Giao dịch trước đây đủ điều kiện nhưng sau đó bị trả/hoàn tiền/đổi trạng thái.
 *
 * TUYỆT ĐỐI KHÔNG gắn cờ chỉ vì: giá rất cao/rất thấp; cùng người mua hoặc cùng
 * người bán; giao dịch nhiều lần; cùng model/màu/giá; thuộc một cluster lớn.
 *
 * Gắn cờ KHÔNG đồng nghĩa giao dịch không hợp lệ: QTV xem bằng chứng rồi quyết định.
 */

export const FLAG_CODE = {
  PAYMENT_DELIVERY_CONTRADICTION: "PAYMENT_DELIVERY_CONTRADICTION",
  SNAPSHOT_MISSING_OR_INCONSISTENT: "SNAPSHOT_MISSING_OR_INCONSISTENT",
  DUPLICATE_DETAIL_CONFLICT: "DUPLICATE_DETAIL_CONFLICT",
  BUYER_SELLER_SAME_SUBJECT: "BUYER_SELLER_SAME_SUBJECT",
  DEVICE_CIRCULATION: "DEVICE_CIRCULATION",
  ELIGIBLE_THEN_RETURNED: "ELIGIBLE_THEN_RETURNED",
};

export const FLAG_LABEL = {
  PAYMENT_DELIVERY_CONTRADICTION: "Thanh toán và giao nhận mâu thuẫn",
  SNAPSHOT_MISSING_OR_INCONSISTENT: "Snapshot thiếu hoặc mâu thuẫn",
  DUPLICATE_DETAIL_CONFLICT: "Cùng mã chi tiết nhưng khác giá/trạng thái",
  BUYER_SELLER_SAME_SUBJECT: "Người mua và người bán cùng chủ thể",
  DEVICE_CIRCULATION: "Cùng máy chuyển vòng giữa các tài khoản",
  ELIGIBLE_THEN_RETURNED: "Từng đủ điều kiện rồi bị trả/hoàn tiền/đổi trạng thái",
};

const money = (v) => (v == null ? null : Number(v));

/**
 * Tính cờ nghi vấn cho MỘT bản ghi.
 * ctx.allDetails: toàn bộ bản ghi (để phát hiện trùng & chuyển vòng thiết bị).
 * Trả về mảng [{ code, label, reason }].
 */
export function computeSuspicionFlags(detail, ctx = {}) {
  const flags = [];
  if (!detail) return flags;
  const all = ctx.allDetails || [];
  const snap = detail.phone_snapshot || {};

  // 1) Thanh toán và giao nhận mâu thuẫn.
  //    - Đã giao nhưng chưa thanh toán (không phải COD).
  //    - Đã thanh toán nhưng đơn bị hủy/hoàn tiền nhưng vẫn ghi đã giao.
  const method = detail.payment_method || detail.paymentMethod || "";
  const isCod = /cod/i.test(method);
  if (detail.delivery_status === "DELIVERED" && detail.payment_status !== "PAID" && !isCod) {
    flags.push({
      code: FLAG_CODE.PAYMENT_DELIVERY_CONTRADICTION,
      label: FLAG_LABEL[FLAG_CODE.PAYMENT_DELIVERY_CONTRADICTION],
      reason: "Đã giao hàng nhưng trạng thái thanh toán không phải ĐÃ THANH TOÁN.",
    });
  }
  if (detail.payment_status === "PAID" && detail.refund_status === "REFUNDED") {
    flags.push({
      code: FLAG_CODE.PAYMENT_DELIVERY_CONTRADICTION,
      label: FLAG_LABEL[FLAG_CODE.PAYMENT_DELIVERY_CONTRADICTION],
      reason: "Vừa ghi ĐÃ THANH TOÁN vừa ghi ĐÃ HOÀN TIỀN — mâu thuẫn.",
    });
  }

  // 2) Snapshot thiếu / mâu thuẫn với dữ liệu đã xác minh.
  if (detail.price_data_status === "VERIFIED" && (!snap.model || !snap.storage)) {
    flags.push({
      code: FLAG_CODE.SNAPSHOT_MISSING_OR_INCONSISTENT,
      label: FLAG_LABEL[FLAG_CODE.SNAPSHOT_MISSING_OR_INCONSISTENT],
      reason: "Đã xác minh nhưng snapshot thiếu model/dung lượng.",
    });
  }
  if (detail.verified_snapshot) {
    const v = detail.verified_snapshot;
    if (
      (v.model && snap.model && v.model !== snap.model) ||
      (v.storage && snap.storage && v.storage !== snap.storage)
    ) {
      flags.push({
        code: FLAG_CODE.SNAPSHOT_MISSING_OR_INCONSISTENT,
        label: FLAG_LABEL[FLAG_CODE.SNAPSHOT_MISSING_OR_INCONSISTENT],
        reason: "Snapshot hiện tại khác dữ liệu đã xác minh (model/dung lượng).",
      });
    }
  }

  // 3) Cùng mã chi tiết nhưng nhiều giá/trạng thái chính thức khác nhau.
  const dupes = all.filter((d) => d.transaction_detail_id === detail.transaction_detail_id);
  if (dupes.length > 1) {
    const prices = new Set(dupes.map((d) => money(d.actual_paid_price)));
    const statuses = new Set(dupes.map((d) => d.reference_status || d.price_data_status));
    if (prices.size > 1 || statuses.size > 1) {
      flags.push({
        code: FLAG_CODE.DUPLICATE_DETAIL_CONFLICT,
        label: FLAG_LABEL[FLAG_CODE.DUPLICATE_DETAIL_CONFLICT],
        reason: "Cùng mã chi tiết giao dịch nhưng có nhiều giá hoặc trạng thái chính thức khác nhau.",
      });
    }
  }

  // 4) Người mua và người bán cùng chủ thể (bằng chứng mã tài khoản trùng).
  if (detail.buyer_id && detail.buyer_id === detail.seller_id) {
    flags.push({
      code: FLAG_CODE.BUYER_SELLER_SAME_SUBJECT,
      label: FLAG_LABEL[FLAG_CODE.BUYER_SELLER_SAME_SUBJECT],
      reason: `Người mua và người bán cùng mã tài khoản (${detail.buyer_id}).`,
    });
  }

  // 5) Cùng một máy chuyển vòng giữa các tài khoản (theo mã thiết bị đã xác minh).
  if (detail.verified_device_id) {
    const sameDevice = all.filter((d) => d.verified_device_id === detail.verified_device_id);
    const accounts = new Set();
    for (const d of sameDevice) {
      if (d.buyer_id) accounts.add(`B:${d.buyer_id}`);
      if (d.seller_id) accounts.add(`S:${d.seller_id}`);
    }
    if (accounts.size >= 3) {
      flags.push({
        code: FLAG_CODE.DEVICE_CIRCULATION,
        label: FLAG_LABEL[FLAG_CODE.DEVICE_CIRCULATION],
        reason: `Thiết bị ${detail.verified_device_id} xuất hiện ở nhiều tài khoản (${accounts.size}).`,
      });
    }
  }

  // 6) Từng đủ điều kiện nhưng sau đó bị trả/hoàn tiền/đổi trạng thái.
  const wasEligible =
    detail.eligible_at ||
    (Array.isArray(detail.history) &&
      detail.history.some((h) => h.to === "ELIGIBLE" || h.status === "ELIGIBLE"));
  const nowExcluded =
    detail.return_status === "RETURNED" ||
    detail.return_status === "RETURNING" ||
    detail.refund_status === "REFUNDED";
  if (wasEligible && nowExcluded) {
    flags.push({
      code: FLAG_CODE.ELIGIBLE_THEN_RETURNED,
      label: FLAG_LABEL[FLAG_CODE.ELIGIBLE_THEN_RETURNED],
      reason: "Giao dịch từng đủ điều kiện nhưng hiện đã trả hàng/hoàn tiền.",
    });
  }

  return flags;
}

/** Tính cờ cho toàn bộ tập; trả Map<detailId, flags[]> (chỉ giữ bản ghi có cờ). */
export function computeAllSuspicionFlags(details) {
  const map = new Map();
  for (const d of details || []) {
    const flags = computeSuspicionFlags(d, { allDetails: details });
    if (flags.length) map.set(d.transaction_detail_id, flags);
  }
  return map;
}
