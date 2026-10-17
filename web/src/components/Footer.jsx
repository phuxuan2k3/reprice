import { Link } from "react-router-dom";
import DataBadge from "./DataBadge";

const INFO_LINKS = [
  { to: "/about", label: "Giới thiệu" },
  { to: "/guide", label: "Hướng dẫn sử dụng" },
];

const SUPPORT_LINKS = [
  { to: "/faq", label: "Câu hỏi thường gặp" },
  { to: "/terms", label: "Điều khoản sử dụng" },
  { to: "/privacy", label: "Chính sách bảo mật" },
];

export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-700 text-white">
      <div className="container-x py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Cột 1 — Logo và giới thiệu */}
          <div>
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-xl font-extrabold text-brand-700">
                R
              </span>
              <span className="text-xl font-extrabold tracking-tight">
                RePrice
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/80">
              Dịch vụ – nền tảng tham chiếu giá điện thoại, kết nối người mua
              và người bán uy tín.
            </p>
            <div className="mt-4">
              <DataBadge variant="dark" />
            </div>
          </div>

          {/* Cột 2 — Thông tin */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white/60">
              Thông tin
            </h3>
            <ul className="mt-4 space-y-2.5">
              {INFO_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/90 transition hover:text-white hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cột 3 — Hỗ trợ */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white/60">
              Hỗ trợ
            </h3>
            <ul className="mt-4 space-y-2.5">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/90 transition hover:text-white hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cột 4 — Liên hệ */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white/60">
              Liên hệ
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-white/90">
              <li className="flex items-start gap-2.5">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-white/70"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <a
                  href="tel:0777689320"
                  className="transition hover:text-white hover:underline"
                >
                  0777689320
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-white/70"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
                <a
                  href="mailto:nguyen123thuong1401@gmail.com"
                  className="break-all transition hover:text-white hover:underline"
                >
                  nguyen123thuong1401@gmail.com
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-white/70"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>56 Hoàng Diệu 2, Thủ Đức, TP. Hồ Chí Minh</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bản quyền */}
        <div className="mt-10 border-t border-white/20 pt-6 text-center text-xs text-white/70">
          © 2026 RePrice. Tất cả quyền được bảo lưu.
        </div>
      </div>
    </footer>
  );
}
