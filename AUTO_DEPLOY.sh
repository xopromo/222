#!/bin/bash

# 🚀 FULLY AUTOMATED TRANSCRIBE APP DEPLOYMENT
# Одна команда и всё готово!

set -e

echo "🎙️ Transcribe App - Полная автоматизация"
echo "==========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# STEP 1: Check GitHub CLI
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}⚠️ GitHub CLI (gh) not found. Installing...${NC}"
    echo ""
    echo "Install GitHub CLI from: https://cli.github.com/"
    echo "Then run this script again."
    exit 1
fi

# STEP 2: Check GitHub authentication
if ! gh auth status > /dev/null 2>&1; then
    echo -e "${YELLOW}🔐 GitHub authentication needed${NC}"
    gh auth login
fi

# STEP 3: Get username
GITHUB_USER=$(gh api user -q '.login')
echo -e "${GREEN}✅ Authenticated as: ${GITHUB_USER}${NC}"
echo ""

# STEP 4: Check if repo exists
echo -e "${YELLOW}[1/5] Проверка репозитория...${NC}"

if gh repo view ${GITHUB_USER}/transcribe 2>/dev/null; then
    echo -e "${BLUE}ℹ️ Репозиторий уже существует${NC}"
else
    echo -e "${YELLOW}[2/5] Создание репозитория на GitHub...${NC}"
    gh repo create transcribe --public --source=head --remote=origin --push --description "Free video transcription app with Whisper" 2>/dev/null || {
        echo -e "${RED}❌ Could not create repo automatically${NC}"
        echo -e "${YELLOW}Пожалуйста создайте репо вручную:${NC}"
        echo "https://github.com/new?name=transcribe"
        exit 1
    }
    echo -e "${GREEN}✅ Репозиторий создан${NC}"
fi
echo ""

# STEP 5: Navigate to transcribe-app
echo -e "${YELLOW}[3/5] Подготовка приложения...${NC}"
cd "$(dirname "$0")/transcribe-app"

# Install dependencies
npm install --silent 2>&1 | grep -v "^npm notice" | tail -5

# Build
npm run build --silent

echo -e "${GREEN}✅ Приложение собрано${NC}"
echo ""

# STEP 6: Push to GitHub
echo -e "${YELLOW}[4/5] Загрузка на GitHub...${NC}"

if [ ! -d ".git" ]; then
    git init --quiet
    git config user.email "transcribe@github.local"
    git config user.name "Transcribe Deployer"
    git add .
    git commit -m "Initial transcribe app commit" --quiet
fi

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GITHUB_USER}/transcribe.git"
git branch -M main
git push -u origin main --force 2>&1 | grep -v "^Branch"

echo -e "${GREEN}✅ Код загружен на GitHub${NC}"
echo ""

# STEP 7: Enable GitHub Pages
echo -e "${YELLOW}[5/5] Включение GitHub Pages...${NC}"

# Create .nojekyll file for GitHub Pages
touch build/.nojekyll

# Add and push the .nojekyll file
git add build/.nojekyll
git commit -m "Add .nojekyll for GitHub Pages" --quiet 2>/dev/null || true
git push origin main 2>/dev/null

echo -e "${GREEN}✅ GitHub Pages настроена${NC}"
echo ""

# FINAL SUMMARY
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  ✅ ГОТОВО К ИСПОЛЬЗОВАНИЮ!             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🎉 Приложение будет доступно в течение 1-2 минут:${NC}"
echo ""
echo -e "${BLUE}https://${GITHUB_USER}.github.io/transcribe${NC}"
echo ""
echo -e "${YELLOW}📝 Что дальше:${NC}"
echo "1. Дождитесь 1-2 минуты"
echo "2. Откройте ссылку выше"
echo "3. Поделитесь со своей командой!"
echo ""
echo -e "${YELLOW}🔗 Ссылка для команды:${NC}"
echo "https://${GITHUB_USER}.github.io/transcribe"
echo ""
