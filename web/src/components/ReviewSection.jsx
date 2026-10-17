import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { reviews } from "../data/reviews";
import DataBadge from "./DataBadge";

export function Stars({ rating }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating}/5 sao`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < rating ? "text-amber-400" : "text-gray-300"}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      <span className="ml-1 text-xs font-medium text-ink-500">
        {rating}/5
      </span>
    </span>
  );
}

/** Thẻ đánh giá — tái dùng ở trang chủ và trang chi tiết. */
export function ReviewCard({ review, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(review)}
      className="card flex h-full flex-col p-5 text-left transition hover:shadow-lift hover:border-brand-200"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-base font-bold text-white">
          {review.name.charAt(0)}
        </span>
        <div>
          <div className="text-sm font-semibold text-ink-900">
            {review.name}
          </div>
          <Stars rating={review.rating} />
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-700">
        &ldquo;{review.comment}&rdquo;
      </p>
      <span className="mt-auto pt-3 text-xs font-medium text-brand-600">
        Xem chi tiết
      </span>
    </button>
  );
}

/** Modal chi tiết một đánh giá. */
export function ReviewDetailModal({ review, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết đánh giá của ${review.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
              {review.name.charAt(0)}
            </span>
            <div>
              <div className="font-semibold text-ink-900">{review.name}</div>
              <Stars rating={review.rating} />
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-2 text-ink-400 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-700">
          {review.detail}
        </p>
        <div className="mt-5 border-t border-gray-100 pt-4 text-xs text-ink-400">
          Ngày đánh giá: {review.date} · Đánh giá minh họa
        </div>
      </div>
    </div>
  );
}

/** Khu vực "Đánh giá từ người dùng" — dữ liệu mô phỏng. */
export default function ReviewSection() {
  const { user, showToast } = useApp();
  const navigate = useNavigate();
  const [active, setActive] = useState(null);

  const onClick = (review) => {
    if (!user) {
      showToast("Bạn cần đăng nhập để xem chi tiết đánh giá", "error");
      navigate("/login");
      return;
    }
    setActive(review);
  };

  return (
    <section className="bg-white py-14">
      <div className="container-x">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold text-ink-900">
            Đánh giá từ người dùng
          </h2>
          <DataBadge />
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Mở chi tiết đánh giá cần đăng nhập. Đây là dữ liệu mô phỏng,
          không phải đánh giá thực tế.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} onClick={onClick} />
          ))}
        </div>
      </div>

      {active && (
        <ReviewDetailModal review={active} onClose={() => setActive(null)} />
      )}
    </section>
  );
}
