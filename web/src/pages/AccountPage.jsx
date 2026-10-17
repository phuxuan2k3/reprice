import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import StatusBadge, {
  ConditionBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  ShippingStatusBadge,
} from "../components/StatusBadge";
import { buyerReviews } from "../data/reviews";
import { formatAgo, formatDate, formatVND, phoneName } from "../utils/format";

const MENU = [
  { key: "overview", label: "Tổng quan" },
  { key: "favorites", label: "Yêu thích" },
  { key: "reviews", label: "Đánh giá từ tôi" },
  { key: "orders", label: "Lịch sử giao dịch" },
  { key: "settings", label: "Cài đặt tài khoản" },
  { key: "help", label: "Trợ giúp" },
  { key: "feedback", label: "Đóng góp ý kiến" },
];

const ORDER_STATUS_FILTERS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "PENDING_BUYER", label: "Chờ tôi xác nhận" },
  { value: "PENDING_SELLER", label: "Chờ người bán xác nhận" },
  { value: "CONFIRMED", label: "Hai bên đã xác nhận" },
  { value: "SHIPPING", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "COMPLETED", label: "Đã nhận hàng" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "SELLER_REJECTED", label: "Bị từ chối" },
  { value: "REFUNDED", label: "Hoàn tiền" },
];

export default function AccountPage() {
  const {
    user,
    logout,
    updateProfile,
    favorites,
    removeFavorite,
    getPhone,
    orders,
    userReviews,
    showToast,
  } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");

  /* Cài đặt */
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.account || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [settingsSaved, setSettingsSaved] = useState(false);

  /* Đóng góp ý kiến */
  const [topic, setTopic] = useState("Góp ý giao diện");
  const [content, setContent] = useState("");

  /* Lọc trạng thái đơn */
  const [statusFilter, setStatusFilter] = useState("");

  if (!user) {
    return (
      <Navigate
        to="/login?message=login-required&next=%2Faccount"
        replace
      />
    );
  }

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");
  const displayEmail = isEmail(user.account) ? user.account : "—";
  const displayPhone = isEmail(user.account) ? user.phone || "—" : user.account || user.phone || "—";

  const favoritePhones = useMemo(
    () =>
      favorites
        .map((id) => getPhone(id))
        .filter(Boolean),
    [favorites, getPhone]
  );

  const myOrders = useMemo(
    () =>
      orders
        .filter((o) => o.buyerId === user.id)
        .filter((o) => !statusFilter || o.status === statusFilter),
    [orders, user.id, statusFilter]
  );

  /* Đánh giá của tôi: đánh giá mới gửi + đánh giá mẫu */
  const myReviews = useMemo(
    () => [...userReviews, ...buyerReviews],
    [userReviews]
  );

  const onSaveSettings = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Vui lòng nhập họ tên.", "error");
      return;
    }
    updateProfile({
      name: name.trim(),
      account: email.trim() || user.account,
      phone: phone.trim() || user.phone,
      address: address.trim() || user.address,
    });
    setSettingsSaved(true);
    showToast("Đã lưu thông tin tài khoản.");
  };

  const onSendFeedback = (e) => {
    e.preventDefault();
    if (!content.trim()) {
      showToast("Vui lòng nhập nội dung đóng góp.", "error");
      return;
    }
    setContent("");
    showToast("Cảm ơn ý kiến đóng góp của bạn.");
  };

  const onLogout = () => {
    logout();
    showToast("Đã đăng xuất. Hẹn gặp lại bạn.");
    navigate("/");
  };

  const sidebar = (
    <nav className="flex flex-col gap-1" aria-label="Menu tài khoản">
      {MENU.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setTab(item.key)}
          className={`rounded-lg px-4 py-2.5 text-left text-sm font-medium transition ${
            tab === item.key
              ? "bg-brand-50 text-brand-600"
              : "text-ink-700 hover:bg-gray-100"
          }`}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onLogout}
        className="mt-2 rounded-lg px-4 py-2.5 text-left text-sm font-medium text-ink-500 transition hover:bg-gray-100"
      >
        Đăng xuất
      </button>
    </nav>
  );

  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-bold text-ink-900 md:text-3xl">
        Tài khoản của tôi
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        Quản lý thông tin, yêu thích, đánh giá và lịch sử giao dịch.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar desktop */}
        <aside className="hidden lg:block">
          <div className="card p-4">{sidebar}</div>
        </aside>

        {/* Tab mobile */}
        <div className="lg:hidden">
          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex min-w-max gap-1.5">
              {MENU.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                    tab === item.key
                      ? "border-brand-500 bg-brand-50 text-brand-600"
                      : "border-gray-200 bg-white text-ink-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Nội dung */}
        <div className="min-w-0">
          {/* ---------------- TỔNG QUAN ---------------- */}
          {tab === "overview" && (
            <div className="card p-6">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-600">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-ink-900">
                      {user.name}
                    </h2>
                    <StatusBadge tone="blue">
                      {user.role === "buyer"
                        ? "Người mua"
                        : user.role === "seller"
                          ? "Người bán"
                          : "Người quản lý"}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    Tài khoản demo — dữ liệu mô phỏng
                  </p>
                </div>
              </div>
              <dl className="mt-6 divide-y divide-gray-100">
                {[
                  ["Họ tên", user.name],
                  ["Email", displayEmail],
                  ["Số điện thoại", displayPhone],
                  ["Khu vực", user.address],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 py-3.5"
                  >
                    <dt className="text-sm text-ink-500">{label}</dt>
                    <dd className="text-right text-sm font-medium text-ink-900">
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <Button variant="outline" onClick={() => setTab("settings")}>
                  Chỉnh sửa thông tin
                </Button>
              </div>
            </div>
          )}

          {/* ---------------- YÊU THÍCH ---------------- */}
          {tab === "favorites" && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink-900">
                  Sản phẩm yêu thích
                </h2>
                <span className="text-sm text-ink-500">
                  {favoritePhones.length} sản phẩm
                </span>
              </div>
              {favoritePhones.length === 0 ? (
                <div className="card mt-4 p-8 text-center">
                  <p className="text-sm text-ink-500">
                    Bạn chưa có sản phẩm yêu thích.
                  </p>
                  <Link
                    to="/phones"
                    className="mt-3 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                  >
                    Tìm điện thoại ngay
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {favoritePhones.map((p) => (
                    <li
                      key={p.id}
                      className="card flex flex-wrap items-center gap-4 p-4"
                    >
                      <Link
                        to={`/phones/${p.id}`}
                        className="shrink-0 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100"
                      >
                        <PhoneImage phone={p} className="h-24 w-auto" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/phones/${p.id}`}
                          className="font-semibold text-ink-900 hover:text-brand-600"
                        >
                          {phoneName(p)}{" "}
                          <span className="text-ink-500">{p.storage}</span>
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-brand-600">
                            {formatVND(p.price)}
                          </span>
                          <ConditionBadge condition={p.condition} />
                        </div>
                        <div className="mt-0.5 text-xs text-ink-500">
                          {p.region} · Đăng {formatAgo(p.listedMinutesAgo)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/phones/${p.id}`}>
                          <Button variant="outline" size="sm">
                            Xem chi tiết
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            removeFavorite(p.id);
                            showToast("Đã xóa khỏi sản phẩm yêu thích.");
                          }}
                        >
                          Xóa khỏi yêu thích
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ---------------- ĐÁNH GIÁ TỪ TÔI ---------------- */}
          {tab === "reviews" && (
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-ink-900">
                  Đánh giá của bạn
                </h2>
                <DataBadge />
              </div>
              {myReviews.length === 0 ? (
                <div className="card mt-4 p-8 text-center">
                  <p className="text-sm text-ink-500">
                    Bạn chưa thực hiện đánh giá nào.
                  </p>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {myReviews.map((review) => (
                    <li key={review.id} className="card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-ink-900">
                            {review.productName}
                          </span>
                          <span className="mx-2 text-ink-400">·</span>
                          <span className="text-sm text-ink-500">
                            Người bán: {review.sellerName}
                          </span>
                        </div>
                        <span className="text-xs text-ink-500">
                          {formatDate(review.date)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, i) => (
                          <svg
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.rating
                                ? "text-amber-400"
                                : "text-gray-300"
                            }`}
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        ))}
                        <span className="ml-1 text-xs font-medium text-ink-500">
                          {review.rating}/5
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-ink-700">
                        {review.comment}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ---------------- LỊCH SỬ GIAO DỊCH ---------------- */}
          {tab === "orders" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink-900">
                  Lịch sử giao dịch
                </h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Lọc theo trạng thái"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-ink-700"
                >
                  {ORDER_STATUS_FILTERS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {myOrders.length === 0 ? (
                <div className="card mt-4 p-8 text-center">
                  <p className="text-sm text-ink-500">
                    {statusFilter
                      ? "Không có đơn hàng nào với trạng thái này."
                      : "Bạn chưa có giao dịch nào."}
                  </p>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {myOrders.map((order) => {
                    const p = getPhone(order.phoneId);
                    return (
                      <li
                        key={order.id}
                        className="card flex flex-wrap items-center gap-4 p-4"
                      >
                        {p && (
                          <div className="shrink-0 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
                            <PhoneImage phone={p} className="h-20 w-auto" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink-900">
                              {order.id}
                            </span>
                            <OrderStatusBadge status={order.status} />
                            <ShippingStatusBadge status={order.shippingStatus} />
                            <PaymentStatusBadge status={order.paymentStatus} />
                          </div>
                          <div className="mt-1 text-sm text-ink-700">
                            {p ? phoneName(p) : order.phoneId} · Người bán:{" "}
                            {order.sellerName}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-500">
                            Giá thống nhất:{" "}
                            <span className="font-semibold text-brand-600">
                              {formatVND(order.negotiatedPrice ?? order.price)}
                            </span>{" "}
                            · Tạo ngày {formatDate(order.createdAt)}
                            {order.trackingCode ? ` · Vận đơn ${order.trackingCode}` : ""}
                          </div>
                        </div>
                        <Link to={`/orders/${order.id}`}>
                          <Button variant="outline" size="sm">
                            Xem chi tiết đơn
                          </Button>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ---------------- CÀI ĐẶT TÀI KHOẢN ---------------- */}
          {tab === "settings" && (
            <form onSubmit={onSaveSettings} className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">
                Cài đặt tài khoản
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Thay đổi thông tin hiển thị (mô phỏng, không gửi server).
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="acc-name">
                    Họ tên
                  </label>
                  <input
                    id="acc-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="acc-email">
                    Email
                  </label>
                  <input
                    id="acc-email"
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="acc-phone">
                    Số điện thoại
                  </label>
                  <input
                    id="acc-phone"
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="acc-address">
                    Khu vực
                  </label>
                  <input
                    id="acc-address"
                    className="input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Button type="submit">Lưu thay đổi</Button>
                {settingsSaved && (
                  <span className="text-sm font-medium text-emerald-600">
                    Đã lưu
                  </span>
                )}
              </div>
            </form>
          )}

          {/* ---------------- TRỢ GIÚP ---------------- */}
          {tab === "help" && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">Trợ giúp</h2>
              <p className="mt-1 text-sm text-ink-500">
                Các câu hỏi thường gặp và cách liên hệ hỗ trợ.
              </p>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    to="/faq"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    Câu hỏi thường gặp (FAQ)
                  </Link>
                </li>
                <li>
                  <Link
                    to="/guide"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    Hướng dẫn mua bán trên RePrice
                  </Link>
                </li>
              </ul>
              <div className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-ink-700">
                <div className="font-semibold text-ink-900">
                  Liên hệ hỗ trợ
                </div>
                <div className="mt-1">Hotline: 0777 689 320</div>
                <div>Email: nguyen123thuong1401@gmail.com</div>
                <div>
                  Địa chỉ: 56 Hoàng Diệu 2, Thủ Đức, TP. Hồ Chí Minh
                </div>
              </div>
            </div>
          )}

          {/* ---------------- ĐÓNG GÓP Ý KIẾN ---------------- */}
          {tab === "feedback" && (
            <form onSubmit={onSendFeedback} className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">
                Đóng góp ý kiến
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Góp ý của bạn giúp RePrice cải thiện (mô phỏng, không gửi
                server).
              </p>
              <div className="mt-5">
                <label className="label" htmlFor="fb-topic">
                  Lĩnh vực
                </label>
                <select
                  id="fb-topic"
                  className="input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option>Góp ý giao diện</option>
                  <option>Góp ý tính năng</option>
                  <option>Lỗi kỹ thuật</option>
                  <option>Khác</option>
                </select>
              </div>
              <div className="mt-4">
                <label className="label" htmlFor="fb-content">
                  Nội dung
                </label>
                <textarea
                  id="fb-content"
                  className="input min-h-32 resize-y"
                  placeholder="Nhập ý kiến đóng góp của bạn…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <div className="mt-5">
                <Button type="submit">Gửi đóng góp</Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* (hết nội dung tab) */}
    </div>
  );
}
