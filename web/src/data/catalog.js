/**
 * Danh mục điện thoại — suy diễn từ danh sách tin đăng hiện có.
 * Không tự bịa model/dung lượng/màu ngoài dữ liệu có thật.
 */

/** Các hãng hiển thị trong quy trình đăng bán (vivo chưa có tin trong danh mục). */
export const CATALOG_BRANDS = [
  "Apple",
  "Samsung",
  "Xiaomi",
  "OPPO",
  "vivo",
];

/** Model thuộc hãng (từ tin đăng có sẵn). */
export function getModelsByBrand(listings, brand) {
  return [
    ...new Set(
      listings
        .filter((p) => p.brand === brand && p.model)
        .map((p) => p.model)
    ),
  ];
}

/** Dung lượng hợp lệ theo hãng + model. */
export function getStoragesForModel(listings, brand, model) {
  return [
    ...new Set(
      listings
        .filter((p) => p.brand === brand && p.model === model && p.storage)
        .map((p) => p.storage)
    ),
  ];
}

/**
 * Bộ màu chọn nhanh khi đăng bán. Ngoài các màu này, quy trình còn cho chọn
 * "Không rõ" và "Khác" (kèm ô nhập tên màu thực tế).
 */
export const STANDARD_COLORS = ["Đen", "Trắng", "Vàng gold", "Xanh dương"];

/** Màu hợp lệ theo hãng + model (từ colorName có sẵn). */
export function getColorsForModel(listings, brand, model) {
  return [
    ...new Set(
      listings
        .filter(
          (p) => p.brand === brand && p.model === model && p.colorName
        )
        .map((p) => p.colorName)
    ),
  ];
}

/** Model có trong danh mục chưa? */
export function modelExistsInCatalog(listings, brand, model) {
  return listings.some((p) => p.brand === brand && p.model === model);
}

/**
 * RAM: danh mục hiện tại KHÔNG có dữ liệu RAM theo model/dung lượng,
 * nên không thể tự xác định RAM — quy trình sẽ hỏi và cho phép "Không rõ".
 */
export const RAM_KNOWN_IN_CATALOG = false;

/** Mức RAM vật lý gợi ý (chỉ dùng khi người bán tự khai, không phải dữ liệu danh mục). */
export const RAM_OPTIONS = ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"];

/** Các mức ngoại hình. */
export const APPEARANCE_LEVELS = [
  {
    key: "Xuất sắc",
    desc: "Như mới, không thấy trầy xước, không móp, nứt hoặc vỡ.",
  },
  {
    key: "Tốt",
    desc: "Có vài vết xước nhẹ, khó thấy khi nhìn thông thường; không móp, nứt hoặc vỡ.",
  },
  {
    key: "Trung bình",
    desc: "Có nhiều vết xước hoặc vết xước rõ, có thể móp nhẹ; không nứt, vỡ hay biến dạng rõ.",
  },
  {
    key: "Kém",
    desc: "Có vết xước sâu, bong tróc nhiều, móp rõ, biến dạng hoặc nứt/vỡ.",
  },
];

/** Các chức năng có thể khai lỗi. */
export function getErrorOptions() {
  return [
    "Màn hình",
    "Cảm ứng",
    "Camera",
    "Loa",
    "Mic",
    "Nút bấm",
    "Sạc",
    "Wi-Fi",
    "Bluetooth",
    "SIM/sóng",
    "Vân tay",
    "Nhận diện khuôn mặt",
    "Rung",
    "Nguồn/hoạt động",
    "Lỗi khác",
  ];
}

/** Phụ kiện tặng kèm. */
export const ACCESSORY_OPTIONS = [
  "Hộp",
  "Củ sạc",
  "Cáp sạc",
  "Tai nghe",
  "Ốp lưng",
  "Khác",
  "Không có",
];

/** Các tỉnh/thành — từ dữ liệu REGIONS hiện có. */
export { REGIONS } from "./phones";
