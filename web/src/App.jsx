import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import PhonesPage from "./pages/PhonesPage";
import PhoneDetailPage from "./pages/PhoneDetailPage";
import LoginPage from "./pages/LoginPage";
import CreateListingPage from "./pages/CreateListingPage";
import SellerListingsPage from "./pages/SellerListingsPage";
import NegotiationPage from "./pages/NegotiationPage";
import SellerNegotiationsPage from "./pages/SellerNegotiationsPage";
import SellerNegotiationPage from "./pages/SellerNegotiationPage";
import CreateOrderPage from "./pages/CreateOrderPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import SupportCasePage from "./pages/SupportCasePage";
import TransactionConfirmPage from "./pages/TransactionConfirmPage";
import AdminToolsPage from "./pages/AdminToolsPage";
import PriceDemoPage from "./pages/PriceDemoPage";
import InfoPage from "./pages/InfoPage";
import AccountPage from "./pages/AccountPage";
import ReviewSellerPage from "./pages/ReviewSellerPage";
import NotFoundPage from "./pages/NotFoundPage";
import TradeNegotiationPage from "./pages/api/TradeNegotiationPage";
import TradeOrderPage from "./pages/api/TradeOrderPage";
import MyTradesPage from "./pages/api/MyTradesPage";
import AdminDashboardPage from "./pages/api/AdminDashboardPage";
import AdminReferencePage from "./pages/api/AdminReferencePage";
import AdminCasesPage from "./pages/api/AdminCasesPage";
import TradeCasePage from "./pages/api/TradeCasePage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Đơn từ backend có id dạng uuid; đơn mô phỏng cũ (DH-…) vẫn dùng trang cũ. */
function OrderRoute() {
  const { id } = useParams();
  return UUID_RE.test(id) ? <TradeOrderPage /> : <OrderDetailPage />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          {/* 1. Trang chủ */}
          <Route path="/" element={<HomePage />} />
          {/* 2. Danh sách điện thoại / tìm kiếm */}
          <Route path="/phones" element={<PhonesPage />} />
          {/* 3. Chi tiết điện thoại */}
          <Route path="/phones/:id" element={<PhoneDetailPage />} />
          {/* 4. Đăng nhập / đăng ký */}
          <Route path="/login" element={<LoginPage />} />
          {/* 5. Đăng bán điện thoại */}
          <Route path="/seller/create-listing" element={<CreateListingPage />} />
          {/* 6. Quản lý tin đăng */}
          <Route path="/seller/listings" element={<SellerListingsPage />} />

          <Route path="/seller/negotiations" element={<SellerNegotiationsPage />} />
          <Route path="/seller/negotiations/:negId" element={<SellerNegotiationPage />} />
          {/* 7. Thương lượng giá */}
          <Route path="/negotiation/:id" element={<NegotiationPage />} />
          {/* 8. Xác nhận tạo đơn */}
          <Route path="/orders/create" element={<CreateOrderPage />} />
          {/* 9. Theo dõi đơn hàng */}
          <Route path="/orders/:id" element={<OrderRoute />} />
          {/* Giao dịch qua backend */}
          <Route path="/trades" element={<MyTradesPage />} />
          <Route path="/negotiations/:id" element={<TradeNegotiationPage />} />
          <Route path="/cases/:id" element={<TradeCasePage />} />
          <Route path="/orders/:id/cases/:caseId" element={<SupportCasePage />} />
          {/* 10. Xác nhận giao dịch */}
          <Route path="/transactions/:id" element={<TransactionConfirmPage />} />
          {/* Tài khoản của tôi (Người mua) */}
          <Route path="/account" element={<AccountPage />} />
          {/* Đánh giá người bán sau khi đơn hoàn tất */}
          <Route path="/orders/:id/review" element={<ReviewSellerPage />} />
          {/* Trung tâm thông báo */}
          {/* Thông báo thật nằm ở Giao dịch của tôi */}
          <Route path="/notifications" element={<Navigate to="/trades?tab=notifications" replace />} />
          {/* 11. Quản lý và kiểm tra dữ liệu giao dịch */}
          <Route path="/manager/transactions" element={<AdminReferencePage />} />
          {/* 11b. Quản lý đơn hàng & vận chuyển */}
          <Route path="/manager/orders" element={<AdminCasesPage />} />
          {/* 12. Dashboard giá tham khảo */}
          <Route path="/manager/dashboard" element={<AdminDashboardPage />} />
          {/* Công cụ quản trị demo (chỉ Người quản lý) */}
          <Route path="/manager/tools" element={<AdminToolsPage />} />
          <Route path="/demo/price-cases" element={<PriceDemoPage />} />
          {/* Trang nội dung (footer) */}
          <Route path="/about" element={<InfoPage />} />
          <Route path="/guide" element={<InfoPage />} />
          <Route path="/faq" element={<InfoPage />} />
          <Route path="/terms" element={<InfoPage />} />
          <Route path="/privacy" element={<InfoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
