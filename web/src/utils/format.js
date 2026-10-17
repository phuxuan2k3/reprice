/** Định dạng tiền Việt Nam: 9.200.000 ₫ */
export function formatVND(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Chỉ số: 9.200.000 */
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("vi-VN").format(value);
}

/**
 * Múi giờ Việt Nam — cố định để mọi mốc thời gian (kể cả hạn 72 giờ) hiển thị
 * nhất quán, không phụ thuộc múi giờ của thiết bị đang mở.
 */
export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Ngày ISO "2026-08-14" -> "14/08/2026" (theo giờ Việt Nam). */
export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TIMEZONE,
  });
}

/** Ngày + giờ ISO -> "14/08/2026 21:30" (theo giờ Việt Nam). */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: VN_TIMEZONE,
  });
}

/** Phần trăm chênh lệch so với giá tham khảo */
export function deltaPercent(price, reference) {
  if (!reference) return null;
  return Math.round(((price - reference) / reference) * 100);
}

/**
 * Tên hiển thị đầy đủ của điện thoại: "Apple iPhone 13".
 * Nếu model đã bắt đầu bằng tên hãng (VD: hãng "Xiaomi", model "Xiaomi 14")
 * thì chỉ trả về model để tránh lặp "Xiaomi Xiaomi 14".
 */
export function phoneName(phone) {
  if (!phone) return "—";
  const brand = (phone.brand || "").trim();
  const model = (phone.model || "").trim();
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) {
    return model;
  }
  return `${brand} ${model}`.trim();
}

/**
 * Chuẩn hóa số tháng sử dụng: số nguyên không âm.
 * Trả về null nếu không hợp lệ.
 */
export function normalizeMonths(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const m = Math.trunc(n);
  if (m < 0) return null;
  return m;
}

/**
 * Hiển thị thời gian sử dụng từ TỔNG SỐ THÁNG theo cách đọc tự nhiên.
 *  - 8  -> "8 tháng"
 *  - 12 -> "1 năm"
 *  - 16 -> "1 năm 4 tháng"
 *  - 29 -> "2 năm 5 tháng"
 *  - 0/không hợp lệ -> "Chưa rõ"
 * Bỏ thành phần bằng 0 để tránh "0 năm 8 tháng" hay "2 năm 0 tháng".
 */
export function formatUsageMonths(totalMonths) {
  const m = normalizeMonths(totalMonths);
  if (m === null || m <= 0) return "Chưa rõ";
  const years = Math.floor(m / 12);
  const months = m % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} năm`);
  if (months > 0) parts.push(`${months} tháng`);
  return parts.join(" ");
}

/**
 * Đọc ngược chuỗi thời gian sử dụng cũ ("14 tháng", "1 năm 4 tháng") -> tổng số tháng.
 * Dùng để bảo đảm tương thích với dữ liệu cũ đang lưu dạng chuỗi.
 */
export function parseUsageMonths(usageTime) {
  if (!usageTime || typeof usageTime !== "string") return null;
  const s = usageTime.trim().toLowerCase();
  if (!s || s.includes("chưa rõ")) return null;
  const y = s.match(/(\d+)\s*năm/);
  const mo = s.match(/(\d+)\s*tháng/);
  if (!y && !mo) {
    const plain = s.match(/^(\d+)$/);
    return plain ? parseInt(plain[1], 10) : null;
  }
  return (y ? parseInt(y[1], 10) * 12 : 0) + (mo ? parseInt(mo[1], 10) : 0);
}

/**
 * Hiển thị thời gian sử dụng của một máy.
 * Ưu tiên trường chuẩn `usageMonths`; nếu chưa có thì phân tích `usageTime` cũ.
 */
export function phoneUsage(phone) {
  if (!phone) return "Chưa rõ";
  if (phone.usageMonths !== null && phone.usageMonths !== undefined && phone.usageMonths !== "") {
    return formatUsageMonths(phone.usageMonths);
  }
  const parsed = parseUsageMonths(phone.usageTime);
  if (parsed !== null) return formatUsageMonths(parsed);
  return phone.usageTime || "Chưa rõ";
}

/** Thời gian đăng tin tương đối: "vừa đăng", "2 giờ trước", "1 ngày trước"... */
export function formatAgo(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "";
  if (minutes < 1) return "Vừa đăng";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  return `${months} tháng trước`;
}
