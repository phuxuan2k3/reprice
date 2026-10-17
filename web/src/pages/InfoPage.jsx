import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const CONTENT = {
  "/about": {
    title: "Giới thiệu",
    sections: [
      {
        heading: "RePrice là gì?",
        body: "RePrice là nền tảng tham chiếu giá điện thoại đã qua sử dụng, kết nối người mua và người bán uy tín. Người bán đăng tin điện thoại cũ, người mua tham khảo giá và thương lượng trực tiếp trước khi giao dịch.",
      },
      {
        heading: "Giá tham khảo được hình thành thế nào?",
        body: "Dải giá máy cũ chỉ được tính từ giao dịch đã xác minh, đã thu tiền, có bằng chứng giao nhận và đã qua 3 ngày hậu giao hàng; đơn hủy, khiếu nại, trả hàng hoặc hoàn tiền đều bị loại. Dải giá dùng phân vị P10–P90 (nội suy Type 7) trong cửa sổ cuốn chiếu 3/6/12 tháng; một mẫu máy cần tối thiểu 35 giao dịch hợp lệ. Nếu chưa đủ, hệ thống hiển thị thông báo chưa đủ dữ liệu thay vì đưa ra dải giá. Giá máy mới (GĐ1) lấy từ giá niêm yết còn hàng của các cửa hàng và được xác minh trong 24 giờ.",
      },
      {
        heading: "Lưu ý",
        body: "Đây là bản demo. Toàn bộ dữ liệu trên website là dữ liệu mô phỏng, không phải dữ liệu thị trường thật.",
      },
    ],
  },
  "/guide": {
    title: "Hướng dẫn sử dụng",
    sections: [
      {
        heading: "Đối với người mua",
        body: "1. Chọn khu vực của bạn khi truy cập trang chủ để xem điện thoại gần bạn. 2. Tìm kiếm hoặc lọc điện thoại theo hãng, tình trạng, khu vực. 3. Mở chi tiết sản phẩm để xem thông tin tình trạng, pin và giá đang rao. 4. Nhấn Thương lượng để gửi đề nghị giá, hai bên thống nhất giá rồi tạo đơn. 5. Theo dõi đơn hàng trong trang chi tiết đơn.",
      },
      {
        heading: "Đối với người bán",
        body: "1. Đăng nhập với vai trò Người bán. 2. Vào Đăng bán, điền thông tin điện thoại: hãng, model, dung lượng, tình trạng, thời gian sử dụng, pin, giá và khu vực (mặc định là khu vực bạn đã chọn). 3. Quản lý tin đăng: tạm ẩn, hoạt động lại hoặc đánh dấu đã bán. 4. Trả lời đề nghị giá từ người mua để hai bên thống nhất giá.",
      },
      {
        heading: "Đối với người quản lý",
        body: "Người quản lý kiểm tra dữ liệu giao dịch: xác thực giao dịch hoàn tất, xử lý khiếu nại và theo dõi Dashboard giá tham khảo. Chỉ giao dịch hợp lệ mới được đưa vào tập tính giá tham khảo.",
      },
    ],
  },
  "/faq": {
    title: "Câu hỏi thường gặp",
    sections: [
      {
        heading: "Giá tham khảo có phải giá bắt buộc không?",
        body: "Không. Giá tham khảo chỉ mang tính gợi ý để người mua và người bán thương lượng. Giá giao dịch thực tế do hai bên tự thống nhất.",
      },
      {
        heading: "Tại sao một số mẫu máy hiển thị \"Chưa đủ dữ liệu giao dịch để tham khảo giá máy cũ\"?",
        body: "Mẫu máy đó chưa có đủ 35 giao dịch hợp lệ (đã xác minh, thu tiền, giao nhận đủ bằng chứng và qua 3 ngày hậu giao hàng) trong cửa sổ 3/6/12 tháng. Đơn bị hủy, khiếu nại, trả hàng hoặc hoàn tiền không được tính vào tập dữ liệu.",
      },
      {
        heading: "Làm sao để đổi khu vực?",
        body: "Trên trang chủ, nhấn nút Đổi trong thanh tìm kiếm để chọn lại tỉnh/thành phố. Lựa chọn của bạn được lưu lại trên trình duyệt.",
      },
      {
        heading: "Dữ liệu trên website có phải dữ liệu thật không?",
        body: "Không. Đây là bản demo, toàn bộ sản phẩm, giao dịch và đánh giá đều là dữ liệu mô phỏng.",
      },
    ],
  },
  "/terms": {
    title: "Điều khoản sử dụng",
    sections: [
      {
        heading: "Phạm vi",
        body: "Đây là bản demo phục vụ mục đích minh họa giao diện và quy trình. Các điều khoản dưới đây chỉ áp dụng cho bản demo này.",
      },
      {
        heading: "Sử dụng",
        body: "Bạn được phép duyệt, tìm kiếm và tham khảo thông tin trên website. Không sử dụng website để đăng tải thông tin sai sự thật hoặc vi phạm pháp luật.",
      },
      {
        heading: "Dữ liệu mô phỏng",
        body: "Toàn bộ sản phẩm, giá cả, giao dịch, đánh giá và thông tin liên hệ trên bản demo là dữ liệu mô phỏng, không phản ánh thực tế. Chúng tôi không bảo đảm về tính chính xác hay khả năng giao dịch của bất kỳ nội dung nào.",
      },
      {
        heading: "Thay đổi",
        body: "Chúng tôi có thể thay đổi nội dung hoặc ngừng hoạt động bản demo mà không cần thông báo trước.",
      },
    ],
  },
  "/privacy": {
    title: "Chính sách bảo mật",
    sections: [
      {
        heading: "Thông tin chúng tôi lưu",
        body: "Bản demo lưu trên trình duyệt (localStorage) tên đăng nhập, vai trò, khu vực bạn chọn, và trạng thái kịch bản demo (tin đăng, đơn hàng, thương lượng, giao dịch mô phỏng) để bạn tiếp tục đúng tiến trình khi chuyển trang hoặc mở lại phiên. Không có thông tin nào được gửi đến máy chủ vì website không có backend.",
      },
      {
        heading: "Không thu thập vị trí",
        body: "Website không sử dụng GPS và không tự nhận vị trí của bạn. Khu vực chỉ được xác định khi bạn tự chọn trong danh sách tỉnh/thành phố.",
      },
      {
        heading: "Xóa dữ liệu",
        body: "Bạn có thể xóa dữ liệu lưu trên trình duyệt (localStorage) bất cứ lúc nào qua công cụ của trình duyệt, hoặc dùng nút “Đặt lại dữ liệu demo” trên thanh demo để đưa kịch bản về trạng thái ban đầu.",
      },
    ],
  },
};

export default function InfoPage() {
  const { pathname } = useLocation();
  const content = CONTENT[pathname] || CONTENT["/about"];

  useEffect(() => {
    document.title = `${content.title} | RePrice`;
  }, [content.title]);

  return (
    <div className="container-x max-w-3xl py-10">
      <nav className="text-sm text-ink-400">
        <Link to="/" className="hover:text-brand-600 hover:underline">
          Trang chủ
        </Link>
        <span className="mx-2" aria-hidden>/</span>
        <span className="text-ink-700">{content.title}</span>
      </nav>
      <h1 className="mt-3 text-3xl font-extrabold text-ink-900">
        {content.title}
      </h1>

      <div className="mt-6 space-y-6">
        {content.sections.map((s) => (
          <div key={s.heading} className="card p-6">
            <h2 className="text-lg font-bold text-ink-900">
              {s.heading}
            </h2>
            <p className="mt-2 leading-relaxed text-ink-500">
              {s.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Quay lại Trang chủ
        </Link>
      </div>
    </div>
  );
}
