#!/bin/bash

# Скрипт для запуска FastAPI с самоподписанным сертификатом

echo "🚀 Запуск VK Ads Service MVP с HTTPS..."
echo ""
echo "📍 Доступно на: https://localhost:8000"
echo "📚 Swagger документация: https://localhost:8000/docs"
echo ""
echo "⚠️  Браузер пожалуется на сертификат — это нормально."
echo "   Жми 'Advanced' → 'Proceed to localhost (unsafe)'"
echo ""

uvicorn app.main:app \
  --ssl-keyfile=key.pem \
  --ssl-certfile=cert.pem \
  --host=127.0.0.1 \
  --port=8000 \
  --reload
