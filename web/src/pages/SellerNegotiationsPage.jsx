import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import AccessNotice from "../components/AccessNotice";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { formatVND, phoneName } from "../utils/format";

/**
 * DANH SÁCH THƯƠNG LƯỢNG NHẬN ĐƯỢC (vai Người bán).
 * Chỉ hiển thị các phiên thương lượng thuộc tin đăng của chính người bán
 * đang đăng nhập. Thông báo trong Trung tâm thông báo trỏ thẳng vào đây.
 */
export default function SellerNegotiationsPage() {
  const {
    user,
    loginAs,
    negotiations,
    getPhone,
    NEGOTIATION_STATUS_LABEL,
    NEGOTIATION_STATUS_TONE,
    lastBuyerOffer,
  } = useApp();

  if (!user) {
    return (
      <AccessNotice
        requiredRole="seller"
        requiredLabel="Người bán"
        title="Cần đăng nhập với vai trò Người bán"
        description="Đăng nhập với vai trò Người bán để xem các đề nghị thương lượng gửi tới tin đăng của bạn."
        onLogin={() => loginAs("seller")}
      />
    );
  }
  if (user.role !== "seller") {
    return (
      <AccessNotice
        requiredRole="seller"
        requiredLabel="Người bán"
        title="Trang dành cho Người bán"
        description="Chỉ tài khoản Người bán mới xem được thương lượng nhận được."
        onLogin={() => loginAs("seller")}
      />
    );
  }

  const list = [...negotiations]
    .filter((n) => n.sellerId === user.id)
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt) < String(a.updatedAt || a.createdAt)
        ? -1
        : 1
    );

  const needingResponse = list.filter((n) => n.status === "AWAITING_SELLER");

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            Thương lượng nhận được
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Các đề nghị giá người mua gửi tới tin đăng của bạn. Dữ liệu mô phỏng.
          </p>
        </div>
        <Link to="/seller/listings">
          <Button variant="outline" size="sm">
            Quản lý tin đăng
          </Button>
        </Link>
      </div>

      {needingResponse.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bạn có <strong>{needingResponse.length}</strong> đề nghị đang chờ phản hồi.
        </div>
      )}

      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Chưa có thương lượng nào"
            description="Khi người mua gửi đề nghị giá cho tin đăng của bạn, phiên thương lượng sẽ xuất hiện tại đây."
            to={null}
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((n) => {
            const phone = getPhone(n.phoneId);
            const offer = lastBuyerOffer(n);
            const needsMe = n.status === "AWAITING_SELLER";
            return (
              <li key={n.id}>
                <Link
                  to={`/seller/negotiations/${n.id}`}
                  className={`card flex flex-wrap items-center justify-between gap-4 p-4 transition hover:shadow-lift ${
                    needsMe ? "border-amber-300" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">
                        {phone ? phoneName(phone) : n.phoneId}
                        {phone?.storage ? (
                          <span className="text-ink-500"> {phone.storage}</span>
                        ) : null}
                      </span>
                      <StatusBadge tone={NEGOTIATION_STATUS_TONE[n.status]}>
                        {NEGOTIATION_STATUS_LABEL[n.status] || n.status}
                      </StatusBadge>
                      {needsMe && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Cần phản hồi
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-ink-500">
                      Mã phiên {n.id} · Người mua {n.buyerName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink-500">
                      {n.status === "AGREED" ? "Giá đã chốt" : "Giá rao"}
                    </div>
                    <div className="font-bold text-brand-600">
                      {formatVND(
                        n.status === "AGREED" ? n.agreedPrice : n.listingPrice
                      )}
                    </div>
                    {offer && n.status !== "AGREED" && (
                      <div className="mt-0.5 text-xs text-ink-500">
                        Đề nghị gần nhất: {formatVND(offer.price)}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
