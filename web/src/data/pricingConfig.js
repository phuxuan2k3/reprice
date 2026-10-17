/**
 * CẤU HÌNH QUY TẮC GIÁ THAM KHẢO (GĐ1 = giá máy mới, GĐ2 = dải giá máy cũ).
 *
 * QUAN TRỌNG — KHÔNG TỰ ĐẶT NGƯỠNG:
 *  Nhóm chưa thống nhất một số ngưỡng nghiệp vụ. Những ngưỡng đó được để `null`
 *  và engine trả trạng thái "CHƯA CẤU HÌNH" (NOT_CONFIGURED) kèm lý do — tuyệt
 *  đối KHÔNG hard-code một con số để "cho qua". Khi nhóm chốt, chỉ cần điền số
 *  vào đây; toàn bộ engine + giao diện đọc từ cấu hình này.
 *
 *  Các giá trị ĐÃ có căn cứ theo đặc tả: số giao dịch tối thiểu (35), các cửa sổ
 *  thời gian cuốn chiếu (3/6/12 tháng), số ngày hậu giao hàng (3), phân vị P10/P90
 *  và phương pháp nội suy Type 7.
 */

export const PRICING_CONFIG = {
  /* ------------------------- GĐ2 — dải giá máy cũ ------------------------- */
  /** Số giao dịch chi tiết hợp lệ tối thiểu (theo đặc tả). */
  minTransactions: 35,
  /** Các cửa sổ thời gian cuốn chiếu (tháng), thử lần lượt 3 → 6 → 12. */
  windowsMonths: [3, 6, 12],
  /** Số ngày hậu giao hàng bắt buộc trước khi giao dịch đủ điều kiện. */
  afterDeliveryDays: 3,
  /** Cận dưới = phân vị 10, cận trên = phân vị 90. */
  lowerPercentile: 10,
  upperPercentile: 90,
  /** Phương pháp nội suy phân vị: Type 7 (đúng như đặc tả, KHÔNG đổi). */
  percentileMethod: "type7",

  /* ------------------- Ngưỡng độ tin cậy — CHƯA THỐNG NHẤT ------------------
   * Để null => engine báo NOT_CONFIGURED cho từng tiêu chí và KHÔNG kết luận
   * "đủ tin cậy". Không được điền số thay nhóm.
   */
  maxSellerConcentration: null, // tỷ lệ tối đa giao dịch của một người bán
  maxClusterConcentration: null, // tỷ lệ tối đa giao dịch của một cụm
  minIndependentBuyers: null, // số người mua độc lập tối thiểu
  minIndependentSellers: null, // số người bán độc lập tối thiểu
  maxSameClusterShare: null, // tỷ lệ tối đa giao dịch cùng một cụm

  /* ------------------------ Z-score — CHƯA THỐNG NHẤT ------------------------
   * Z-score chỉ dùng NỘI BỘ để nhắc kiểm tra, KHÔNG hiển thị ra người dùng.
   * Khi zThreshold = null: không có lời nhắc nào được kích hoạt.
   */
  zThreshold: null, // ví dụ 2.0 — chờ nhóm chốt, KHÔNG tự đặt

  /* ------------------------------ GĐ1 — giá máy mới ------------------------
   * Giá niêm yết máy mới cần được xác minh trong vòng `newPriceMaxAgeHours` giờ.
   * KHÔNG yêu cầu tối thiểu 3 nguồn (đặc tả).
   */
  newPriceMaxAgeHours: 24,
  newPriceMinSourcesForRange: 2, // cần >= 2 nguồn ĐỘC LẬP mới có "dải" (1 nguồn => SINGLE_PRICE)
};

/** Ngưỡng đã được cấu hình hay chưa (để không tự bịa giá trị). */
export function isConfigured(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Các ngưỡng còn thiếu căn cứ (để hiển thị minh bạch cho QTV/nhóm). */
export function missingThresholds(config = PRICING_CONFIG) {
  const missing = [];
  if (!isConfigured(config.zThreshold)) missing.push("Ngưỡng Z-score (zThreshold)");
  if (!isConfigured(config.maxSellerConcentration))
    missing.push("Tỷ lệ tập trung tối đa theo người bán");
  if (!isConfigured(config.maxClusterConcentration))
    missing.push("Tỷ lệ tập trung tối đa theo cụm");
  if (!isConfigured(config.minIndependentBuyers))
    missing.push("Số người mua độc lập tối thiểu");
  if (!isConfigured(config.minIndependentSellers))
    missing.push("Số người bán độc lập tối thiểu");
  return missing;
}
