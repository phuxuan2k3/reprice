import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import PhoneImage from "../components/PhoneImage";
import Button from "../components/Button";
import AccessNotice from "../components/AccessNotice";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { sellerApi, tradeApi } from "../api/client";
import { toUiPhone } from "../api/adapters";
import { ORDER_STATUS } from "../api/labels";
import { useAction, useResource } from "../api/useResource";
import { formatDateTime, formatVND, phoneName, phoneUsage } from "../utils/format";

const LISTING_STATUS = {
  DRAFT: { label: "Nháp", tone: "gray" },
  ACTIVE: { label: "Đang bán", tone: "green" },
  PAUSED: { label: "Tạm ẩn", tone: "amber" },
  IN_TRANSACTION: { label: "Đang giao dịch", tone: "blue" },
  SOLD: { label: "Đã bán", tone: "gray" },
  REMOVED: { label: "Đã gỡ", tone: "red" },
};

/** Tin đăng và đơn bán của người bán đang đăng nhập (dữ liệu từ backend). */
export default function SellerListingsPage() {
  const { user, loginAs, showToast, apiSession } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("mine");
  const listings = useResource(() => (user ? sellerApi.myListings() : Promise.resolve({ items: [] })), [apiSession]);
  const orders = useResource(() => (user ? tradeApi.myOrders("seller") : Promise.resolve({ items: [] })), [apiSession]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));
  const [confirmRemove, setConfirmRemove] = useState(null);

  if (!user || user.role !== "seller") {
    return (
      <AccessNotice
        requiredRole="seller"
        requiredLabel="Người bán"
        title={user ? "Trang dành cho Người bán" : "Cần đăng nhập với vai trò Người bán"}
        description="Để quản lý tin đăng, bạn cần đăng nhập với vai trò Người bán."
        onLogin={() => loginAs("seller")}
      />
    );
  }

  const mine = (listings.data?.items || []).map((l) => ({ ...toUiPhone(l), raw: l }));
  const myOrders = orders.data?.items || [];
  const count = (st) => mine.filter((p) => p.listingStatus === st).length;

  const act = async (key, fn, message) => {
    const ok = await run(key, fn);
    if (ok !== undefined) {
      showToast(message);
      listings.reload();
    }
  };

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Quản lý tin đăng</h1>
          <p className="mt-1 text-sm text-ink-500">Các điện thoại {user.name} đang rao bán trên RePrice.</p>
        </div>
        <Link to="/seller/create-listing">
          <Button>Đăng bán mới</Button>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Tổng tin đăng", mine.length, "text-brand-600"],
          ["Đang bán", count("ACTIVE"), "text-emerald-600"],
          ["Tạm ẩn / nháp", count("PAUSED") + count("DRAFT"), "text-amber-600"],
          ["Đang giao dịch / đã bán", count("IN_TRANSACTION") + count("SOLD"), "text-ink-700"],
        ].map(([label, value, cls]) => (
          <div key={label} className="card p-4">
            <div className="text-sm text-ink-500">{label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{listings.loading ? "…" : value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex w-fit flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {[
          ["mine", `Tin của tôi (${mine.length})`],
          ["orders", `Đơn bán (${myOrders.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              tab === key ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(listings.error || orders.error) && (
        <p className="mt-4 text-sm text-red-600">{(listings.error || orders.error).message}</p>
      )}

      {tab === "orders" && (
        <div className="mt-4 space-y-3">
          {myOrders.length === 0 ? (
            <div className="card p-8 text-center text-sm text-ink-500">
              Chưa có đơn bán. Khi người mua chốt giá với tin của bạn, đơn sẽ xuất hiện tại đây.
            </div>
          ) : (
            myOrders.map((o) => {
              const st = ORDER_STATUS[o.status] || { label: o.status, tone: "gray" };
              return (
                <div key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{o.title}</span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                    <div className="mt-1 text-sm text-ink-500">
                      Đơn {o.code} · Người mua {o.counterpart.fullName} · {formatDateTime(o.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold tabular-nums text-brand-600">{formatVND(o.agreedTotal)}</span>
                    <Button size="sm" onClick={() => navigate(`/orders/${o.id}`)}>Xem & xử lý</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "mine" &&
        (listings.loading && !listings.data ? (
          <p className="mt-4 text-sm text-ink-500">Đang tải tin đăng…</p>
        ) : mine.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Bạn chưa có tin đăng nào"
              description="Đăng bán điện thoại đầu tiên của bạn ngay."
              actionLabel="Đăng bán ngay"
              to="/seller/create-listing"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {mine.map((p) => {
              const st = LISTING_STATUS[p.listingStatus] || { label: p.listingStatus, tone: "gray" };
              const can = (a) => p.allowedActions.includes(a);
              const cover = p.raw.photos?.[0]?.url;
              return (
                <div key={p.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <Link to={`/phones/${p.id}`} className="shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
                    {cover ? (
                      <img src={cover} alt={phoneName(p)} className="h-32 w-24 object-cover" />
                    ) : (
                      <PhoneImage phone={p} className="h-32 w-auto" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/phones/${p.id}`} className="font-semibold text-ink-900 hover:text-brand-600">
                        {phoneName(p)} <span className="text-ink-500">{p.storage}</span>
                      </Link>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                    <div className="mt-1 text-sm text-ink-500">
                      {p.condition} · Dùng {phoneUsage(p)}
                      {p.batteryHealth != null ? ` · Pin ${p.batteryHealth}%` : ""} · {p.region}
                    </div>
                    <div className="mt-1 text-lg font-bold text-brand-600">{p.price ? formatVND(p.price) : "Chưa có giá"}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/phones/${p.id}`)}>Xem</Button>
                    {can("PAUSE") && (
                      <Button variant="outline" size="sm" disabled={!!busy}
                        onClick={() => act(p.id, () => sellerApi.pause(p.id), "Đã tạm ẩn tin. Các thương lượng đang mở đã đóng.")}>
                        Tạm ẩn
                      </Button>
                    )}
                    {can("RESUME") && (
                      <Button variant="outline" size="sm" disabled={!!busy}
                        onClick={() => act(p.id, () => sellerApi.resume(p.id), "Tin đăng đã hoạt động lại.")}>
                        Hoạt động lại
                      </Button>
                    )}
                    {can("REMOVE") && (
                      <Button variant="danger" size="sm" disabled={!!busy} onClick={() => setConfirmRemove(p)}>Gỡ tin</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {confirmRemove && (
        <div role="dialog" aria-modal="true" aria-label="Gỡ tin" className="fixed inset-0 z-50 bg-black/50 p-4" onClick={() => setConfirmRemove(null)}>
          <div className="card mx-auto my-24 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-ink-900">Gỡ tin {phoneName(confirmRemove)} {confirmRemove.storage}?</h2>
            <p className="mt-2 text-sm text-ink-600">Tin sẽ không còn hiển thị và các thương lượng đang mở sẽ đóng. Không hoàn tác được.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmRemove(null)}>Giữ lại</Button>
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={async () => {
                  const p = confirmRemove;
                  setConfirmRemove(null);
                  await act(p.id, () => sellerApi.remove(p.id).then(() => true), "Đã gỡ tin.");
                }}
              >
                Gỡ tin
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
