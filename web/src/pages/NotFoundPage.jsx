import { Link } from "react-router-dom";
import Button from "../components/Button";

export default function NotFoundPage() {
  return (
    <div className="container-x flex py-24">
      <div className="mx-auto max-w-md text-center">
        <div className="text-7xl font-extrabold text-brand-500">404</div>
        <h1 className="mt-4 text-2xl font-bold text-ink-900">
          Không tìm thấy trang
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Trang bạn truy cập không tồn tại hoặc đã bị xoá.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button size="lg">Về trang chủ</Button>
        </Link>
      </div>
    </div>
  );
}
