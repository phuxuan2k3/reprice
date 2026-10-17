# Một image chạy cả RePrice: backend Go phục vụ API ở /api/v1 và bản build React ở mọi đường dẫn khác.
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM golang:1.25-alpine AS api
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && mkdir -p /out/uploads

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /out/api /app/api
COPY --from=web /web/dist /app/web
# Ảnh tải lên. Khi deploy, gắn ổ đĩa bền vào /data/uploads (image chạy bằng user nonroot 65532).
COPY --from=api --chown=65532:65532 /out/uploads /data/uploads
ENV WEB_DIR=/app/web UPLOAD_DIR=/data/uploads
EXPOSE 8080
ENTRYPOINT ["/app/api"]
