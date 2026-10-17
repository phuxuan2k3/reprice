/**
 * ENGINE TÍNH DẢI GIÁ THAM KHẢO — hàm THUẦN, không phụ thuộc React/giao diện.
 *
 * Bốn lớp theo đặc tả:
 *   (1) Ghi nhận        -> transaction detail (xem normalizeSeedTransaction / makeDetailFromOrder)
 *   (2) Kiểm tra chất lượng -> isDetailEligible, dedupeDetails, conditionGroupKey
 *   (3) Thống kê + độ tin cậy -> pickWindow, type7Percentile, computeReliability, buildUsedRange
 *   (4) Cung cấp cho UI -> pricingApi.js (không tính lại quy tắc ở giao diện)
 *
 * NGUYÊN TẮC:
 *  - Chỉ dùng dữ liệu đã xác minh; SIMULATED và REAL_VERIFIED KHÔNG BAO GIỜ trộn.
 *  - P10/P90 theo phương pháp nội suy Type 7; KHÔNG dùng min/max/trung bình làm dải.
 *  - Không tự đặt ngưỡng: ngưỡng chưa cấu hình => trạng thái NOT_CONFIGURED.
 *  - Toàn bộ là mô phỏng phục vụ đồ án.
 */

import { PRICING_CONFIG, isConfigured } from "./pricingConfig.js";
import {
  deliveryClock,
  hasOpenReturn,
  isPaymentRefunded,
  isPaymentSettled,
  isRefundInProgress,
} from "./orderRules.js";

/* ============================== TIỆN ÍCH ============================== */

/** Phân tích ngày từ "YYYY-MM-DD" hoặc ISO datetime. Trả null nếu không hợp lệ. */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ngày ở dạng YYYY-MM-DD. */
export function toISODate(d) {
  const x = parseDate(d);
  if (!x) return null;
  return x.toISOString().slice(0, 10);
}

/** Thời điểm `m` tháng trước `now`. */
function monthsAgo(now, m) {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - m);
  return d;
}

/**
 * Ngày `date` có nằm trong cửa sổ `m` tháng tính từ `now`?
 * Khoảng lọc là [startTime, endTime] — GIAO DỊCH ĐÚNG BIÊN ĐƯỢC TÍNH
 * (theo đặc tả). `startTime` = lùi `m` tháng; `endTime` = `now`.
 */
export function withinWindow(date, now, m) {
  const d = parseDate(date);
  if (!d) return false;
  const start = monthsAgo(now, m).getTime();
  const end = now.getTime();
  return d.getTime() >= start && d.getTime() <= end;
}

/** Số milli-giây từ a đến b (b - a). */
function elapsedMs(a, b) {
  return b.getTime() - a.getTime();
}

/**
 * PHÂN VỊ TYPE 7 (nội suy tuyến tính) trên mảng ĐÃ SẮP XẾP tăng dần.
 * rank = (n - 1) * p / 100; nội suy giữa floor và ceil.
 */
export function type7Percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const rank = (n - 1) * (p / 100);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/** Trung bình + độ lệch chuẩn tổng thể (dùng NỘI BỘ, không hiển thị). */
export function meanStd(value) {
  const a = value.filter((v) => Number.isFinite(v));
  const n = a.length;
  if (n === 0) return { mean: null, sd: null, n: 0 };
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const variance = a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * Trung bình + ĐỘ LỆCH CHUẨN MẪU (chia n-1) — dùng cho công thức Z-score
 * theo đặc tả: Z = (listingPrice - mean) / sampleStandardDeviation.
 * Khi n < 2 trả sd = 0 (không đủ mẫu để tính độ lệch chuẩn mẫu).
 */
export function sampleStats(value) {
  const a = value.filter((v) => Number.isFinite(v));
  const n = a.length;
  if (n === 0) return { mean: null, sd: null, n: 0 };
  const mean = a.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { mean, sd: 0, n };
  const variance =
    a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}

/* ======================= LỚP 1 — BẢN GHI CHI TIẾT ======================= */

/**
 * Chuẩn hoá một giao dịch seed thành BẢN GHI CHI TIẾT theo từng máy.
 * `phoneById(id)` trả về tin đăng để lấy ảnh chụp (snapshot) thông tin máy.
 */
export function normalizeSeedTransaction(tx, phoneById = () => null) {
  const phone = phoneById(tx.phoneId) || {};
  const verified = tx.verification === "VERIFIED";
  const completed = tx.status === "COMPLETED";
  const provenance = tx.source === "SIMULATED" ? "SIMULATED" : "REAL_VERIFIED";
  const priceDataStatus =
    tx.priceDataStatus ||
    (verified
      ? "VERIFIED"
      : completed
      ? "PENDING_VERIFICATION"
      : "NOT_ELIGIBLE");
  return {
    transaction_detail_id: tx.transactionDetailId || `TXD-${tx.orderId || tx.id}`,
    order_id: tx.orderId || null,
    listing_id: tx.phoneId || null,
    buyer_id: tx.buyerId || tx.buyer || null,
    seller_id: tx.sellerId || tx.seller || null,
    buyer_name: tx.buyer || null,
    seller_name: tx.seller || null,
    phone_snapshot: {
      model: phone.model ?? null,
      storage: phone.storage ?? null,
      condition: phone.condition ?? null,
      color: phone.colorName ?? null,
      batteryHealth: phone.batteryHealth ?? null,
      appearance: tx.appearance ?? null,
      functionality: tx.functionality ?? null,
      repairHistory: phone.repairHistory ?? null,
      usageMonths: phone.usageMonths ?? null,
    },
    listing_price: tx.listingPrice ?? phone.price ?? null,
    agreed_price: tx.agreedPrice ?? tx.price ?? null,
    // Giá vào dải = giá thực tế của MÁY, KHÔNG gồm phí vận chuyển.
    actual_paid_price: tx.actualPaidPrice ?? tx.price ?? null,
    shipping_fee: tx.shippingFee ?? 0,
    payment_status: tx.paymentStatus || (tx.price ? "PAID" : "UNPAID"),
    delivery_status:
      tx.deliveryStatus || (completed ? "DELIVERED" : "IN_PROGRESS"),
    after_delivery_status:
      tx.afterDeliveryStatus || (completed ? "OK" : "PENDING"),
    return_status: tx.returnStatus || "NONE",
    refund_status: tx.refundStatus || "NONE",
    dispute_status: tx.disputeStatus || "NONE",
    data_provenance: provenance,
    price_data_status: priceDataStatus,
    transaction_date: tx.date || null, // ngày giao dịch gốc (giữ nguyên)
    delivered_at: tx.deliveredAt || tx.date || null,
    eligible_at: tx.eligibleAt || null,
    created_at: tx.createdAt || tx.date || null,
    updated_at: tx.updatedAt || tx.date || null,
    cluster_id: tx.clusterId || null,
    suspicion_flags: tx.suspicionFlags || [],
    history: tx.history || [],
  };
}

/**
 * Tạo bản ghi chi tiết từ một đơn hàng THẬT trong ứng dụng (khi QTV duyệt).
 * Một đơn hiện chỉ có một máy; khi mở rộng nhiều máy, gọi hàm này cho từng máy.
 */
export function makeDetailFromOrder(order, phone, opts = {}) {
  const now = opts.now || new Date();
  const price =
    order.agreedPrice ?? order.negotiatedPrice ?? order.price ?? phone?.price ?? null;
  return {
    transaction_detail_id:
      opts.transactionDetailId || `TXD-${order.id}-${order.phoneId || "P"}`,
    order_id: order.id,
    listing_id: order.phoneId || null,
    buyer_id: order.buyerId || null,
    seller_id: order.sellerId || null,
    buyer_name: order.buyerName || null,
    seller_name: order.sellerName || null,
    phone_snapshot: {
      model: phone?.model ?? null,
      storage: phone?.storage ?? null,
      condition: phone?.condition ?? null,
      color: phone?.colorName ?? null,
      batteryHealth: phone?.batteryHealth ?? null,
      appearance: order.appearance ?? null,
      functionality: order.functionality ?? null,
      repairHistory: phone?.repairHistory ?? null,
      usageMonths: phone?.usageMonths ?? null,
    },
    listing_price: order.listingPrice ?? phone?.price ?? null,
    agreed_price: order.agreedPrice ?? order.negotiatedPrice ?? price,
    actual_paid_price: order.actualPaidPrice ?? price,
    shipping_fee: Number(order.shippingFee) || 0,
    // Chuẩn hoá cho tầng engine: chỉ quan tâm "đã xác minh thanh toán" hay chưa.
    payment_status: isPaymentSettled(order) ? "PAID" : order.paymentStatus || "UNPAID",
    delivery_status: deliveryClock(order).hasProof ? "DELIVERED" : "IN_PROGRESS",
    after_delivery_status: order.receivedAt || order.supportExpired ? "OK" : "PENDING",
    return_status:
      order.shippingStatus === "RETURNED"
        ? "RETURNED"
        : order.shippingStatus === "RETURNING"
        ? "RETURNING"
        : "NONE",
    refund_status: isPaymentRefunded(order)
      ? "REFUNDED"
      : isRefundInProgress(order)
      ? "REFUNDING"
      : "NONE",
    dispute_status: hasOpenReturn(order) ? "OPEN" : "NONE",
    data_provenance: opts.provenance || "SIMULATED",
    price_data_status: opts.priceDataStatus || "PENDING_VERIFICATION",
    transaction_date: order.receivedAt || order.deliveredAt || order.createdAt || toISODate(now),
    delivered_at: deliveryClock(order).verifiedAt || null,
    eligible_at: opts.eligibleAt || null,
    created_at: order.createdAt || toISODate(now),
    updated_at: toISODate(now),
    cluster_id: order.clusterId || null,
    suspicion_flags: [],
    history: [],
  };
}

/* ==================== LỚP 2 — KIỂM TRA CHẤT LƯỢNG ==================== */

/**
 * TRẠNG THÁI DỮ LIỆU THAM CHIẾU — TÁCH RIÊNG khỏi trạng thái nghiệp vụ đơn hàng.
 *
 *   PENDING_COMPLETION    — đã giao nhưng chưa qua đủ số ngày hậu giao hàng
 *   PENDING_VERIFICATION  — chưa đủ điều kiện xác minh (thanh toán/giao nhận/dữ liệu)
 *   ELIGIBLE              — đủ điều kiện vào tập tính giá
 *   EXCLUDED              — bị loại (trả hàng/hoàn tiền/tranh chấp…)
 *   REVOKED               — đã bị quản trị thu hồi khỏi dữ liệu tham chiếu
 *
 * KHÔNG gộp trạng thái này vào `status` của đơn hàng.
 */
export const REFERENCE_STATUS = {
  PENDING_COMPLETION: "PENDING_COMPLETION",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  ELIGIBLE: "ELIGIBLE",
  EXCLUDED: "EXCLUDED",
  REVOKED: "REVOKED",
};

/** Nhãn tiếng Việt cho từng trạng thái dữ liệu tham chiếu. */
export const REFERENCE_STATUS_LABEL = {
  PENDING_COMPLETION: "Chờ hoàn tất (3 ngày hậu giao hàng)",
  PENDING_VERIFICATION: "Chờ xác minh",
  ELIGIBLE: "Đủ điều kiện",
  EXCLUDED: "Bị loại",
  REVOKED: "Đã thu hồi",
};

/**
 * Xác định trạng thái dữ liệu tham chiếu của MỘT máy (một mã chi tiết giao dịch).
 * Trả { status, reasons }.
 */
export function referenceDataStatus(detail, now = new Date(), config = PRICING_CONFIG) {
  if (!detail) return { status: "EXCLUDED", reasons: ["Không có bản ghi giao dịch"] };

  // 1) Đã thu hồi -> REVOKED (giữ lịch sử, không xóa vật lý).
  if (detail.reference_status === "REVOKED" || detail.revoked === true) {
    return { status: "REVOKED", reasons: ["Đã thu hồi khỏi dữ liệu tham chiếu"] };
  }
  // Quyết định của quản trị (không thay đổi trạng thái đơn hàng):
  // "Cho phép sử dụng" KHÔNG được bỏ qua các điều kiện bắt buộc bên dưới.
  if (detail.review_decision === "REVOKE") {
    return { status: "REVOKED", reasons: ["Quản trị viên đã thu hồi khỏi dữ liệu tham chiếu"] };
  }
  if (detail.review_decision === "EXCLUDE") {
    return { status: "EXCLUDED", reasons: ["Quản trị viên xác định không sử dụng"] };
  }

  // 2) Trạng thái nghiệp vụ loại trừ tuyệt đối.
  const excluded = [];
  if (detail.return_status === "RETURNED" || detail.return_status === "RETURNING")
    excluded.push("Đang/đã yêu cầu trả hàng");
  if (detail.refund_status === "REFUNDED") excluded.push("Đã hoàn tiền");
  if (detail.refund_status === "REFUNDING") excluded.push("Đang xử lý hoàn tiền");
  if (detail.dispute_status && detail.dispute_status !== "NONE")
    excluded.push("Đang có tranh chấp/khiếu nại mở");
  if (
    detail.after_delivery_status &&
    detail.after_delivery_status !== "OK" &&
    detail.after_delivery_status !== "PENDING"
  )
    excluded.push("Trạng thái hậu giao hàng không hợp lệ");
  if (excluded.length) return { status: "EXCLUDED", reasons: excluded };

  // 3) Chưa hoàn tất nghiệp vụ -> chờ xác minh.
  const pending = [];
  if (detail.price_data_status !== "VERIFIED")
    pending.push("Chưa được quản lý xác minh dữ liệu");
  if (detail.payment_status !== "PAID")
    pending.push("Chưa xác minh thanh toán/thu tiền");
  if (detail.delivery_status !== "DELIVERED")
    pending.push("Chưa có bằng chứng giao nhận");
  const deliveredAt = parseDate(detail.delivered_at);
  if (!deliveredAt) pending.push("Thiếu ngày giao hàng xác minh");
  const snap = detail.phone_snapshot || {};
  if (!snap.model || !snap.storage)
    pending.push("Thiếu thông tin máy (model/dung lượng)");
  if (!(Number(detail.actual_paid_price) > 0))
    pending.push("Thiếu giá giao dịch thực tế");
  if (pending.length) return { status: "PENDING_VERIFICATION", reasons: pending };

  // 4) Đã giao nhưng chưa qua đủ số ngày hậu giao hàng -> chờ hoàn tất.
  const needMs = config.afterDeliveryDays * 24 * 60 * 60 * 1000;
  if (elapsedMs(deliveredAt, now) < needMs) {
    return {
      status: "PENDING_COMPLETION",
      reasons: [`Chưa đủ ${config.afterDeliveryDays} ngày hậu giao hàng`],
    };
  }

  // Quản trị yêu cầu tiếp tục chờ xác minh -> chưa đưa vào tập dùng.
  if (detail.review_decision === "PENDING") {
    return { status: "PENDING_VERIFICATION", reasons: ["Quản trị viên yêu cầu tiếp tục chờ xác minh"] };
  }

  return { status: "ELIGIBLE", reasons: [] };
}

/**
 * Giao dịch chi tiết có đủ điều kiện vào tập GĐ2 hay không.
 * Tương đương `referenceDataStatus(...).status === "ELIGIBLE"`.
 * Trả { eligible, status, reasons }.
 */
export function isDetailEligible(detail, now = new Date(), config = PRICING_CONFIG) {
  const s = referenceDataStatus(detail, now, config);
  return { eligible: s.status === "ELIGIBLE", status: s.status, reasons: s.reasons };
}

/**
 * Loại bỏ bản ghi trùng theo `transaction_detail_id` (KHÔNG dùng model/giá/màu
 * để làm khoá). Trả về { items, duplicates }.
 */
export function dedupeDetails(details) {
  const seen = new Set();
  const items = [];
  const duplicates = [];
  for (const d of details || []) {
    const key = d.transaction_detail_id;
    if (!key) {
      items.push(d);
      continue;
    }
    if (seen.has(key)) duplicates.push(d);
    else {
      seen.add(key);
      items.push(d);
    }
  }
  return { items, duplicates, duplicateCount: duplicates.length };
}

/** Ba tiêu chí + pin tạo thành bộ 4 tiêu chí Condition Score để ghép nhóm. */
export function conditionGroupKey(snapshot = {}) {
  const battery = Number(snapshot.batteryHealth);
  const batteryBucket = Number.isFinite(battery)
    ? `${Math.floor(battery / 5) * 5}-${Math.floor(battery / 5) * 5 + 4}%`
    : "pin-không-rõ";
  return [
    snapshot.appearance || snapshot.condition || "ngoại-hình-không-rõ",
    snapshot.functionality || "chức-năng-không-rõ",
    batteryBucket,
    snapshot.repairHistory || "sửa-chữa-không-rõ",
  ].join(" | ");
}

/** Ghép nhóm theo đúng bộ 4/4 tiêu chí Condition Score. */
export function partitionByCondition(details) {
  const map = new Map();
  for (const d of details || []) {
    const key = conditionGroupKey(d.phone_snapshot || {});
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  }
  return map;
}

/** Bản ghi thiếu tiêu chí Condition Score (chưa thể ghép nhóm). */
export function missingConditionScore(detail) {
  const s = detail.phone_snapshot || {};
  return !s.model || !s.storage || (s.appearance == null && s.condition == null);
}

/* ==================== LỚP 3 — THỐNG KÊ + ĐỘ TIN CẬY ==================== */

/** Chọn cửa sổ cuốn chiếu nhỏ nhất đạt `minTransactions`. */
export function pickWindow(eligible, now = new Date(), config = PRICING_CONFIG) {
  const tried = [];
  for (const m of config.windowsMonths) {
    const items = eligible.filter((d) => withinWindow(d.transaction_date, now, m));
    tried.push({ windowMonths: m, count: items.length });
    if (items.length >= config.minTransactions) {
      return { windowMonths: m, items, tried };
    }
  }
  const last = config.windowsMonths[config.windowsMonths.length - 1];
  const items = eligible.filter((d) => withinWindow(d.transaction_date, now, last));
  return { windowMonths: null, items, tried };
}

function countBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function maxShare(map, total) {
  let max = 0;
  for (const v of map.values()) if (v > max) max = v;
  return total ? max / total : 0;
}

/**
 * Độ tin cậy của tập dữ liệu. Ngưỡng CHƯA CẤU HÌNH => NOT_CONFIGURED.
 * Trả { status: "OK" | "WEAK" | "NOT_CONFIGURED", metrics, reasons, missingThresholds }.
 */
export function computeReliability(items, config = PRICING_CONFIG) {
  const total = items.length;
  const sellers = countBy(items, (d) => d.seller_id).size;
  const buyers = countBy(items, (d) => d.buyer_id).size;
  const bySeller = countBy(items, (d) => d.seller_id);
  const topSellerShare = maxShare(bySeller, total);

  const clustered = items.filter((d) => d.cluster_id);
  const byCluster = countBy(clustered, (d) => d.cluster_id);
  const topClusterShare = maxShare(byCluster, total);

  const metrics = {
    total,
    independentBuyers: buyers,
    independentSellers: sellers,
    topSellerShare,
    topClusterShare,
    clusteredCount: clustered.length,
  };

  const missing = [];
  const reasons = [];
  let weak = false;

  if (!isConfigured(config.maxSellerConcentration))
    missing.push("maxSellerConcentration");
  else if (topSellerShare > config.maxSellerConcentration) {
    weak = true;
    reasons.push(
      `Tập trung theo một người bán vượt ngưỡng (${Math.round(
        topSellerShare * 100
      )}% > ${Math.round(config.maxSellerConcentration * 100)}%)`
    );
  }

  if (!isConfigured(config.maxClusterConcentration))
    missing.push("maxClusterConcentration");
  else if (topClusterShare > config.maxClusterConcentration) {
    weak = true;
    reasons.push("Tập trung theo một cụm vượt ngưỡng");
  }

  if (!isConfigured(config.minIndependentBuyers))
    missing.push("minIndependentBuyers");
  else if (buyers < config.minIndependentBuyers) {
    weak = true;
    reasons.push(
      `Chưa đủ số người mua độc lập (${buyers} < ${config.minIndependentBuyers})`
    );
  }

  if (!isConfigured(config.minIndependentSellers))
    missing.push("minIndependentSellers");
  else if (sellers < config.minIndependentSellers) {
    weak = true;
    reasons.push(
      `Chưa đủ số người bán độc lập (${sellers} < ${config.minIndependentSellers})`
    );
  }

  let status;
  if (weak) status = "WEAK";
  else if (missing.length) status = "NOT_CONFIGURED";
  else status = "OK";

  return { status, metrics, reasons, missingThresholds: missing };
}

/**
 * Xây dựng dải giá máy cũ (GĐ2).
 * Trả về:
 *  - status: "NO_DATA" | "INSUFFICIENT_DATA" | "RANGE"
 *  - provenance, count, windowMonths, minTransactions, tried, dateRange, calculatedAt
 *  - lowerPrice=P10, upperPrice=P90 (chỉ khi RANGE)
 *  - reliability, prices (giá trị đã dùng)
 */
export function buildUsedRange(allDetails, opts = {}) {
  const now = opts.now || new Date();
  const config = opts.config || PRICING_CONFIG;
  const { items: unique } = dedupeDetails(allDetails || []);

  // Không bao giờ trộn hai nguồn dữ liệu. Mặc định ưu tiên REAL_VERIFIED,
  // nếu chưa có thì dùng tập SIMULATED (vẫn ghi rõ nhãn mô phỏng).
  let provenance = opts.provenance;
  let details = unique;
  if (provenance) {
    details = unique.filter((d) => d.data_provenance === provenance);
  } else {
    const real = unique.filter((d) => d.data_provenance === "REAL_VERIFIED");
    if (real.length) {
      provenance = "REAL_VERIFIED";
      details = real;
    } else {
      provenance = "SIMULATED";
      details = unique.filter((d) => d.data_provenance === "SIMULATED");
    }
  }

  const eligibleAll = details.filter((d) => isDetailEligible(d, now, config).eligible);
  // Ghép nhóm 4/4 tiêu chí Condition Score (khi có ảnh chụp để đối chiếu).
  const eligible = opts.matchSnapshot
    ? eligibleAll.filter(
        (d) =>
          conditionGroupKey(d.phone_snapshot || {}) ===
          conditionGroupKey(opts.matchSnapshot)
      )
    : eligibleAll;

  if (eligible.length === 0) {
    return {
      status: "NO_DATA",
      provenance,
      count: 0,
      minTransactions: config.minTransactions,
      tried: [],
      dateRange: null,
      calculatedAt: toISODate(now),
      reliability: computeReliability([], config),
      prices: [],
    };
  }

  const { windowMonths, items, tried } = pickWindow(eligible, now, config);
  if (!windowMonths) {
    return {
      status: "INSUFFICIENT_DATA",
      provenance,
      count: items.length,
      minTransactions: config.minTransactions,
      tried,
      dateRange: dateRangeOf(items),
      calculatedAt: toISODate(now),
      reliability: computeReliability(items, config),
      prices: [],
    };
  }

  const prices = items
    .map((d) => Number(d.actual_paid_price))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  const lowerPrice = type7Percentile(prices, config.lowerPercentile);
  const upperPrice = type7Percentile(prices, config.upperPercentile);

  return {
    status: "RANGE",
    provenance,
    lowerPrice,
    upperPrice,
    count: prices.length,
    windowMonths,
    minTransactions: config.minTransactions,
    tried,
    dateRange: dateRangeOf(items),
    calculatedAt: toISODate(now),
    reliability: computeReliability(items, config),
    prices,
  };
}

function dateRangeOf(items) {
  const ds = items
    .map((d) => parseDate(d.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!ds.length) return null;
  return { from: toISODate(ds[0]), to: toISODate(ds[ds.length - 1]) };
}

/* ==================== LỚP 4 — HỖ TRỢ GIAO DIỆN ==================== */

/**
 * So sánh giá rao với dải [P10, P90].
 * Bằng đúng P10 hoặc P90 => IN_RANGE (theo đặc tả).
 */
export function compareToRange(price, range) {
  const p = Number(price);
  if (!range || range.status !== "RANGE" || !Number.isFinite(p)) return "UNKNOWN";
  if (p < range.lowerPrice) return "BELOW_RANGE";
  if (p > range.upperPrice) return "ABOVE_RANGE";
  return "IN_RANGE";
}

/** Nhãn vị trí giá + nội dung tiếng Việt (theo đặc tả, nguyên văn). */
export const POSITION_TEXT = {
  BELOW_RANGE: "Dưới khoảng giá lịch sử",
  IN_RANGE: "Trong khoảng giá lịch sử",
  ABOVE_RANGE: "Trên khoảng giá lịch sử",
  UNKNOWN: "Chưa đủ dữ liệu để so sánh",
};

/**
 * NỘI DUNG LỜI NHẮC CHÍNH THỨC (nguyên văn theo đặc tả).
 * role: "buyer" | "seller". direction: LOW_PRICE | HIGH_PRICE.
 * KHÔNG hiển thị khi showReviewPrompt = false, KHÔNG tạo khung trống.
 */
export const REVIEW_PROMPT = {
  buyer: {
    LOW_PRICE: {
      title: "Kiểm tra thêm trước khi quyết định",
      body:
        "Hỏi rõ tình trạng máy, lỗi, phụ kiện và các điều kiện đi kèm mức giá trước khi chốt.",
    },
    HIGH_PRICE: {
      title: "Nên đối chiếu thêm trước khi thương lượng",
      body:
        "Xem lại tình trạng máy, phụ kiện, bảo hành và các quyền lợi đi kèm mức giá.",
    },
  },
  seller: {
    LOW_PRICE: {
      title: "Kiểm tra lại thông tin trước khi đăng",
      body:
        "Kiểm tra số tiền đã nhập và thông tin tình trạng máy để bảo đảm tin đăng chính xác.",
    },
    HIGH_PRICE: {
      title: "Kiểm tra lại mức giá trước khi đăng",
      body:
        "Kiểm tra lại giá nhập hoặc bổ sung thông tin giải thích sự khác biệt của máy nếu có.",
    },
  },
};

/**
 * ĐÁNH GIÁ GIÁ RAO so với dải [P10, P90]:
 *  - positionLabel      : BELOW_RANGE | IN_RANGE | ABOVE_RANGE | UNKNOWN
 *  - positionText       : nội dung tiếng Việt của nhãn
 *  - showReviewPrompt   : chỉ true khi ngoài dải VÀ Z vượt ngưỡng đã cấu hình
 *  - reviewDirection    : LOW_PRICE | HIGH_PRICE | null
 *  - promptTitle/Body   : nội dung lời nhắc (null khi không nhắc)
 *
 * Z-score chỉ dùng NỘI BỘ; KHÔNG trả Z/mean/stddev ra ngoài qua hàm này.
 * Khi zThreshold = null: vẫn gắn nhãn vị trí nhưng KHÔNG nhắc.
 */
export function evaluateListing(range, listingPrice, config = PRICING_CONFIG, role = "buyer") {
  const positionLabel = compareToRange(listingPrice, range);
  const out = {
    positionLabel,
    positionText: POSITION_TEXT[positionLabel] || POSITION_TEXT.UNKNOWN,
    showReviewPrompt: false,
    reviewDirection: null,
    promptTitle: null,
    promptBody: null,
  };
  if (!range || range.status !== "RANGE") return out;
  if (positionLabel === "IN_RANGE") return out; // trong dải: KHÔNG bao giờ nhắc
  if (!isConfigured(config.zThreshold)) return out; // chưa chốt ngưỡng -> không nhắc

  const { mean, sd } = sampleStats(range.prices || []);
  if (mean === null || !(sd > 0)) return out; // sd = 0 -> không tính Z
  const z = (Number(listingPrice) - mean) / sd;
  if (!Number.isFinite(z)) return out;

  let direction = null;
  if (positionLabel === "BELOW_RANGE" && z < -config.zThreshold) direction = "LOW_PRICE";
  if (positionLabel === "ABOVE_RANGE" && z > config.zThreshold) direction = "HIGH_PRICE";
  if (!direction) return out;

  const txt = (REVIEW_PROMPT[role] || REVIEW_PROMPT.buyer)[direction];
  return {
    ...out,
    showReviewPrompt: true,
    reviewDirection: direction,
    promptTitle: txt.title,
    promptBody: txt.body,
  };
}

/**
 * Tương thích ngược: trả { side: "LOW"|"HIGH", z, text } hoặc null.
 * Dùng NỘI BỘ cho kiểm thử; giao diện dùng `evaluateListing`.
 */
export function priceCheckPrompt(range, listingPrice, config = PRICING_CONFIG, role = "buyer") {
  if (!range || range.status !== "RANGE") return null;
  if (!isConfigured(config.zThreshold)) return null;
  const { mean, sd } = sampleStats(range.prices || []);
  if (mean === null || !(sd > 0)) return null;
  const z = (Number(listingPrice) - mean) / sd;
  if (!Number.isFinite(z)) return null;
  if (z < -config.zThreshold) {
    return { side: "LOW", z, text: REVIEW_PROMPT[role]?.LOW_PRICE.body || REVIEW_PROMPT.buyer.LOW_PRICE.body };
  }
  if (z > config.zThreshold) {
    return { side: "HIGH", z, text: REVIEW_PROMPT[role]?.HIGH_PRICE.body || REVIEW_PROMPT.buyer.HIGH_PRICE.body };
  }
  return null;
}
