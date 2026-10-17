import { Link } from "react-router-dom";
import PhoneImage from "./PhoneImage";
import StatusBadge, { ConditionBadge } from "./StatusBadge";
import { formatVND, formatAgo, phoneName } from "../utils/format";

/** Card sản phẩm dùng ở trang chủ và danh sách. */
export default function ProductCard({ phone }) {
  const sold = phone.listingStatus === "SOLD";
  const paused = phone.listingStatus === "PAUSED";
  return (
    <div className="card group flex h-full flex-col overflow-hidden transition hover:shadow-lift hover:border-gray-200">
      <Link to={`/phones/${phone.id}`} className="relative block bg-gradient-to-br from-gray-50 to-gray-100">
        <PhoneImage phone={phone} className="mx-auto h-56 w-auto p-4 transition group-hover:scale-[1.02]" />
        {sold && (
          <span className="absolute left-3 top-3 rounded-md bg-gray-900/85 px-2.5 py-1 text-xs font-semibold text-white">
            Đã bán
          </span>
        )}
        {paused && (
          <span className="absolute left-3 top-3 rounded-md bg-amber-500/90 px-2.5 py-1 text-xs font-semibold text-white">
            Tạm ẩn
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <Link
            to={`/phones/${phone.id}`}
            className="text-base font-semibold text-ink-900 hover:text-brand-600"
          >
            {phoneName(phone)}
          </Link>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            <span>{phone.storage}</span>
            <span aria-hidden>·</span>
            <ConditionBadge condition={phone.condition} />
          </div>
          <div className="mt-1 text-xs text-ink-400">
            {formatAgo(phone.listedMinutesAgo)}
          </div>
        </div>
        <div className="mt-auto">
          <div className="text-lg font-bold text-brand-600">
            {formatVND(phone.price)}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-5.1-7-11a7 7 0 1 1 14 0c0 5.9-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {phone.region}
            {typeof phone.seller?.rating === "number" && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-ink-400">
                <svg className="h-3 w-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {phone.seller.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/phones/${phone.id}`}
          className="mt-3 inline-flex items-center justify-center rounded-lg border border-brand-500 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-500 hover:text-white"
        >
          Xem chi tiết
        </Link>
      </div>
    </div>
  );
}
