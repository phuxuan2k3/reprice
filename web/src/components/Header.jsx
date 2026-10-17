import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useUnreadNotifications } from "../api/hooks";
import { useApp } from "../context/AppContext";
import { ROLE_LABEL, ROLE_TONE } from "../data/users";
import StatusBadge from "./StatusBadge";

const NAV = [
  { to: "/", label: "Trang chủ", end: true },
  { to: "/phones", label: "Tìm điện thoại" },
];

/** Trang đến sau khi đổi vai trò (mô phỏng) — giúp thấy ngay dữ liệu của vai đó. */
const ROLE_HOME = {
  buyer: "/account",
  seller: "/seller/listings",
  manager: "/manager/orders",
};

const ROLE_ORDER = ["buyer", "seller", "manager"];

/** Mục cố định cho MỌI vai trò đã đăng nhập — tách khỏi chuyển vai trò. */
const ACCOUNT_LINK = { to: "/account", label: "Tài khoản của tôi" };

/**
 * Liên kết nhanh theo vai trò, hiển thị trong menu tài khoản.
 * "Tài khoản của tôi" KHÔNG nằm ở đây (xem ACCOUNT_LINK) để việc chuyển vai
 * trò không làm mất mục này.
 */
const TRADES_LINK = { to: "/trades", label: "Giao dịch của tôi" };
const ROLE_LINKS = {
  buyer: [TRADES_LINK],
  seller: [
    { to: "/trades?tab=selling", label: "Thương lượng & đơn bán" },
    { to: "/seller/listings", label: "Tin đăng của tôi" },
    { to: "/seller/create-listing", label: "Đăng bán điện thoại" },
  ],
  manager: [
    { to: "/manager/orders", label: "Hồ sơ & hoàn tiền" },
    { to: "/manager/dashboard", label: "Dashboard giá tham khảo" },
    { to: "/manager/transactions", label: "Kiểm tra dữ liệu giao dịch" },
    { to: "/manager/tools", label: "Công cụ quản trị demo" },
  ],
};

/** Viết tắt từ tên để làm avatar chữ. */
function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
      {count}
    </span>
  );
}

export default function Header() {
  const {
    user,
    switchRole,
    demoMode,
    logout,
    showToast,
    apiSession,
    apiReady,
  } = useApp();
  // Chỉ gọi khi phiên backend đã khớp vai trò hiện tại, tránh gọi bằng token cũ hoặc chưa có token.
  const unreadCount = useUnreadNotifications(!!user && apiReady, apiSession);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false); // menu mobile
  const [acctOpen, setAcctOpen] = useState(false); // dropdown tài khoản (desktop)
  const acctRef = useRef(null);

  /* Đóng dropdown tài khoản khi bấm ra ngoài hoặc nhấn Escape. */
  useEffect(() => {
    if (!acctOpen) return;
    const onDoc = (e) => {
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setAcctOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  const closeAll = () => {
    setAcctOpen(false);
    setMenuOpen(false);
  };

  /** Rời tài khoản: xóa phiên đăng nhập mô phỏng, về Trang chủ dành cho Khách. */
  const onLogout = () => {
    logout();
    closeAll();
    showToast("Đã đăng xuất. Hẹn gặp lại bạn.");
    navigate("/");
  };

  /**
   * Đổi vai trò trong phiên demo (mô phỏng, không phải xác thực thật).
   * Dữ liệu thương lượng / đơn hàng / thông báo / hồ sơ được giữ nguyên.
   */
  const onSwitchRole = (role) => {
    if (role === user?.role) {
      closeAll();
      return;
    }
    const res = switchRole(role);
    if (!res.ok) {
      showToast(res.reason, "error");
      return;
    }
    closeAll();
    showToast(
      `Đã chuyển sang vai trò ${ROLE_LABEL[role]} (mô phỏng). Dữ liệu được giữ nguyên.`
    );
    navigate(ROLE_HOME[role] || "/");
  };

  const roleLinks = user ? ROLE_LINKS[user.role] || [] : [];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="container-x">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-xl font-extrabold text-white shadow-sm">
              R
            </span>
            <span className="text-xl font-extrabold tracking-tight text-ink-900">
              Re<span className="text-brand-500">Price</span>
            </span>
          </Link>

          {/* Navigation chính */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-50 text-brand-600"
                      : "text-ink-700 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Khu vực tài khoản + hành động */}
          <div className="flex items-center gap-2">
            {/* Thông báo (chỉ khi đã đăng nhập) */}
            {user && (
              <Link
                to="/trades?tab=notifications"
                className="relative rounded-lg p-2 text-ink-700 transition hover:bg-gray-100"
                aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} chưa đọc)` : ""}`}
                title="Trung tâm thông báo"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>
            )}

            {user ? (
              /* ---------- Dropdown tài khoản (desktop) ---------- */
              <div className="relative hidden lg:block" ref={acctRef}>
                <button
                  type="button"
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white py-1.5 pl-1.5 pr-2.5 text-left transition hover:bg-gray-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                    {initials(user.name)}
                  </span>
                  <span className="hidden max-w-[10rem] leading-tight xl:block">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {user.name}
                    </span>
                    <span className="block text-[11px] font-medium text-ink-500">
                      {ROLE_LABEL[user.role]}
                    </span>
                  </span>
                  <svg className={`h-4 w-4 text-ink-400 transition ${acctOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {acctOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lift"
                  >
                    {/* Đầu mục: danh tính + vai trò */}
                    <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
                        <p className="truncate text-xs text-ink-500">
                          {user.id} · {ROLE_LABEL[user.role]}
                        </p>
                      </div>
                    </div>

                    {/* Tài khoản của tôi — cố định cho mọi vai trò */}
                    <div className="border-b border-gray-100 py-1">
                      <Link
                        to={ACCOUNT_LINK.to}
                        role="menuitem"
                        onClick={closeAll}
                        className="flex items-center justify-between px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-gray-50"
                      >
                        {ACCOUNT_LINK.label}
                      </Link>
                    </div>

                    {/* Đổi vai trò (mô phỏng) */}
                    <div className="border-b border-gray-100 px-3 py-3">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        Chuyển vai trò
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-amber-800">
                          Mô phỏng
                        </span>
                      </p>
                      {demoMode ? (
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {ROLE_ORDER.map((r) => (
                            <button
                              key={r}
                              type="button"
                              role="menuitem"
                              onClick={() => onSwitchRole(r)}
                              className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold transition ${
                                user.role === r
                                  ? "border-brand-500 bg-brand-50 text-brand-600"
                                  : "border-gray-200 text-ink-700 hover:bg-gray-50"
                              }`}
                            >
                              {ROLE_LABEL[r]}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-ink-500">
                          Chuyển vai trò đang tắt cho phiên này. Đăng nhập bằng trang
                          đăng nhập để đổi tài khoản.
                        </p>
                      )}
                    </div>

                    {/* Liên kết theo vai trò */}
                    <div className="py-1">
                      {roleLinks.map((l) => (
                        <Link
                          key={l.to}
                          to={l.to}
                          role="menuitem"
                          onClick={closeAll}
                          className="flex items-center justify-between px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-gray-50"
                        >
                          <span>{l.label}</span>
                          {l.badge > 0 && <UnreadBadge count={l.badge} />}
                        </Link>
                      ))}
                      <Link
                        to="/trades?tab=notifications"
                        role="menuitem"
                        onClick={closeAll}
                        className="flex items-center justify-between px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-gray-50"
                      >
                        Thông báo
                        <UnreadBadge count={unreadCount} />
                      </Link>
                    </div>

                    <div className="border-t border-gray-100 py-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={onLogout}
                        className="block w-full px-4 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ---------- Khách: đăng nhập / đăng ký ---------- */
              <div className="hidden items-center gap-2 lg:flex">
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-gray-100"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/login?mode=register"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                >
                  Đăng ký
                </Link>
              </div>
            )}

            {/* Nút menu mobile */}
            <button
              className="rounded-lg p-2 text-ink-700 hover:bg-gray-100 lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mở menu"
              aria-expanded={menuOpen}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        {menuOpen && (
          <nav className="border-t border-gray-100 py-3 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive
                        ? "bg-brand-50 text-brand-600"
                        : "text-ink-700 hover:bg-gray-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}

              {user ? (
                <>
                  <div className="mt-1 flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                      {initials(user.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {user.name}
                      </p>
                      <div className="mt-0.5">
                        <StatusBadge tone={ROLE_TONE[user.role]}>
                          {ROLE_LABEL[user.role]}
                        </StatusBadge>
                      </div>
                    </div>
                  </div>

                  {/* Tài khoản của tôi — cố định cho mọi vai trò */}
                  <Link
                    to={ACCOUNT_LINK.to}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-gray-100"
                  >
                    {ACCOUNT_LINK.label}
                  </Link>

                  <div className="mt-1 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                      Chuyển vai trò
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-amber-800">
                        Mô phỏng
                      </span>
                    </p>
                    {demoMode ? (
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {ROLE_ORDER.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => onSwitchRole(r)}
                            className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold transition ${
                              user.role === r
                                ? "border-brand-500 bg-brand-50 text-brand-600"
                                : "border-gray-200 text-ink-700 hover:bg-gray-50"
                            }`}
                          >
                            {ROLE_LABEL[r]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 rounded-lg bg-white px-2.5 py-2 text-xs text-ink-500">
                        Chuyển vai trò đang tắt cho phiên này.
                      </p>
                    )}
                  </div>

                  {roleLinks.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-gray-100"
                    >
                      <span>{l.label}</span>
                      {l.badge > 0 && <UnreadBadge count={l.badge} />}
                    </Link>
                  ))}

                  <Link
                    to="/trades?tab=notifications"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-gray-100"
                  >
                    Thông báo
                    <UnreadBadge count={unreadCount} />
                  </Link>

                  <button
                    onClick={onLogout}
                    className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-gray-100"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    to="/login?mode=register"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-gray-100"
                  >
                    Đăng ký
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
