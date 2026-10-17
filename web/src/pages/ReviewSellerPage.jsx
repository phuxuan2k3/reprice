import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import { phoneName, formatDate } from "../utils/format";

/**
 * Màn hình 14 — Đánh giá người bán.
 * Chỉ cho phép đánh giá đơn đã hoàn tất và chưa được đánh giá.
 * Mỗi đơn chỉ có một đánh giá của người mua.
 */
export default function ReviewSellerPage() {
  const { id: orderId } = useParams();
  const {
    user,
    orders,
    getPhone,
    hasReviewedOrder,
    addReview,
    showToast,
  } = useApp();
  const navigate = useNavigate();

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState({});

  if (!user) {
    return (
      <Navigate
        to={`/login?message=login-required&next=${encodeURIComponent(
          `/orders/${orderId}/review`
        )}`}
        replace
      />
    );
  }
  if (user.role !== "buyer") {
    return (
      <div className="container-x py-16 text-center">
        <h1 className="text-xl font-bold text-ink-900">
          Trang dành cho Người mua
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Bạn cần đăng nhập với vai trò Người mua để đánh giá người
          bán.
        </p>
        <Link to="/phones" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
          Về danh sách điện thoại
        </Link>
      </div>
    );
  }

  const order = orders.find((o) => o.id === orderId);
  const phone = order ? getPhone(order.phoneId) : null;

  // Điều kiện: đơn thuộc người mua, đã hoàn tất, chưa đánh giá
  if (
    !order ||
    !phone ||
    order.buyerId !== user.id ||
    order.status !== "COMPLETED" ||
    hasReviewedOrder(order.id)
  ) {
    return <Navigate to={order ? `/orders/${order.id}` : "/phones"} replace />;
  }

  const onSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (rating < 1) errs.rating = "Vui lòng chọn số sao (1–5).";
    if (!comment.trim()) errs.comment = "Vui lòng nhập nhận xét.";
    else if (comment.trim().length < 5)
      errs.comment = "Nhận xét cần ít nhất 5 ký tự.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    addReview({
      orderId: order.id,
      phoneId: phone.id,
      productName: phoneName(phone),
      sellerName: order.sellerName,
      rating,
      comment: comment.trim(),
    });
    showToast("Cảm ơn bạn đã đánh giá người bán.");
    navigate(`/orders/${order.id}`);
  };

  return (
    <div className="container-x py-8">
      <div className="mx-auto max-w-2xl">
        <nav className="text-sm text-ink-500">
          <Link to="/phones" className="hover:text-brand-600">
            Danh sách điện thoại
          </Link>
          <span className="mx-2">/</span>
          <Link to={`/orders/${order.id}`} className="hover:text-brand-600">
            Đơn {order.id}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink-900">Đánh giá người bán</span>
        </nav>

        <h1 className="mt-4 text-2xl font-bold text-ink-900">
          Đánh giá người bán
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Đánh giá của bạn giúp người mua khác chọn người bán uy tín.
        </p>

        {/* Sản phẩm đã mua */}
        <div className="card mt-6 p-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
              <PhoneImage phone={phone} className="h-24 w-auto" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink-900">
                {phoneName(phone)}{" "}
                <span className="text-ink-500">{phone.storage}</span>
              </div>
              <div className="mt-0.5 text-sm text-ink-500">
                Người bán:{" "}
                <span className="font-medium text-ink-900">
                  {order.sellerName}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                Đơn {order.id} · Hoàn tất ngày{" "}
                {order.createdAt ? formatDate(order.createdAt) : "—"}
              </div>
            </div>
            <DataBadge />
          </div>
        </div>

        <form onSubmit={onSubmit} className="card mt-4 p-6">
          {/* Số sao */}
          <div>
            <div className="label">Số sao đánh giá</div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Số sao">
              {Array.from({ length: 5 }, (_, i) => {
                const value = i + 1;
                const active = value <= (hover || rating);
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} sao`}
                    onClick={() => setRating(value)}
                    onMouseEnter={() => setHover(value)}
                    onMouseLeave={() => setHover(0)}
                    className="rounded-lg p-1 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  >
                    <svg
                      className={`h-8 w-8 transition ${
                        active ? "text-amber-400" : "text-gray-300"
                      }`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                );
              })}
              <span className="ml-2 text-sm font-medium text-ink-700">
                {rating > 0 ? `${rating}/5` : "Chưa chọn"}
              </span>
            </div>
            {errors.rating && (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                {errors.rating}
              </p>
            )}
          </div>

          {/* Nhận xét */}
          <div className="mt-5">
            <label className="label" htmlFor="review-comment">
              Nhận xét
            </label>
            <textarea
              id="review-comment"
              className="input min-h-32 resize-y"
              placeholder="VD: Máy đúng mô tả, người bán đóng gói cẩn thận, giao hàng nhanh."
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (errors.comment) setErrors({ ...errors, comment: "" });
              }}
            />
            {errors.comment && (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                {errors.comment}
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit" size="lg">
              Gửi đánh giá
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              Quay lại đơn hàng
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
