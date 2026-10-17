import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ROLE_LABEL } from "../data/users";
import Button from "../components/Button";
import DataBadge from "../components/DataBadge";

/**
 * CÔNG CỤ QUẢN TRỊ DEMO.
 *
 * Khu vực riêng cho người quản lý (QTV) để:
 *  - bật/tắt khả năng chuyển vai trò của phiên demo (mô phỏng);
 *  - xem nhật ký chuyển vai trò trong phiên hiện tại;
 *  - xem kịch bản trình diễn xuyên suốt;
 *  - đặt lại dữ liệu demo (có xác nhận rõ ràng) — không ảnh hưởng mã nguồn.
 *
 * Toàn bộ dữ liệu là MÔ PHỎNG, không phải giao dịch thật và không thay thế
 * xác thực/phân quyền của hệ thống thật.
 */

const SCENARIO = [
  "Người bán đăng nhập và có một tin đăng điện thoại hợp lệ (P001).",
  "Người mua đăng nhập, mở đúng điện thoại và gửi đề nghị giá để thương lượng.",
  "Người bán trả lời đề nghị; hai bên thống nhất giá.",
  "Người mua tạo đơn hàng từ kết quả thương lượng.",
  "Người mua mở “Tài khoản của tôi” và thấy đơn vừa tạo.",
  "Chuyển sang Người bán: thấy đúng mã đơn đó trong tab “Đơn bán”.",
  "Người bán xác nhận đơn; chuyển lại Người mua thấy trạng thái đã cập nhật.",
  "Người mua chọn hình thức thanh toán (QR mô phỏng) hoặc COD rồi xác nhận.",
  "Người bán “Đã chuẩn bị hàng” và tạo vận đơn (sinh mã vận đơn).",
  "Người mua theo dõi đúng mã vận đơn và hành trình giao hàng.",
  "QTV mở “Quản lý đơn” / “Hàng đợi duyệt giá”: thấy đúng đơn, thanh toán, vận đơn.",
  "Đẩy các bước vận chuyển tới “Giao hàng thành công”.",
  "Trong 72 giờ: người mua có thể mở hồ sơ trả hàng/hoàn tiền hoặc khiếu nại.",
  "QTV kiểm tra điều kiện và duyệt giao dịch → vào dải giá tham khảo.",
  "Dashboard giá cập nhật theo giao dịch đã duyệt trong cùng đơn hàng đó.",
  "(Tùy chọn) Thực hành nhánh khiếu nại / trả hàng / hoàn tiền trên cùng đơn.",
];

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function AdminToolsPage() {
  const {
    user,
    loginAs,
    demoMode,
    setDemoMode,
    roleSwitchLog,
    resetDemoState,
    showToast,
    demoRestored,
  } = useApp();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);

  const isManager = user?.role === "manager";

  const doReset = () => {
    resetDemoState();
    setConfirmOpen(false);
    showToast("Đã đặt lại dữ liệu demo về trạng thái ban đầu.");
    navigate("/");
  };

  const toggleDemoMode = () => {
    const next = !demoMode;
    setDemoMode(next);
    showToast(
      next
        ? "Đã bật chuyển vai trò cho phiên demo."
        : "Đã tắt chuyển vai trò cho phiên demo."
    );
  };

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            Công cụ quản trị demo
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Khu vực riêng của người quản lý để điều khiển phiên trình diễn. Không
            chiếm diện tích giao diện người mua / người bán.
          </p>
        </div>
        <DataBadge />
      </div>

      {!isManager && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bạn đang xem với quyền{" "}
          <strong>{user ? "không phải Người quản lý" : "khách"}</strong>. Công cụ
          chỉ thao tác được khi là Người quản lý.{" "}
          <button
            onClick={() => loginAs("manager")}
            className="font-bold underline hover:no-underline"
          >
            Đăng nhập nhanh với vai trò Người quản lý
          </button>
        </div>
      )}

      {demoRestored && (
        <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-ink-500">
          Phiên này được khôi phục từ dữ liệu demo đã lưu trên trình duyệt.
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Phiên demo & chuyển vai trò */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Phiên demo &amp; chuyển vai trò
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Chuyển vai trò là cơ chế <strong>MÔ PHỎNG</strong> để trình diễn nhiều
            vai trên cùng một nguồn dữ liệu. Đây không phải xác thực thật: mọi
            hành động vẫn được kiểm tra theo vai trò đang đăng nhập.
          </p>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                Cho phép chuyển vai trò
              </p>
              <p className="text-xs text-ink-500">
                {demoMode
                  ? "Đang bật — hiển thị bộ chuyển vai trò trong menu tài khoản."
                  : "Đang tắt — chỉ đăng nhập/đăng xuất qua trang đăng nhập."}
              </p>
            </div>
            <Button
              variant={demoMode ? "outline" : "primary"}
              size="sm"
              onClick={toggleDemoMode}
              disabled={!isManager}
            >
              {demoMode ? "Tắt" : "Bật"}
            </Button>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Nhật ký chuyển vai trò (phiên hiện tại)
            </p>
            {roleSwitchLog.length === 0 ? (
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-ink-500">
                Chưa có lần chuyển vai trò nào trong phiên này.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                {[...roleSwitchLog].reverse().map((log, i) => (
                  <li
                    key={`${log.at}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-ink-700"
                  >
                    <span>
                      {log.by}: <strong>{ROLE_LABEL[log.from] || "Khách"}</strong>{" "}
                      → <strong>{ROLE_LABEL[log.to] || "Khách"}</strong>
                    </span>
                    <span className="text-ink-400">{fmtDateTime(log.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-ink-400">
              Nhật ký chỉ lưu trong phiên trình duyệt hiện tại (mô phỏng).
            </p>
          </div>
        </section>

        {/* Kịch bản + dữ liệu demo */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Kịch bản &amp; dữ liệu demo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Xem kịch bản trình diễn xuyên suốt, hoặc đặt lại toàn bộ dữ liệu demo về
            trạng thái ban đầu.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setScenarioOpen(true)}>
              Xem kịch bản demo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/demo/price-cases")}
            >
              Demo 3 trường hợp giá
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/manager/dashboard")}>
              Dashboard giá tham khảo
            </Button>
          </div>

          <div className="mt-4 rounded-lg border border-red-200 bg-red-50/60 p-4">
            <p className="text-sm font-semibold text-red-700">Đặt lại dữ liệu demo</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700/90">
              Xóa các đơn hàng / thương lượng / hồ sơ / giao dịch đã tạo trong phiên
              demo và đưa dữ liệu mẫu trở lại. Không ảnh hưởng mã nguồn. Thao tác này
              cần xác nhận trước khi thực hiện.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={() => setConfirmOpen(true)}
              disabled={!isManager}
            >
              Đặt lại dữ liệu demo
            </Button>
          </div>
        </section>
      </div>

      {/* Hộp thoại xác nhận đặt lại */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận đặt lại dữ liệu demo"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-ink-900">
              Đặt lại toàn bộ dữ liệu demo?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Các đơn hàng, thương lượng, hồ sơ trả hàng/hoàn tiền và giao dịch bạn đã
              tạo trong phiên demo sẽ bị xóa và thay bằng dữ liệu mẫu. Không thể hoàn
              tác.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Hủy
              </Button>
              <Button variant="danger" onClick={doReset}>
                Xác nhận đặt lại
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hộp thoại kịch bản */}
      {scenarioOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Kịch bản demo"
          onClick={() => setScenarioOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink-900">
                  Kịch bản demo xuyên suốt
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Dùng một mã đơn duy nhất từ đầu đến cuối. Đổi vai trò trong menu tài
                  khoản — dữ liệu được giữ nguyên.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScenarioOpen(false)}
                className="rounded-lg px-2 py-1 text-ink-500 hover:bg-gray-100"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-700">
              {SCENARIO.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              Lưu ý: thanh toán QR, vận đơn và hành trình giao hàng đều là MÔ PHỎNG.
              Trạng thái demo được lưu trên trình duyệt này; nút “Đặt lại dữ liệu demo”
              đưa mọi thứ về ban đầu để tập lại.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
