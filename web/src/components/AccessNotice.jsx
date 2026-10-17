import { Link } from "react-router-dom";
import Button from "./Button";

/**
 * Thông báo khi truy cập màn hình cần vai trò khác.
 * Cho phép đăng nhập nhanh với vai trò yêu cầu.
 */
export default function AccessNotice({
  requiredRole,
  requiredLabel,
  title,
  description,
  onLogin,
}) {
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-lg card px-8 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <svg className="h-7 w-7 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 1 1 8 0v3" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-ink-900">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{description}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onLogin}>
            Đăng nhập với vai trò {requiredLabel}
          </Button>
          <Link to="/login">
            <Button variant="outline" className="w-full">
              Đến trang đăng nhập
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-ink-400">
          Yêu cầu vai trò: {requiredLabel}.
        </p>
      </div>
    </div>
  );
}
