import { useCallback, useEffect, useState } from "react";

/**
 * Tải một tài nguyên API và cho phép thay dữ liệu sau mỗi thao tác.
 * `deps` đổi (ví dụ id hoặc phiên đăng nhập) thì tải lại.
 */
export function useResource(load, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    load()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data) => setState({ data, loading: false, error: null }), []);
  return { ...state, reload, setData };
}

/**
 * Chạy một thao tác (gọi API) với trạng thái đang chạy, và báo lỗi qua `onError`.
 * Trả về kết quả của thao tác, hoặc undefined khi lỗi.
 */
export function useAction(onError) {
  const [busy, setBusy] = useState(null);
  const run = useCallback(
    async (key, fn) => {
      setBusy(key);
      try {
        return await fn();
      } catch (e) {
        onError(e);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [onError]
  );
  return { busy, run };
}
