import { useEffect, useState } from "react";
import { listingsApi, tradeApi } from "./client";
import { toUiPhone, toUiReference } from "./adapters";

/**
 * Toàn bộ tin đang bán từ backend (tối đa 100 tin, đủ cho demo); trang danh sách
 * vẫn lọc và sắp xếp phía trình duyệt như trước.
 */
export function useApiListings() {
  const [state, setState] = useState({ listings: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    listingsApi
      .list({ pageSize: 100 })
      .then((res) => alive && setState({ listings: res.items.map(toUiPhone), loading: false, error: null }))
      .catch((error) => alive && setState({ listings: [], loading: false, error }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/**
 * Một tin + giá tham khảo + dữ liệu so sánh của dải giá. `reloadKey` đổi (ví dụ khi
 * đổi vai trò) thì tải lại để backend trả đúng nhãn "Giá đang rao" / "Giá bạn nhập".
 */
export function useApiListing(id, reloadKey) {
  const [state, setState] = useState({ id, phone: null, reference: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    // Đổi sang tin khác: bỏ dữ liệu cũ để không hiện nhầm giá tham khảo/lời nhắc của tin trước.
    setState((s) =>
      s.id === id
        ? { ...s, loading: true, error: null }
        : { id, phone: null, reference: null, loading: true, error: null }
    );
    (async () => {
      const [listing, ref] = await Promise.all([listingsApi.get(id), listingsApi.referencePrice(id)]);
      let prices = [];
      const versionId = ref.usedPrice?.versionId;
      if (versionId) {
        const range = await listingsApi.priceRange(versionId);
        prices = range.prices.map((p) => p.price);
      }
      return { phone: toUiPhone(listing), reference: toUiReference(ref, prices) };
    })()
      .then((data) => alive && setState({ id, ...data, loading: false, error: null }))
      .catch((error) => alive && setState({ id, phone: null, reference: null, loading: false, error }));
    return () => {
      alive = false;
    };
  }, [id, reloadKey]);
  return state;
}

/** Phát khi người dùng đọc thông báo, để chuông trên header đếm lại ngay. */
export const NOTIFICATIONS_CHANGED = "reprice:notifications-changed";

/** Số thông báo chưa đọc từ backend, cập nhật mỗi 20 giây và khi có thay đổi. */
export function useUnreadNotifications(enabled, session) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = () =>
      tradeApi
        .notifications()
        .then((r) => alive && setCount(r.unreadCount))
        .catch(() => {});
    load();
    const t = setInterval(load, 20000);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [enabled, session]);
  return count;
}

/**
 * Giá tham khảo công khai cho trang chủ: lấy dải GĐ2 của tối đa 8 tin đang bán, giữ mỗi
 * nhóm máy một tin có dải giá (RANGE), tối đa 4 thẻ.
 */
export function usePublicReferences(listings) {
  const [items, setItems] = useState([]);
  const ids = listings.slice(0, 8).map((p) => p.id).join(",");
  useEffect(() => {
    if (!ids) return;
    let alive = true;
    const phones = listings.slice(0, 8);
    Promise.all(phones.map((p) => listingsApi.referencePrice(p.id).catch(() => null))).then((refs) => {
      if (!alive) return;
      const seen = new Set();
      const out = [];
      refs.forEach((ref, i) => {
        const used = ref?.usedPrice;
        if (!used || (used.status !== "RANGE" && used.status !== "SINGLE_PRICE")) return;
        const key = `${used.group.variantId}|${used.group.conditionKey}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ phone: phones[i], reference: toUiReference(ref) });
      });
      setItems(out.slice(0, 4));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return items;
}
