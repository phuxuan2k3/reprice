import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";

const REMEMBER_KEY = "reprice_remember_account";

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const isPhone = (v) => /^(0[3|5|7|8|9]\d{8,9}|84[3|5|7|8|9]\d{8,9})$/.test(v.replace(/[\s.-]/g, ""));

/** Email hoặc số điện thoại đều chấp nhận. */
const isAccountValid = (v) => isEmail(v) || isPhone(v);

/** Lấy mã tin đăng từ đường dẫn sản phẩm,/phones/P001. */
const phoneIdFromPath = (path) => {
  const m = /^\/phones\/([^/?#]+)/.exec(path || "");
  return m ? m[1] : null;
};

/**
 * Tiếp tục hành động đã bị chặn bởi đăng nhập (mua ngay / thương lượng).
 * Chạy sau khi tài khoản đã đăng nhập nên đọc được đúng người dùng hiện tại.
 */
function ResumeAction({ action, next }) {
  const { setPendingCheckout, startNegotiation, getPhone, showToast } = useApp();
  const navigate = useNavigate();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const phoneId = phoneIdFromPath(next);
    if (action === "negotiate" && phoneId) {
      const negId = startNegotiation(phoneId);
      setPendingCheckout(null);
      if (negId) {
        showToast("Đã bắt đầu phiên thương lượng.");
        navigate(`/negotiation/${phoneId}`, { replace: true });
      } else {
        navigate(`/phones/${phoneId}`, { replace: true });
      }
    } else if (action === "buy" && phoneId) {
      const phone = getPhone(phoneId);
      setPendingCheckout({
        phoneId,
        price: phone?.price ?? 0,
        negotiationId: null,
        intent: "buy",
      });
      navigate("/orders/create", { replace: true });
    } else {
      navigate(next && next !== "/login" ? next : "/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="container-x py-16 text-center text-ink-500">Đang tiếp tục…</div>
  );
}

export default function LoginPage() {
  const { user, login, register, showToast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const action = params.get("action");
  const requiresLogin = params.get("message") === "login-required";

  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  /** Hành động cần tiếp tục sau khi đăng nhập (mua ngay / thương lượng). */
  const [resumeAction, setResumeAction] = useState(null);

  /* Đăng nhập */
  const [account, setAccount] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loginErrors, setLoginErrors] = useState({});

  /* Đăng ký */
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regErrors, setRegErrors] = useState({});

  // Đã đăng nhập -> tiếp tục hành động đang chờ (nếu có), nếu không về đích.
  if (user) {
    if (resumeAction) return <ResumeAction action={resumeAction} next={next} />;
    return <Navigate to={next === "/login" ? "/" : next} replace />;
  }

  const inputError = (msg) => (
    <p className="mt-1.5 text-xs font-medium text-red-600">{msg}</p>
  );

  /* ------------------------------- Đăng nhập ------------------------------- */
  const onLogin = (e) => {
    e.preventDefault();
    const errs = {};
    if (!account.trim()) errs.account = "Vui lòng nhập Email hoặc số điện thoại.";
    else if (!isAccountValid(account))
      errs.account = "Email hoặc số điện thoại chưa đúng định dạng.";
    if (!password) errs.password = "Vui lòng nhập mật khẩu.";
    else if (password.length < 6) errs.password = "Mật khẩu phải có ít nhất 6 ký tự.";
    setLoginErrors(errs);
    if (Object.keys(errs).length > 0) return;

    login(account.trim(), "buyer");
    if (remember) {
      try {
        localStorage.setItem(REMEMBER_KEY, account.trim());
      } catch {
        /* bỏ qua */
      }
    } else {
      try {
        localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* bỏ qua */
      }
    }
    showToast(`Đăng nhập thành công. Chào mừng bạn.`);
    // Nếu có hành động đang chờ (mua ngay / thương lượng) thì để màn hình
    // ResumeAction chạy tiếp sau khi người dùng đã được gán.
    if (action === "buy" || action === "negotiate") {
      setResumeAction(action);
      return;
    }
    navigate(next === "/login" ? "/" : next, { replace: true });
  };

  /* ------------------------------- Đăng ký -------------------------------- */
  const onRegister = (e) => {
    e.preventDefault();
    const errs = {};
    if (!fullName.trim()) errs.fullName = "Vui lòng nhập họ tên.";
    else if (fullName.trim().length < 2) errs.fullName = "Họ tên phải có ít nhất 2 ký tự.";
    if (!email.trim()) errs.email = "Vui lòng nhập Email.";
    else if (!isEmail(email)) errs.email = "Email chưa đúng định dạng (VD: name@gmail.com).";
    if (!phone.trim()) errs.phone = "Vui lòng nhập số điện thoại.";
    else if (!isPhone(phone)) errs.phone = "Số điện thoại chưa đúng định dạng (VD: 0909 123 456).";
    if (!regPassword) errs.regPassword = "Vui lòng nhập mật khẩu.";
    else if (regPassword.length < 6) errs.regPassword = "Mật khẩu phải có ít nhất 6 ký tự.";
    if (!confirmPassword) errs.confirmPassword = "Vui lòng xác nhận mật khẩu.";
    else if (confirmPassword !== regPassword) errs.confirmPassword = "Xác nhận mật khẩu không khớp.";
    setRegErrors(errs);
    if (Object.keys(errs).length > 0) return;

    register({ name: fullName.trim(), email: email.trim(), phone: phone.trim() });
    showToast("Đăng ký tài khoản thành công. Vui lòng đăng nhập.");
    setMode("login");
    setAccount(email.trim());
    setPassword("");
    setLoginErrors({});
  };

  const onMockSocial = (provider) => {
    showToast(`Đăng nhập bằng ${provider} chưa được hỗ trợ — vui lòng dùng form bên dưới.`, "error");
  };

  const togglePassword = (field, showField) => {
    if (field === "login") setShowPassword((v) => !v);
    else setShowRegPassword((v) => !v);
    void showField;
  };

  const passwordField = (value, setValue, show, toggle, error, id, placeholder) => (
    <div>
      <label className="label" htmlFor={id}>
        Mật khẩu
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          className="input pr-11"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
        >
          {show ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {error && inputError(error)}
    </div>
  );

  return (
    <div className="container-x flex py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="card p-8">
          {/* Logo + tiêu đề */}
          <div className="text-center">
            <Link to="/" className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-2xl font-extrabold text-white">
              R
            </Link>
            <h1 className="mt-4 text-2xl font-bold text-ink-900">
              {mode === "login" ? "Đăng nhập" : "Đăng ký tài khoản"}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {mode === "login"
                ? "Đăng nhập để mua bán và thương lượng trên RePrice."
                : "Tạo tài khoản để bắt đầu mua bán điện thoại cũ."}
            </p>
          </div>

          {/* Thông báo yêu cầu đăng nhập */}
          {requiresLogin && (
            <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">
              Vui lòng đăng nhập để tiếp tục.
            </div>
          )}

          {/* Nút mạng xã hội (mô phỏng) */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onMockSocial("Google")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-gray-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
              Google
            </button>
            <button
              type="button"
              onClick={() => onMockSocial("Facebook")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-gray-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z" />
              </svg>
              Facebook
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" aria-hidden />
            <span className="text-xs text-ink-400">hoặc</span>
            <span className="h-px flex-1 bg-gray-200" aria-hidden />
          </div>

          {mode === "login" ? (
            /* ===================== FORM ĐĂNG NHẬP ===================== */
            <form onSubmit={onLogin} className="space-y-4" noValidate>
              <div>
                <label className="label" htmlFor="login-account">
                  Email hoặc số điện thoại
                </label>
                <input
                  id="login-account"
                  className="input"
                  placeholder="VD: name@gmail.com hoặc 0909 123 456"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  autoComplete="username"
                />
                {loginErrors.account && inputError(loginErrors.account)}
              </div>

              {passwordField(password, setPassword, showPassword, () => togglePassword("login"), loginErrors.password, "login-password", "Nhập mật khẩu")}

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-brand-500"
                  />
                  Nhớ tài khoản
                </label>
                <button
                  type="button"
                  onClick={() => showToast("Chức năng khôi phục mật khẩu chưa được hỗ trợ.", "error")}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Quên mật khẩu?
                </button>
              </div>

              <Button type="submit" size="lg" className="w-full">
                Đăng nhập
              </Button>
            </form>
          ) : (
            /* ===================== FORM ĐĂNG KÝ ===================== */
            <form onSubmit={onRegister} className="space-y-4" noValidate>
              <div>
                <label className="label" htmlFor="reg-name">Họ tên</label>
                <input
                  id="reg-name"
                  className="input"
                  placeholder="VD: Nguyễn Minh"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                {regErrors.fullName && inputError(regErrors.fullName)}
              </div>
              <div>
                <label className="label" htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  className="input"
                  placeholder="VD: name@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                {regErrors.email && inputError(regErrors.email)}
              </div>
              <div>
                <label className="label" htmlFor="reg-phone">Số điện thoại</label>
                <input
                  id="reg-phone"
                  className="input"
                  placeholder="VD: 0909 123 456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
                {regErrors.phone && inputError(regErrors.phone)}
              </div>
              {passwordField(regPassword, setRegPassword, showRegPassword, () => togglePassword("register"), regErrors.regPassword, "reg-password", "Tối thiểu 6 ký tự")}
              {passwordField(confirmPassword, setConfirmPassword, showRegPassword, () => togglePassword("register"), regErrors.confirmPassword, "reg-confirm", "Nhập lại mật khẩu")}
              <Button type="submit" size="lg" className="w-full">
                Đăng ký
              </Button>
            </form>
          )}

          {/* Chuyển đổi màn hình — mỗi thời điểm chỉ hiện 1 form */}
          <p className="mt-6 text-center text-sm text-ink-500">
            {mode === "login" ? (
              <>
                Chưa có tài khoản?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setRegErrors({});
                  }}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Đăng ký
                </button>
              </>
            ) : (
              <>
                Đã có tài khoản?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setLoginErrors({});
                  }}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Đăng nhập
                </button>
              </>
            )}
          </p>

          <p className="mt-5 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-ink-500">
            Đây là bản demo — thông tin đăng nhập chỉ dùng để minh họa, không có
            xác thực thật. Mọi thao tác đều an toàn để thử nghiệm.
          </p>
        </div>

        <Link to="/" className="mt-4 block text-center text-sm font-medium text-ink-500 hover:text-brand-600">
          ← Về trang chủ
        </Link>
      </div>
    </div>
  );
}
