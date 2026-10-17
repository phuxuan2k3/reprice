import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { tradeApi } from "../../api/client";
import { CASE_STATUS, CASE_TYPE, NEGOTIATION_STATUS, ORDER_STATUS, PARTY_LABEL } from "../../api/labels";
import { caseApi } from "../../api/client";
import { useResource } from "../../api/useResource";
import { NOTIFICATIONS_CHANGED } from "../../api/hooks";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import { formatDateTime, formatVND } from "../../utils/format";

const TABS = [
  { key: "buying", label: "Đang mua" },
  { key: "selling", label: "Đang bán" },
  { key: "cases", label: "Hồ sơ" },
  { key: "notifications", label: "Thông báo" },
];

/** Thương lượng, đơn hàng và thông báo của người đang đăng nhập (dữ liệu từ backend). */
export default function MyTradesPage() {
  const { user, apiSession } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : user?.role === "seller" ? "selling" : "buying";

  if (!user) {
    return (
      <div className="container-x py-8">
        <EmptyState title="Bạn cần đăng nhập để xem giao dịch." description="Đăng nhập rồi quay lại trang này." />
        <Link to="/login?next=/trades" className="mt-3 inline-block text-sm font-medium text-brand-600">Đăng nhập</Link>
      </div>
    );
  }

  return (
    <div className="container-x max-w-4xl py-8">
      <h1 className="text-2xl font-bold text-ink-900">Giao dịch của tôi</h1>
      <p className="mt-1 text-sm text-ink-500">Thương lượng và đơn hàng của {user.name}. Một tài khoản có thể vừa mua vừa bán.</p>
      <div className="mt-5 flex gap-2 border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "notifications" ? (
        <Notifications session={apiSession} />
      ) : tab === "cases" ? (
        <Cases session={apiSession} />
      ) : (
        <Deals role={tab === "selling" ? "seller" : "buyer"} session={apiSession} />
      )}
    </div>
  );
}

function Deals({ role, session }) {
  const negs = useResource(() => tradeApi.myNegotiations(role), [role, session]);
  const orders = useResource(() => tradeApi.myOrders(role), [role, session]);
  const err = negs.error || orders.error;
  if (err) return <p className="mt-6 text-sm text-red-600">{err.message}</p>;
  if (negs.loading || orders.loading) return <p className="mt-6 text-sm text-ink-500">Đang tải…</p>;

  return (
    <div className="mt-6 grid gap-8">
      <section>
        <h2 className="font-semibold text-ink-900">Đơn hàng {role === "seller" ? "bán" : "mua"}</h2>
        {orders.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Chưa có đơn hàng.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {orders.data.items.map((o) => {
              const st = ORDER_STATUS[o.status] || { label: o.status, tone: "gray" };
              return (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900">{o.title}</div>
                      <div className="text-xs text-ink-500">
                        {o.code} · {role === "seller" ? "Người mua" : "Người bán"} {o.counterpart.fullName} · {formatDateTime(o.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{formatVND(o.agreedTotal)}</span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-ink-900">Thương lượng</h2>
        {negs.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Chưa có cuộc thương lượng nào.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {negs.data.items.map((n) => {
              const st = NEGOTIATION_STATUS[n.status] || { label: n.status, tone: "gray" };
              const myTurn = n.allowedActions.includes("ACCEPT");
              const last = n.offers[n.offers.length - 1];
              return (
                <li key={n.id}>
                  <Link to={`/negotiations/${n.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900">
                        {n.listing.title}
                        {myTurn && <span className="ml-2 rounded bg-brand-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">Đến lượt bạn</span>}
                      </div>
                      <div className="text-xs text-ink-500">
                        {role === "seller" ? `Người mua ${n.buyer.fullName}` : `Người bán ${n.seller.fullName}`} · giá rao{" "}
                        {formatVND(n.listingPriceAtStart)} · cập nhật {formatDateTime(n.updatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{formatVND(n.agreedPrice ?? last?.amount)}</span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Notifications({ session }) {
  const navigate = useNavigate();
  const [marking, setMarking] = useState(false);
  const res = useResource(() => tradeApi.notifications(), [session]);
  if (res.error) return <p className="mt-6 text-sm text-red-600">{res.error.message}</p>;
  if (res.loading && !res.data) return <p className="mt-6 text-sm text-ink-500">Đang tải…</p>;
  const { items, unreadCount } = res.data;

  const open = async (n) => {
    if (!n.readAt) {
      await tradeApi.readNotification(n.id).catch(() => {});
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    }
    navigate(n.link);
  };
  const readAll = async () => {
    setMarking(true);
    await tradeApi.readAllNotifications().catch(() => {});
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    setMarking(false);
    res.reload();
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">{unreadCount} thông báo chưa đọc</p>
        {unreadCount > 0 && (
          <button className="text-sm font-medium text-brand-600 disabled:opacity-50" onClick={readAll} disabled={marking}>
            Đánh dấu đã đọc tất cả
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Chưa có thông báo.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-500"}`} aria-hidden />
                <span className="min-w-0">
                  <span className={`block text-sm ${n.readAt ? "text-ink-700" : "font-semibold text-ink-900"}`}>{n.title}</span>
                  {n.body && <span className="block text-xs text-ink-500">{n.body}</span>}
                  <span className="block text-[11px] text-ink-400">{formatDateTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cases({ session }) {
  const res = useResource(() => caseApi.mine(), [session]);
  if (res.error) return <p className="mt-6 text-sm text-red-600">{res.error.message}</p>;
  if (res.loading && !res.data) return <p className="mt-6 text-sm text-ink-500">Đang tải…</p>;
  const items = res.data.items;
  if (!items.length) return <p className="mt-6 text-sm text-ink-500">Chưa có hồ sơ trả hàng hay khiếu nại.</p>;
  return (
    <ul className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {items.map((c) => {
        const st = CASE_STATUS[c.status] || { label: c.status, tone: "gray" };
        return (
          <li key={c.id}>
            <Link to={`/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="font-medium text-ink-900">{CASE_TYPE[c.type]} · {c.code}</div>
                <div className="text-xs text-ink-500">
                  Đơn {c.orderCode} · {c.title}
                  {c.awaitingParty && c.dueAt ? ` · chờ ${PARTY_LABEL[c.awaitingParty]} trước ${formatDateTime(c.dueAt)}` : ""}
                </div>
              </div>
              <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
