/**
 * Dữ liệu đánh giá người dùng — DỮ LIỆU MÔ PHỎNG cho prototype.
 * Không phải đánh giá thật, không khẳng định giao dịch đã xác minh.
 */
export const reviews = [
  {
    id: "RV001",
    name: "Minh Anh",
    rating: 5,
    date: "2026-09-20",
    comment:
      "Tham khảo giá trước khi mua nên mặc cả tự tin hơn, mua được iPhone 12 với giá hợp lý.",
    detail:
      "Trước khi mua, tôi đã so sánh giá tham khảo của nhiều mẫu iPhone 12 trên RePrice. Nhờ có dải giá tham khảo, tôi biết mức giá đang rao cao hơn mặt bằng chung nên đã thương lượng và mua được máy với giá thấp hơn khoảng 5% so với giá rao. Người bán nhiệt tình, mô tả tình trạng máy trung thực. Đây là đánh giá mô phỏng cho prototype.",
  },
  {
    id: "RV002",
    name: "Khánh Hòa",
    rating: 5,
    date: "2026-09-15",
    comment:
      "Giao diện dễ dùng, tìm điện thoại theo khu vực rất tiện khi muốn xem máy trực tiếp.",
    detail:
      "Tôi thường lọc điện thoại theo khu vực Hà Nội để tiện gặp người bán xem máy. Thẻ sản phẩm hiển thị rõ tình trạng, dung lượng, thời gian đăng tin nên dễ theo dõi tin mới. Việc thương lượng giá trực tiếp trên hệ thống cũng gọn gàng hơn nhắn tin thông thường. Đây là đánh giá mô phỏng cho prototype.",
  },
  {
    id: "RV003",
    name: "Thu Trang",
    rating: 4,
    date: "2026-09-08",
    comment:
      "Bán Galaxy S22 khá nhanh, hai bên tự thống nhất giá, hệ thống ghi nhận rõ ràng.",
    detail:
      "Tôi đăng bán Galaxy S22 và nhận được đề nghị giá trong ngày. Hai bên thống nhất mức giá rồi tạo đơn, hệ thống ghi nhận giá thống nhất rất rõ ràng. Sẽ tốt hơn nếu có thêm nhiều người mua xem tin ở khu vực nhỏ. Đây là đánh giá mô phỏng cho prototype.",
  },
  {
    id: "RV004",
    name: "Đức Trung",
    rating: 5,
    date: "2026-08-30",
    comment:
      "Rất thích phần giá tham khảo được hình thành từ giao dịch thực tế đã hoàn tất.",
    detail:
      "Điểm tôi đánh giá cao là giá tham khảo chỉ được tính từ các giao dịch đã hoàn tất và được kiểm tra hợp lệ, không lấy giá rao bán làm dữ liệu. Đơn bị hủy hay đang khiếu nại đều bị loại khỏi tập dữ liệu, nên giá tham khảo đáng tin hơn. Đây là đánh giá mô phỏng cho prototype.",
  },
  {
    id: "RV005",
    name: "Linh Chi",
    rating: 4,
    date: "2026-08-22",
    comment:
      "Mua Xiaomi 13 đã qua sử dụng, tình trạng máy đúng như người bán mô tả.",
    detail:
      "Tôi tham khảo giá mẫu Xiaomi 13 trước, sau đó thương lượng với người bán và chốt giao dịch. Tình trạng máy khi nhận đúng như mô tả trong tin đăng: pin 92%, máy như mới. Quy trình tạo đơn và theo dõi đơn rõ ràng. Đây là đánh giá mô phỏng cho prototype.",
  },
  {
    id: "RV006",
    name: "Vũ Nam",
    rating: 5,
    date: "2026-08-15",
    comment:
      "Tìm kiếm nhanh, so sánh nhiều mẫu cùng lúc, phù hợp để tham khảo trước khi mua.",
    detail:
      "Tôi dùng RePrice để so sánh giá giữa các mẫu điện thoại cũ trước khi quyết định mua. Tìm kiếm theo tên máy, lọc hãng và tình trạng rất nhanh. Hy vọng sẽ có thêm nhiều tin đăng từ nhiều khu vực hơn. Đây là đánh giá mô phỏng cho prototype.",
  },
];

/**
 * Đánh giá người mua đã gửi sau giao dịch — DỮ LIỆU MÔ PHỎNG.
 * Hiển thị trong mục "Đánh giá từ tôi" của Tài khoản của tôi.
 */
export const buyerReviews = [
  {
    id: "MY-RV01",
    phoneId: "P006",
    productName: "Xiaomi 13",
    sellerName: "Mai Anh",
    rating: 5,
    date: "2026-08-20",
    comment:
      "Máy đúng mô tả, pin 92% như tin đăng, giao hàng nhanh.",
    detail:
      "Thương lượng với người bán qua hệ thống, hai bên thống nhất giá rồi tạo đơn. Máy nhận đúng tình trạng mô tả: pin 92%, full box. Người bán đóng gói cẩn thận. Đây là đánh giá mô phỏng cho prototype.",
  },
  {
    id: "MY-RV02",
    phoneId: "P002",
    productName: "iPhone 12",
    sellerName: "Lê Hà",
    rating: 4,
    date: "2026-09-30",
    comment:
      "Giá hợp lý, người bán nhiệt tình, chỉ mong thêm ảnh thực tế.",
    detail:
      "Mua iPhone 12 qua RePrice, giá chốt thấp hơn giá rao khoảng 5%. Người bán trả lời nhanh, mô tả trung thực về viền máy xước nhẹ. Điểm trừ nhỏ là tin chưa có ảnh thực tế chi tiết. Đây là đánh giá mô phỏng cho prototype.",
  },
];
