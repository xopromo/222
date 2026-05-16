#!/bin/bash

# 🚀 TRANSCRIBE APP - РАЗВЁРТЫВАНИЕ НА GITHUB PAGES
# Одна команда - всё готово!

set -e

echo "🎙️ Transcribe App - Развёртывание"
echo "===================================="
echo ""

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}[1/3] Сборка приложения...${NC}"
cd /home/user/222/transcribe-app
npm install --silent 2>&1 | tail -1
npm run build --silent 2>&1 | tail -1

echo -e "${GREEN}✅ Собрано${NC}"
echo ""

echo -e "${YELLOW}[2/3] Копирование в docs/transcribe...${NC}"
mkdir -p /home/user/222/docs/transcribe
cp -r /home/user/222/transcribe-app/build/* /home/user/222/docs/transcribe/
touch /home/user/222/docs/.nojekyll
echo -e "${GREEN}✅ Скопировано${NC}"
echo ""

echo -e "${YELLOW}[3/3] Загрузка на GitHub...${NC}"
cd /home/user/222

git add docs/transcribe/ transcribe-app/ 2>/dev/null || true
git commit -m "Update transcribe app deployment" 2>/dev/null || true
git push origin claude/new-task-fBlY1

echo -e "${GREEN}✅ Загружено${NC}"
echo ""

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    ✅ ГОТОВО!                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🎉 Приложение доступно по ссылке:${NC}"
echo ""
echo -e "${BLUE}https://xopromo.github.io/222/transcribe${NC}"
echo ""
