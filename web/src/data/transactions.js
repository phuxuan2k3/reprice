/**
 * Dữ liệu mô phỏng lịch sử giao dịch.
 *
 * QUY TẮC QUAN TRỊ (luồng dữ liệu tham khảo):
 *  - Chỉ giao dịch có status "COMPLETED" VÀ verification "VERIFIED"
 *    mới được đưa vào tập dữ liệu tính giá tham khảo.
 *  - Đơn bị hủy (CANCELLED) -> KHÔNG được đưa vào.
 *  - Giao dịch đang khiếu nại / hoàn trả (DISPUTED / RETURNED) -> chưa hợp lệ.
 *  - Giao dịch mới hoàn tất (PENDING) -> chờ quản lý kiểm tra.
 *  - Các bản ghi dưới đây được lớp engine (src/data/pricingEngine.js) xử lý:
 *    cần TỐI THIỂU 35 giao dịch hợp lệ trong cửa sổ cuốn chiếu 3/6/12 tháng mới
 *    có dải giá P10–P90; chưa đủ -> "Chưa đủ dữ liệu giao dịch để tham khảo giá
 *    máy cũ." (khối lượng mô phỏng bổ sung cho demo nằm ở demoVolume.js).
 *
 * Toàn bộ dữ liệu dưới đây là SIMULATED, không phải dữ liệu giao dịch thật.
 */

const T = (
  id,
  orderId,
  phoneId,
  buyer,
  seller,
  price,
  date,
  status,
  verification,
  note
) => ({
  id,
  orderId,
  phoneId,
  buyer,
  seller,
  price,
  date,
  status,
  verification,
  source: "SIMULATED",
  note,
});

export const transactions = [
  // ---- iPhone 13 128GB (P001): 5 giao dịch hợp lệ (dữ liệu seed) ----
  // Khối lượng mô phỏng bổ sung cho demo (demoVolume.js) giúp đạt ngưỡng 35.
  T("T0001", "DH-OLD-101", "P001", "Minh An", "Trần Minh", 8900000, "2026-03-14", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0002", "DH-OLD-102", "P001", "Lan Phạm", "Trần Minh", 9200000, "2026-05-02", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0003", "DH-OLD-103", "P001", "Đức Nguyễn", "Trần Minh", 9450000, "2026-06-21", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0004", "DH-OLD-104", "P001", "Hương Lê", "Trần Minh", 9900000, "2026-07-30", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0005", "DH-OLD-105", "P001", "Bảo Khang", "Trần Minh", 10100000, "2026-08-18", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  // 1 giao dịch mới hoàn tất, đang chờ kiểm tra (chưa được tính vào tham khảo)
  T("T0006", "DH-OLD-106", "P001", "Thu Trang", "Trần Minh", 9250000, "2026-09-30", "COMPLETED", "PENDING", "Giao dịch hoàn tất trên hệ thống, đang chờ kiểm tra dữ liệu."),

  // ---- iPhone 12 128GB (P002): 4 giao dịch hợp lệ ----
  T("T0007", "DH-OLD-107", "P002", "Văn Tuấn", "Lê Hà", 6400000, "2026-02-11", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0008", "DH-OLD-108", "P002", "Ngọc Mai", "Lê Hà", 6800000, "2026-04-05", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0009", "DH-OLD-109", "P002", "Quang Huy", "Lê Hà", 7100000, "2026-06-27", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0010", "DH-OLD-110", "P002", "Phương Thảo", "Lê Hà", 7900000, "2026-08-09", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  // 1 đơn bị hủy -> không đưa vào tập tham khảo
  T("T0011", "DH-OLD-111", "P002", "Anh Tuấn", "Lê Hà", 6600000, "2026-09-02", "CANCELLED", "NONE", "Đơn hàng bị hủy — không được đưa vào tập dữ liệu tham khảo."),

  // ---- iPhone 14 128GB (P003): 3 giao dịch hợp lệ ----
  T("T0012", "DH-OLD-112", "P003", "Minh Đức", "Phạm Quân", 11300000, "2026-04-19", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0013", "DH-OLD-113", "P003", "Thu Hà", "Phạm Quân", 12100000, "2026-06-08", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0014", "DH-OLD-114", "P003", "Hùng Vương", "Phạm Quân", 12900000, "2026-08-25", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  // 1 giao dịch hoàn trả -> chưa hợp lệ
  T("T0015", "DH-OLD-115", "P003", "Ngọc Trinh", "Phạm Quân", 11800000, "2026-09-12", "COMPLETED", "RETURNED", "Khiếu nại kết thúc: giao dịch hoàn trả — không đưa vào tập tham khảo."),

  // ---- Samsung Galaxy S23 256GB (P004): 4 giao dịch hợp lệ ----
  T("T0016", "DH-OLD-116", "P004", "Đăng Khoa", "Hoàng Vy", 12900000, "2026-03-22", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0017", "DH-OLD-117", "P004", "Linh Chi", "Hoàng Vy", 13500000, "2026-05-17", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0018", "DH-OLD-118", "P004", "Vũ Hoàng", "Hoàng Vy", 13900000, "2026-07-04", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0019", "DH-OLD-119", "P004", "Thảo Nguyên", "Hoàng Vy", 14500000, "2026-09-01", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  // 1 giao dịch đang khiếu nại -> chưa được tính
  T("T0020", "DH-OLD-120", "P004", "Tuấn Kiệt", "Hoàng Vy", 13200000, "2026-09-28", "COMPLETED", "DISPUTED", "Đang trong khiếu nại/hoàn trả — chưa được đưa vào tập tham khảo."),

  // ---- Samsung Galaxy S22 128GB (P005): 3 giao dịch hợp lệ ----
  T("T0021", "DH-OLD-121", "P005", "Anh Quốc", "Nguyễn Tân", 8600000, "2026-04-28", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0022", "DH-OLD-122", "P005", "Hồng Nhung", "Nguyễn Tân", 9300000, "2026-06-30", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0023", "DH-OLD-123", "P005", "Khang Nguyễn", "Nguyễn Tân", 10000000, "2026-08-16", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),

  // ---- Xiaomi 13 256GB (P006): 4 giao dịch hợp lệ ----
  T("T0024", "DH-OLD-124", "P006", "Trần Nghĩa", "Mai Anh", 9700000, "2026-03-08", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0025", "DH-OLD-125", "P006", "Lê Khanh", "Mai Anh", 10200000, "2026-05-24", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0026", "DH-OLD-126", "P006", "Minh Tú", "Mai Anh", 10600000, "2026-07-15", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0027", "DH-OLD-127", "P006", "Đức Anh", "Mai Anh", 11100000, "2026-09-10", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),

  // ---- OPPO Reno 10 256GB (P007): chỉ 1 hợp lệ + 1 đang chờ -> CHƯA ĐỦ DỮ LIỆU ----
  T("T0028", "DH-OLD-128", "P007", "Hà Vy", "Thanh Hải", 7200000, "2026-08-05", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0029", "DH-OLD-129", "P007", "Nam Khánh", "Thanh Hải", 7450000, "2026-09-29", "COMPLETED", "PENDING", "Giao dịch hoàn tất trên hệ thống, đang chờ kiểm tra dữ liệu."),

  // ---- Samsung Galaxy A54 128GB (P008): 3 giao dịch hợp lệ ----
  T("T0030", "DH-OLD-130", "P008", "Thái Hòa", "Phạm Quân", 5100000, "2026-04-11", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0031", "DH-OLD-131", "P008", "Uyên Phương", "Phạm Quân", 5500000, "2026-06-19", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0032", "DH-OLD-132", "P008", "Gia Huy", "Phạm Quân", 6100000, "2026-08-29", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),

  // ---- iPhone 11 128GB (P009): 3 giao dịch hợp lệ ----
  T("T0033", "DH-OLD-133", "P009", "Hoàng Nam", "Lê Hà", 4000000, "2026-03-18", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0034", "DH-OLD-134", "P009", "Trúc Lam", "Lê Hà", 4400000, "2026-06-02", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
  T("T0035", "DH-OLD-135", "P009", "Phúc An", "Lê Hà", 5000000, "2026-08-22", "COMPLETED", "VERIFIED", "Giao dịch hoàn tất, dữ liệu hợp lệ."),
];

/** Giao dịch được phép tính vào tập giá tham khảo. */
export function isValidReference(tx) {
  return tx.status === "COMPLETED" && tx.verification === "VERIFIED";
}
