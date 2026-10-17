import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { tradeApi } from "../../api/client";
import { NEGOTIATION_STATUS } from "../../api/labels";
import { useAction, useResource } from "../../api/useResource";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import { formatDateTime, formatVND } from "../../utils/format";

/** Một cuộc thương lượng, dùng chung cho người mua và người bán (nút theo allowedActions). */
export default function TradeNegotiationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { apiSession, showToast } = useApp();
  const { data: neg, loading, error, setData } = useResource(() => tradeApi.negotiation(id), [id, apiSession]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  if (loading && !neg) return <div className="container-x py-8 text-sm text-ink-500">Đang tải thương lượng…</div>;
  if (error) {
    return (
      <div className="container-x py-8">
        <p className="text-sm text-red-600">
          {error.status === 404 ? "Không tìm thấy cuộc thương lượng, hoặc bạn không phải bên tham gia." : error.message}
        </p>
        <Link to="/trades" className="mt-3 inline-block text-sm font-medium text-brand-600">Về Giao dịch của tôi</Link>
      </div>
    );
  }

  const can = (a) => neg.allowedActions.includes(a);
  const st = NEGOTIATION_STATUS[neg.status] || { label: neg.status, tone: "gray" };
  const lastOffer = neg.offers[neg.offers.length - 1];

  const sendOffer = async (e) => {
    e.preventDefault();
    const value = Number(String(amount).replace(/\D/g, ""));
    if (!value) {
      showToast("Nhập mức giá lớn hơn 0.", "error");
      return;
    }
    const res = await run("offer", () => tradeApi.counterOffer(id, value, note.trim()));
    if (res) {
      setData(res);
      setAmount("");
      setNote("");
      showToast("Đã gửi đề nghị giá.");
    }
  };

  const accept = async () => {
    const res = await run("accept", () => tradeApi.accept(id));
    if (res) {
      showToast(`Đã chốt giá ${formatVND(res.negotiation.agreedPrice)}. Đơn ${res.order.code} đã được tạo.`);
      navigate(`/orders/${res.order.id}`);
    }
  };

  const reject = async () => {
    const res = await run("reject", () => tradeApi.reject(id, note.trim() || undefined));
    if (res) {
      setData(res);
      showToast("Đã từ chối đề nghị.");
    }
  };

  const cancel = async () => {
    const res = await run("cancel", () => tradeApi.cancelNegotiation(id));
    if (res) {
      setData(res);
      showToast("Đã dừng thương lượng.");
    }
  };

  return (
    <div className="container-x max-w-3xl py-8">
      <nav className="text-sm text-ink-500">
        <Link to="/trades" className="hover:text-brand-600">Giao dịch của tôi</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-900">Thương lượng</span>
      </nav>

      <div className="card mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to={`/phones/${neg.listing.id}`} className="text-lg font-bold text-ink-900 hover:text-brand-600">
              {neg.listing.title}
            </Link>
            <div className="mt-1 text-sm text-ink-500">
              Người bán: {neg.seller.fullName} · Người mua: {neg.buyer.fullName} · {neg.listing.province}
            </div>
          </div>
          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Figure label="Giá rao khi bắt đầu" value={formatVND(neg.listingPriceAtStart)} />
          <Figure
            label={neg.status === "AGREED" ? "Giá đã chốt" : "Mức giá đang đề nghị"}
            value={formatVND(neg.agreedPrice ?? neg.currentOffer ?? lastOffer?.amount)}
            strong
          />
          <Figure label="Giá rao hiện tại" value={formatVND(neg.currentListingPrice)} />
        </div>
        {neg.closedReason && <p className="mt-3 text-sm text-ink-600">Lý do kết thúc: {neg.closedReason}</p>}
        {can("VIEW_ORDER") && (
          <Button className="mt-4" onClick={() => navigate(`/orders/${neg.orderId}`)}>Xem đơn hàng</Button>
        )}
      </div>

      {(can("OFFER") || can("ACCEPT") || can("REJECT")) && (
        <div className="card mt-4 p-5">
          <h2 className="font-semibold text-ink-900">Đến lượt bạn phản hồi</h2>
          <p className="mt-1 text-sm text-ink-500">
            {lastOffer?.by === "BUYER" ? "Người mua" : "Người bán"} đề nghị{" "}
            <b className="text-ink-900">{formatVND(lastOffer?.amount)}</b>. Chấp nhận sẽ tạo đơn hàng ngay với giá này.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="success" onClick={accept} disabled={!!busy}>
              {busy === "accept" ? "Đang chốt…" : `Chấp nhận ${formatVND(lastOffer?.amount)}`}
            </Button>
            <Button variant="danger" onClick={reject} disabled={!!busy}>Từ chối</Button>
          </div>
          <form onSubmit={sendOffer} className="mt-5 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="label" htmlFor="neg-amount">Đề nghị giá khác (₫)</label>
              <input
                id="neg-amount"
                className="input"
                inputMode="numeric"
                placeholder="Ví dụ 9.000.000"
                value={amount ? Number(String(amount).replace(/\D/g, "")).toLocaleString("vi-VN") : ""}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <label className="label" htmlFor="neg-note">Ghi chú (không bắt buộc)</label>
              <input id="neg-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" className="self-end" disabled={!!busy}>
              {busy === "offer" ? "Đang gửi…" : "Gửi đề nghị"}
            </Button>
          </form>
        </div>
      )}

      {!can("OFFER") && (neg.status === "AWAITING_SELLER" || neg.status === "AWAITING_BUYER") && (
        <div className="card mt-4 p-5 text-sm text-ink-600">
          Đang chờ {neg.status === "AWAITING_SELLER" ? "người bán" : "người mua"} phản hồi đề nghị{" "}
          <b className="text-ink-900">{formatVND(lastOffer?.amount)}</b>.
          {can("CANCEL") && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={cancel} disabled={!!busy}>Dừng thương lượng</Button>
          )}
        </div>
      )}

      <div className="card mt-4 p-5">
        <h2 className="font-semibold text-ink-900">Lịch sử đề nghị</h2>
        <ol className="mt-3 space-y-2">
          {neg.offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span>
                <b>{o.by === "BUYER" ? neg.buyer.fullName : neg.seller.fullName}</b>{" "}
                <span className="text-ink-500">({o.by === "BUYER" ? "người mua" : "người bán"})</span> đề nghị{" "}
                <b className="text-brand-600">{formatVND(o.amount)}</b>
                {o.note ? <span className="text-ink-500"> — “{o.note}”</span> : null}
              </span>
              <span className="text-xs text-ink-400">{formatDateTime(o.createdAt)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Figure({ label, value, strong }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${strong ? "text-lg text-brand-600" : "text-ink-900"}`}>{value}</div>
    </div>
  );
}
