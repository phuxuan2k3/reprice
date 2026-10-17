import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";
import { formatDate } from "../utils/format";

const KIND_META = {
  counter: {
    tone: "blue",
    title: "Thương lượng",
    icon: (
      <path d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    ),
  },
  agreed: {
    tone: "green",
    title: "Thương lượng",
    icon: <path d="M20 6L9 17l-5-5" />,
  },
  rejected: {
    tone: "red",
    title: "Thương lượng",
    icon: <path d="M6 6l12 12M18 6L6 18" />,
  },
  "neg-offer": {
    tone: "blue",
    title: "Thương lượng",
    icon: (
      <path d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    ),
  },
  "neg-agreed": {
    tone: "green",
    title: "Thương lượng",
    icon: <path d="M20 6L9 17l-5-5" />,
  },
  "order-new": {
    tone: "amber",
    title: "Đơn hàng",
    icon: (
      <path d="M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
    ),
  },
  "order-completed": {
    tone: "green",
    title: "Đơn hàng",
    icon: <path d="M20 6L9 17l-5-5" />,
  },
  "order-cancelled": {
    tone: "gray",
    title: "Đơn hàng",
    icon: <path d="M6 6l12 12M18 6L6 18" />,
  },
};

/**
 * Màn hình 17 — Trung tâm thông báo.
 * Hiển thị thông báo của tài khoản đang đăng nhập (Người mua hoặc Người bán).
 */
export default function NotificationCenter() {
  const {
    user,
    loginAs,
    notifications,
    unreadCount,
    readNotifIds,
    markNotificationRead,
    markAllNotificationsRead,
  } = useApp();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="container-x py-16 text-center">
        <h1 className="text-xl font-bold text-ink-900">
          Cần đăng nhập để xem thông báo
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Thông báo thương lượng và đơn hàng chỉ hiển thị cho
          tài khoản của bạn.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={() => loginAs("buyer")}>
            Đăng nhập Người mua (demo)
          </Button>
          <Button variant="outline" onClick={() => navigate("/")}>
            Về Trang chủ
          </Button>
        </div>
      </div>
    );
  }

  const onOpen = (n) => {
    markNotificationRead(n.id);
    navigate(n.link);
  };

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            Trung tâm thông báo
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Thông báo thương lượng, đơn hàng và các sự kiện liên
            quan đến tài khoản của bạn.{" "}
            <DataBadge />
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllNotificationsRead}>
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <svg className="h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <h3 className="text-lg font-semibold text-ink-900">
            Bạn chưa có thông báo nào
          </h3>
          <p className="max-w-md text-sm text-ink-500">
            Thông báo về thương lượng và đơn hàng của bạn sẽ
            hiển thị tại đây.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {notifications.map((n) => {
            const meta = KIND_META[n.kind] || KIND_META["order-new"];
            const unread = !readNotifIds.includes(n.id);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onOpen(n)}
                  className="card flex w-full items-start gap-4 p-4 text-left transition hover:shadow-lift"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      {
                        blue: "bg-blue-50 text-blue-600",
                        green: "bg-emerald-50 text-emerald-600",
                        red: "bg-red-50 text-red-600",
                        amber: "bg-amber-50 text-amber-600",
                        gray: "bg-gray-100 text-ink-500",
                      }[meta.tone]
                    }`}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {meta.icon}
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">
                        {n.title}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink-500">
                        {meta.title}
                      </span>
                      <span className="text-xs text-ink-400">
                        {formatDate(String(n.time))}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-700">
                      {n.message}
                    </span>
                  </span>
                  {unread && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Chưa đọc" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
