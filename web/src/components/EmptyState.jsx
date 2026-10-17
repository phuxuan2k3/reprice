import { Link } from "react-router-dom";
import Button from "./Button";

export default function EmptyState({
  title = "Không tìm thấy kết quả",
  description = "Thử thay đổi từ khóa hoặc bộ lọc.",
  actionLabel = "Xem tất cả điện thoại",
  to = "/phones",
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <svg className="h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
        <path d="M8.5 11h5" />
      </svg>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      <p className="max-w-md text-sm text-ink-500">{description}</p>
      {to && (
        <Link to={to}>
          <Button variant="outline">{actionLabel}</Button>
        </Link>
      )}
    </div>
  );
}
