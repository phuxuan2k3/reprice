import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Gọi API cùng origin như khi deploy; dev server chuyển tiếp sang backend Go.
    proxy: {
      "/api": process.env.VITE_PROXY_TARGET || "http://localhost:8080",
    },
  },
});
