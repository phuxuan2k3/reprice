import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { caseApi, demoApi, tradeApi } from "../../api/client";
import { CASE_REASON } from "../../api/labels";
import { ORDER_STATUS, PAYMENT_CHANNELS, PAYMENT_STATUS, PAYOUT_STATUS, SHIPMENT_STATUS } from "../../api/labels";
import { useAction, useResource } from "../../api/useResource";
import { APPEARANCE_LABEL } from "../../api/adapters";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import { formatDateTime, formatVND } from "../../utils/format";

const PARTY_LABEL = { BUYER: "Người mua", SELLER: "Người bán", SYSTEM: "Hệ thống", ADMIN: "RePrice" };

/** Chi tiết đơn hàng từ backend: thanh toán, giao hàng, nhận hàng (docs/state-diagrams.md mục 3). */
export default function TradeOrderPage() {
  const { id } = useParams();
  const { apiSession, showToast } = useApp();
  const order = useResource(() => tradeApi.order(id), [id, apiSession]);
  const history = useResource(() => tradeApi.orderHistory(id), [id, apiSession]);
  const { busy, run } = useAction((e) => showToast(e.message, "error"));
  const o = order.data;
  // Giờ hệ thống của backend (có thể đã tua); null khi backend không bật chế độ demo.
  const [clock, setClock] = useState(null);
  useEffect(() => {
    demoApi.clock().then(setClock).catch(() => setClock(null));
  }, [apiSession]);
  const offsetMs = (clock?.offsetSeconds || 0) * 1000;

  const refresh = () => {
    order.reload();
    history.reload();
  };
  // Thao tác trả về đơn mới: cập nhật ngay, rồi tải lại lịch sử.
  const act = async (key, fn, message) => {
    const res = await run(key, fn);
    if (res) {
      if (res.id === o.id) order.setData(res);
      else order.reload();
      history.reload();
      if (message) showToast(message);
    }
    return res;
  };

  if (order.loading && !o) return <div className="container-x py-8 text-sm text-ink-500">Đang tải đơn hàng…</div>;
  if (order.error) {
    return (
      <div className="container-x py-8">
        <p className="text-sm text-red-600">
          {order.error.status === 404 ? "Không tìm thấy đơn hàng, hoặc bạn không phải bên của đơn này." : order.error.message}
        </p>
        <Link to="/trades" className="mt-3 inline-block text-sm font-medium text-brand-600">Về Giao dịch của tôi</Link>
      </div>
    );
  }

  const can = (a) => o.allowedActions.includes(a);
  const st = ORDER_STATUS[o.status] || { label: o.status, tone: "gray" };
  const ship = o.shipments.find((s) => s.direction === "OUTBOUND" && s.status !== "VOIDED") || o.shipments[0];
  const waitingGateway = o.status === "AWAITING_PAYMENT" && o.payment.method === "PREPAID" && o.payment.status === "PENDING";

  return (
    <div className="container-x max-w-4xl py-8">
      <nav className="text-sm text-ink-500">
        <Link to="/trades" className="hover:text-brand-600">Giao dịch của tôi</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-900">Đơn {o.code}</span>
      </nav>

      {/* Đầu đơn */}
      <div className="card mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-900">Đơn {o.code}</h1>
            <div className="mt-1 text-sm text-ink-500">
              Tạo lúc {formatDateTime(o.createdAt)} · Người mua {o.buyer.fullName} · Người bán {o.seller.fullName}
              {o.negotiationId ? (
                <>
                  {" · "}
                  <Link to={`/negotiations/${o.negotiationId}`} className="text-brand-600 hover:underline">xem thương lượng</Link>
                </>
              ) : (
                " · Mua ngay"
              )}
            </div>
          </div>
          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        </div>
        {o.nextStep && (
          <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm">
            <b>{PARTY_LABEL[o.nextStep.party] || o.nextStep.party}:</b> {o.nextStep.action}
            {o.nextStep.dueAt && <> — trước <b>{formatDateTime(o.nextStep.dueAt)}</b> <Remaining at={o.nextStep.dueAt} offsetMs={offsetMs} /></>}
          </div>
        )}
        {o.status === "CANCELLED" && o.cancelReason && <p className="mt-3 text-sm text-red-700">Lý do hủy: {o.cancelReason}</p>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Máy và giá */}
          <div className="card p-5">
            <h2 className="font-semibold text-ink-900">Điện thoại</h2>
            {o.items.map((it) => {
              const c = it.snapshot?.condition || {};
              return (
                <div key={it.id} className="mt-3">
                  <Link to={`/phones/${it.listingId}`} className="font-medium text-ink-900 hover:text-brand-600">{it.title}</Link>
                  <div className="mt-1 text-xs text-ink-500">
                    Mã chi tiết {it.id.slice(0, 8)} · {it.snapshot?.variant?.color || "—"} · Ngoại hình {APPEARANCE_LABEL[c.appearance] || "—"}
                    {c.batteryHealthPct != null ? ` · Pin ${c.batteryHealthPct}%` : ""} (thông tin lúc chốt giá)
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
                    <dt className="text-ink-500">Giá rao lúc chốt</dt>
                    <dd className="text-right tabular-nums">{formatVND(it.listingPriceAtAgreement)}</dd>
                    <dt className="text-ink-500">Giá đã chốt</dt>
                    <dd className="text-right font-semibold tabular-nums">{formatVND(it.agreedPrice)}</dd>
                  </dl>
                </div>
              );
            })}
            <dl className="mt-3 grid grid-cols-2 gap-y-1.5 border-t border-gray-100 pt-3 text-sm">
              <dt className="text-ink-500">Phí vận chuyển (tách riêng)</dt>
              <dd className="text-right tabular-nums">{formatVND(o.shippingFee)}</dd>
              <dt className="font-semibold text-ink-900">Người mua trả</dt>
              <dd className="text-right font-bold tabular-nums text-brand-600">{formatVND(o.payment.amount)}</dd>
            </dl>
          </div>

          {can("SET_SHIPPING_INFO") && (
            <ShippingForm
              initial={o.shippingInfo}
              busy={busy}
              onSave={(info) => act("ship-info", () => tradeApi.setShippingInfo(o.id, info), "Đã lưu thông tin nhận hàng.")}
            />
          )}
          {!can("SET_SHIPPING_INFO") && o.shippingInfo && (
            <div className="card p-5 text-sm">
              <h2 className="font-semibold text-ink-900">Nhận hàng</h2>
              <p className="mt-2">{o.shippingInfo.recipientName} · {o.shippingInfo.recipientPhone}</p>
              <p className="text-ink-600">{o.shippingInfo.addressLine}, {o.shippingInfo.ward}, {o.shippingInfo.province}</p>
            </div>
          )}

          {can("PAY") && !waitingGateway && (
            <PaymentForm busy={busy} onPay={(m, ch) => act("pay", () => tradeApi.pay(o.id, m, ch),
              m === "COD" ? "Đã chọn COD. Đơn đã xác nhận." : "Đã tạo yêu cầu thanh toán.")} />
          )}

          {waitingGateway && (
            <SimBox title="Cổng thanh toán (mô phỏng)">
              <p>Đang chờ kết quả thanh toán {formatVND(o.payment.amount)} qua {PAYMENT_CHANNELS.find((c) => c.value === o.payment.channel)?.label}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="success" disabled={!!busy}
                  onClick={() => act("gw", () => demoApi.paymentResult(o.id, "SUCCESS"), "Thanh toán thành công (mô phỏng).")}>
                  Thanh toán thành công
                </Button>
                <Button size="sm" variant="danger" disabled={!!busy}
                  onClick={() => act("gw", () => demoApi.paymentResult(o.id, "FAILED"), "Thanh toán thất bại (mô phỏng).")}>
                  Thanh toán thất bại
                </Button>
              </div>
            </SimBox>
          )}

          {can("HANDOVER") && (
            <div className="card p-5">
              <h2 className="font-semibold text-ink-900">Gửi hàng</h2>
              <p className="mt-1 text-sm text-ink-500">Đóng gói máy và tạo vận đơn để đơn vị vận chuyển đến lấy hàng.</p>
              <Button className="mt-3" disabled={!!busy}
                onClick={() => act("handover", () => tradeApi.handover(o.id), "Đã tạo vận đơn.")}>
                {busy === "handover" ? "Đang tạo…" : "Chuẩn bị hàng và tạo vận đơn"}
              </Button>
            </div>
          )}

          {ship && <ShipmentCard ship={ship} busy={busy} act={act} />}

          {can("RECEIVE") && (
            <div className="card p-5">
              <h2 className="font-semibold text-ink-900">Đã nhận được máy?</h2>
              <p className="mt-1 text-sm text-ink-500">
                Bấm khi máy đúng mô tả. Bạn vẫn có thể yêu cầu trả hàng trong 3 ngày kể từ lúc bấm; hết hạn đơn tự hoàn tất.
              </p>
              <Button className="mt-3" variant="success" disabled={!!busy}
                onClick={() => act("receive", () => tradeApi.receive(o.id), "Đã xác nhận nhận hàng.")}>
                Đã nhận hàng
              </Button>
            </div>
          )}

          {can("VIEW_CASE") && o.openCaseId && (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
              <span>Đơn đang có hồ sơ xử lý. Đơn tạm dừng hoàn tất và chuyển tiền cho đến khi hồ sơ đóng.</span>
              <Link to={`/cases/${o.openCaseId}`}><Button size="sm">Xem hồ sơ</Button></Link>
            </div>
          )}

          {(can("OPEN_RETURN") || can("REPORT_NOT_RECEIVED") || can("OPEN_COMPLAINT")) && <IssueBox o={o} can={can} />}

          {can("CANCEL") && <CancelBox busy={busy} onCancel={(reason) => act("cancel", () => tradeApi.cancelOrder(o.id, reason), "Đã hủy đơn.")} />}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="card p-5 text-sm">
            <h2 className="font-semibold text-ink-900">Tiền</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-ink-500">Thanh toán</dt>
                <dd className="font-medium">
                  {o.payment.method ? (o.payment.method === "COD" ? "COD · " : "Trả trước · ") : ""}
                  {PAYMENT_STATUS[o.payment.status] || o.payment.status}
                  {o.payment.simulated && <span className="ml-1 text-xs text-ink-400">(mô phỏng)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Tiền cho người bán</dt>
                <dd className="font-medium">
                  {o.payout ? `${formatVND(o.payout.amount)} · ${PAYOUT_STATUS[o.payout.status] || o.payout.status}` : "Chưa phát sinh"}
                </dd>
              </div>
              {o.deliveredAt && (
                <div>
                  <dt className="text-ink-500">Giao thành công</dt>
                  <dd>{formatDateTime(o.deliveredAt)}</dd>
                </div>
              )}
              {o.receivedAt && (
                <div>
                  <dt className="text-ink-500">Người mua bấm Đã nhận hàng</dt>
                  <dd>{formatDateTime(o.receivedAt)}</dd>
                </div>
              )}
              {o.returnDeadline && (
                <div>
                  <dt className="text-ink-500">Hạn yêu cầu trả hàng</dt>
                  <dd>{formatDateTime(o.returnDeadline)}</dd>
                </div>
              )}
              {o.completedAt && (
                <div>
                  <dt className="text-ink-500">Hoàn tất</dt>
                  <dd>{formatDateTime(o.completedAt)}</dd>
                </div>
              )}
            </dl>
          </div>

          {clock && <ClockBox clock={clock} setClock={setClock} busy={busy} run={run} onDone={refresh} showToast={showToast} />}

          <div className="card p-5 text-sm">
            <h2 className="font-semibold text-ink-900">Lịch sử trạng thái</h2>
            <ol className="mt-3 space-y-3">
              {(history.data || []).map((h, i) => (
                <li key={i}>
                  <div className="font-medium text-ink-900">{ORDER_STATUS[h.to]?.label || h.to}</div>
                  <div className="text-xs text-ink-500">
                    {formatDateTime(h.at)} · {h.actor ? h.actor.fullName : "Hệ thống"}
                  </div>
                  {h.reason && <div className="text-xs text-ink-600">{h.reason}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Thời gian còn lại đến hạn theo giờ hệ thống, cập nhật mỗi phút. */
function Remaining({ at, offsetMs }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(at).getTime() - (now + offsetMs);
  if (ms <= 0) return <span className="text-ink-500">(đã đến hạn)</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return <span className="text-ink-500">(còn {h > 0 ? `${h} giờ ` : ""}{m} phút)</span>;
}

function SimBox({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-5 text-sm">
      <h2 className="font-semibold text-amber-800">{title}</h2>
      <div className="mt-1 text-ink-700">{children}</div>
    </div>
  );
}

function ShippingForm({ initial, busy, onSave }) {
  const [f, setF] = useState(
    initial || { recipientName: "", recipientPhone: "", addressLine: "", province: "", ward: "" }
  );
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <h2 className="font-semibold text-ink-900">Thông tin nhận hàng</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field id="ship-name" label="Người nhận" value={f.recipientName} onChange={set("recipientName")} />
        <Field id="ship-phone" label="Số điện thoại" value={f.recipientPhone} onChange={set("recipientPhone")} inputMode="tel" />
        <Field id="ship-addr" label="Địa chỉ" value={f.addressLine} onChange={set("addressLine")} className="sm:col-span-2" />
        <Field id="ship-ward" label="Phường/xã" value={f.ward} onChange={set("ward")} />
        <Field id="ship-province" label="Tỉnh/thành" value={f.province} onChange={set("province")} />
      </div>
      <Button type="submit" variant="outline" className="mt-4" disabled={!!busy}>
        {busy === "ship-info" ? "Đang lưu…" : initial ? "Cập nhật thông tin nhận hàng" : "Lưu thông tin nhận hàng"}
      </Button>
    </form>
  );
}

function Field({ id, label, className = "", ...props }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" {...props} />
    </div>
  );
}

function PaymentForm({ busy, onPay }) {
  const [method, setMethod] = useState("PREPAID");
  const [channel, setChannel] = useState("QR");
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-ink-900">Thanh toán</h2>
      <p className="mt-1 text-sm text-ink-500">Tiền được RePrice giữ đến khi đơn hoàn tất mới chuyển cho người bán.</p>
      <div className="mt-3 grid gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="pay-method" checked={method === "PREPAID"} onChange={() => setMethod("PREPAID")} />
          Trả trước qua
          <select className="input w-auto py-1" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={method !== "PREPAID"}>
            {PAYMENT_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pay-method" checked={method === "COD"} onChange={() => setMethod("COD")} />
          Trả tiền khi nhận hàng (COD)
        </label>
      </div>
      <Button className="mt-4" disabled={!!busy} onClick={() => onPay(method, method === "PREPAID" ? channel : undefined)}>
        {busy === "pay" ? "Đang xử lý…" : method === "COD" ? "Xác nhận COD" : "Thanh toán"}
      </Button>
    </div>
  );
}

function ShipmentCard({ ship, busy, act }) {
  const canAdvance = ["AWAITING_PICKUP", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "RETURNING"].includes(ship.status);
  return (
    <div className="card p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink-900">Vận chuyển</h2>
        <span className="font-medium">{SHIPMENT_STATUS[ship.status] || ship.status}</span>
      </div>
      <p className="mt-1 text-xs text-ink-500">
        {ship.carrier} · Mã vận đơn {ship.trackingCode}
        {ship.attempts > 1 ? ` · đã giao ${ship.attempts} lần` : ""}
      </p>
      <ol className="mt-3 space-y-2 border-l-2 border-gray-200 pl-4">
        {ship.events.map((e, i) => (
          <li key={i}>
            <div className="font-medium text-ink-900">{SHIPMENT_STATUS[e.status] || e.status}</div>
            <div className="text-xs text-ink-500">{formatDateTime(e.occurredAt)} · {e.note}</div>
          </li>
        ))}
      </ol>
      {canAdvance && (
        <SimBox title="Đơn vị vận chuyển (mô phỏng)">
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => act("ship", () => demoApi.advanceShipment(ship.id))}>
              {ship.status === "FAILED" ? "Giao lại / hoàn hàng" : "Báo mốc tiếp theo"}
            </Button>
            {ship.status === "OUT_FOR_DELIVERY" && (
              <>
                <Button size="sm" variant="danger" disabled={!!busy}
                  onClick={() => act("ship", () => demoApi.failShipment(ship.id, "DELIVERY_FAILED"))}>
                  Giao thất bại
                </Button>
                <Button size="sm" variant="danger" disabled={!!busy}
                  onClick={() => act("ship", () => demoApi.failShipment(ship.id, "RECIPIENT_REFUSED"))}>
                  Người nhận từ chối
                </Button>
              </>
            )}
          </div>
        </SimBox>
      )}
    </div>
  );
}

function CancelBox({ busy, onCancel }) {
  const [reason, setReason] = useState("");
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Hủy đơn</h2>
      <p className="mt-1 text-ink-500">Chỉ hủy được trước khi đơn vị vận chuyển lấy hàng. Nếu đã trả trước, RePrice sẽ hoàn tiền.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input flex-1" placeholder="Lý do hủy" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do hủy" />
        <Button variant="danger" disabled={!!busy || !reason.trim()} onClick={() => onCancel(reason.trim())}>Hủy đơn</Button>
      </div>
    </div>
  );
}

/** Tua thời gian (mô phỏng) để chạy các hạn 24 giờ / 3 ngày mà không phải chờ thật. */
function ClockBox({ clock, setClock, busy, run, onDone, showToast }) {
  const advance = async (hours) => {
    const res = await run("clock", () => demoApi.advanceClock(hours));
    if (res) {
      setClock(res);
      const done = (res.jobsRun || []).filter((j) => !j.endsWith(": 0"));
      showToast(`Đã tua ${hours} giờ.${done.length ? " Bộ lập lịch: " + done.join(", ") : ""}`);
      onDone();
    }
  };
  return (
    <SimBox title="Đồng hồ hệ thống (mô phỏng)">
      <p>Giờ hệ thống: <b>{formatDateTime(clock.now)}</b>{clock.offsetSeconds > 0 && ` (đã tua ${Math.round(clock.offsetSeconds / 3600)} giờ)`}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[24, 48, 72].map((h) => (
          <Button key={h} size="sm" variant="outline" disabled={!!busy} onClick={() => advance(h)}>+{h} giờ</Button>
        ))}
      </div>
    </SimBox>
  );
}

const ISSUE_TYPES = [
  { action: "OPEN_RETURN", type: "RETURN", label: "Yêu cầu trả hàng / hoàn tiền" },
  { action: "REPORT_NOT_RECEIVED", type: "NOT_RECEIVED", label: "Báo chưa nhận được hàng" },
  { action: "OPEN_COMPLAINT", type: "COMPLAINT", label: "Gửi khiếu nại" },
];

/** Mở hồ sơ trả hàng / báo chưa nhận / khiếu nại, kèm bằng chứng (UC50, UC51, UC61). */
function IssueBox({ o, can }) {
  const { showToast } = useApp();
  const navigate = useNavigate();
  const types = ISSUE_TYPES.filter((t) => can(t.action));
  const [type, setType] = useState(null);
  const [reason, setReason] = useState("NOT_AS_DESCRIBED");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const c = await caseApi.open(o.id, { type, reason: type === "NOT_RECEIVED" ? "NOT_RECEIVED" : reason, description });
      if (files.length) await caseApi.addEvidence(c.id, "Bằng chứng khi mở hồ sơ", files);
      showToast(`Đã mở hồ sơ ${c.code}.`);
      navigate(`/cases/${c.id}`);
    } catch (err) {
      if (err.details?.openCaseId) navigate(`/cases/${err.details.openCaseId}`);
      showToast(err.message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold text-ink-900">Có vấn đề với đơn?</h2>
      {o.returnDeadline && can("OPEN_RETURN") && (
        <p className="mt-1 text-ink-500">Yêu cầu trả hàng trước {formatDateTime(o.returnDeadline)}. Không có video mở hộp vẫn gửi được, có thể bổ sung sau.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {types.map((t) => (
          <Button key={t.type} size="sm" variant={type === t.type ? "primary" : "outline"} onClick={() => setType(t.type)}>{t.label}</Button>
        ))}
      </div>
      {type && (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          {type !== "NOT_RECEIVED" && (
            <div>
              <label className="label" htmlFor="issue-reason">Lý do</label>
              <select id="issue-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {Object.entries(CASE_REASON).filter(([k]) => k !== "NOT_RECEIVED").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="issue-desc">Mô tả vấn đề (khác cam kết ở đâu, phát hiện khi nào)</label>
            <textarea id="issue-desc" className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="issue-files">Ảnh / video bằng chứng (không bắt buộc)</label>
            <input id="issue-files" type="file" multiple accept="image/*,video/mp4,video/webm,application/pdf" className="block text-xs"
              onChange={(e) => setFiles([...e.target.files].slice(0, 6))} />
          </div>
          <div>
            <Button type="submit" disabled={sending || !description.trim()}>{sending ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
