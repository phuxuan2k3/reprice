.PHONY: run test vet build

# Đọc .env nếu có (copy từ .env.example).
ifneq (,$(wildcard .env))
include .env
export
endif

run:
	go run ./cmd/api

test:
	go test ./...

vet:
	go vet ./...

build:
	go build -o bin/api ./cmd/api
