/**
 * LƯU TRỮ KỊCH BẢN DEMO — RePrice (localStorage).
 *
 * Lưu trạng thái nghiệp vụ MÔ PHỎNG (người dùng đang đăng nhập, tin đăng, đơn
 * hàng, thương lượng, giao dịch) vào localStorage để kịch bản demo giữ được
 * tiến trình khi chuyển trang, chuyển vai trò hoặc tải lại phiên trình duyệt.
 *
 * LƯU Ý QUAN TRỌNG:
 *  - Đây KHÔNG phải backend/cơ sở dữ liệu. Dữ liệu chỉ nằm trên trình duyệt.
 *  - Toàn bộ dữ liệu là MÔ PHỎNG phục vụ đồ án — không phải giao dịch thật.
 *  - `schemaVersion` dùng để tránh nạp dữ liệu cũ sai cấu trúc: nếu phiên bản
 *    không khớp, snapshot cũ bị BỎ QUA (không ghi đè dữ liệu mới) và ứng dụng
 *    quay về dữ liệu mẫu.
 *  - Mọi thao tác đọc/ghi đều bọc try/catch để an toàn với chế độ riêng tư
 *    hoặc khi hết dung lượng.
 */

export const DEMO_STATE_KEY = "reprice_demo_state_v1";
export const DEMO_STATE_VERSION = 1;

/** localStorage khả dụng hay không (chế độ riêng tư có thể chặn). */
function safeStorage() {
  try {
    const s = window.localStorage;
    const probe = "__reprice_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Đọc snapshot kịch bản demo đã lưu.
 * Trả về object đã lưu (có `schemaVersion`) hoặc null nếu không có/không hợp lệ.
 */
export function loadDemoState() {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(DEMO_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== DEMO_STATE_VERSION) {
      // Dữ liệu cũ khác phiên bản: loại bỏ để không ghi đè trạng thái mới.
      s.removeItem(DEMO_STATE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      s.removeItem(DEMO_STATE_KEY);
    } catch {
      /* bỏ qua */
    }
    return null;
  }
}

/** Lưu snapshot kịch bản demo. Bỏ qua an toàn nếu không ghi được. */
export function saveDemoState(state) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(
      DEMO_STATE_KEY,
      JSON.stringify({
        schemaVersion: DEMO_STATE_VERSION,
        savedAt: new Date().toISOString(),
        ...state,
      })
    );
  } catch {
    /* hết dung lượng hoặc bị chặn — bỏ qua, không làm hỏng ứng dụng */
  }
}

/** Xóa snapshot kịch bản demo. */
export function clearDemoState() {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(DEMO_STATE_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** Có snapshot hợp lệ đang được lưu hay không. */
export function hasDemoState() {
  return loadDemoState() !== null;
}
