# MVP Архитектура — 1-2 недели разработки

Минимально жизнеспособная версия сервиса. Доказывает концепцию: многопользовательский доступ к данным одного кабинета VK.

---

## 1. Из полной архитектуры берём 70% ценности

### Включаем в MVP ✅

- PostgreSQL база данных (основные таблицы)
- JWT авторизация (email/пароль)
- Ручная привязка VK-токена (без OAuth)
- **Ручная синхронизация** — кнопка "Синхронизировать сейчас"
- Чтение данных из локальной БД (быстро)
- Статистика за последний день
- Базовые роли: owner / viewer
- Многопользовательский доступ к одному кабинету

### Пропускаем (добавим позже) ❌

- Celery + Redis (фоновая синхронизация)
- OAuth flow (копирование токена вручную)
- Пул токенов (один токен на кабинет)
- Token auto-refresh (меняем вручную когда истечёт)
- Полная история статистики (только сегодня)
- Pagination по 200 объектов (добавим когда будут большие кабинеты)
- Мониторинг и алерты
- Docker Compose (PostgreSQL локально)

---

## 2. База данных (PostgreSQL)

Урезанная схема без излишних таблиц:

```sql
-- Пользователи сервиса
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Рекламные кабинеты ВК
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vk_account_id INTEGER UNIQUE NOT NULL,  -- ID в VK
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Связь: какие пользователи имеют доступ к какому кабинету
CREATE TABLE user_accounts (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'viewer',  -- 'owner' или 'viewer'
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, account_id)
);

-- VK токены (один на кабинет, но можно обновлять)
CREATE TABLE vk_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,  -- зашифрованный
  expires_at TIMESTAMP,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Кампании (синхронизируются из VK)
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  vk_campaign_id INTEGER NOT NULL,
  name VARCHAR(255),
  status VARCHAR(50),  -- 'running', 'paused', 'deleted'
  day_limit DECIMAL(15, 2),
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (account_id, vk_campaign_id)
);

-- Объявления (синхронизируются из VK)
CREATE TABLE ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  vk_ad_id INTEGER NOT NULL,
  name VARCHAR(255),
  status VARCHAR(50),
  cpc DECIMAL(15, 2),
  cpm DECIMAL(15, 2),
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (account_id, vk_ad_id)
);

-- Статистика (только за сегодня + вчера для MVP)
CREATE TABLE statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  ad_id UUID REFERENCES ads(id),
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spent DECIMAL(15, 2) DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (account_id, campaign_id, ad_id, date)
);

-- Индексы
CREATE INDEX idx_accounts_vk_id ON accounts(vk_account_id);
CREATE INDEX idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX idx_user_accounts_account_id ON user_accounts(account_id);
CREATE INDEX idx_campaigns_account_id ON campaigns(account_id);
CREATE INDEX idx_ads_account_id ON ads(account_id);
CREATE INDEX idx_statistics_account_id ON statistics(account_id);
CREATE INDEX idx_statistics_date ON statistics(date);
```

---

## 3. Структура кода MVP

```
app/
├── core/
│   ├── __init__.py
│   ├── config.py              — Settings (DATABASE_URL, SECRET_KEY)
│   ├── security.py            — JWT, password hashing
│   └── db.py                  — SQLAlchemy session
│
├── models/
│   ├── __init__.py
│   ├── user.py                — User ORM model
│   ├── account.py             — Account ORM model
│   ├── campaign.py            — Campaign ORM model
│   ├── ad.py                  — Ad ORM model
│   └── statistic.py           — Statistic ORM model
│
├── schemas/
│   ├── __init__.py
│   ├── user.py                — UserCreate, UserLogin Pydantic schemas
│   ├── account.py             — AccountCreate, AccountOut
│   └── common.py              — Token, Message schemas
│
├── services/
│   ├── __init__.py
│   ├── vk_client.py           — VKApiClient (get_campaigns, get_ads, get_statistics)
│   ├── sync.py                — SyncService (вручную синхронизировать)
│   ├── auth.py                — AuthService (JWT, password)
│   └── account.py             — AccountService (управление кабинетами, доступом)
│
├── api/v1/
│   ├── __init__.py
│   ├── deps.py                — get_current_user, get_accessible_accounts
│   ├── auth.py                — /auth/register, /auth/login
│   ├── accounts.py            — /accounts CRUD
│   ├── sync.py                — /accounts/{id}/sync (главный MVP эндпоинт)
│   └── router.py              — APIRouter setup
│
├── main.py                    — FastAPI app
├── database.py                — Alembic миграции
└── requirements.txt
```

---

## 4. API эндпоинты MVP

```
═══════════════ АВТОРИЗАЦИЯ ═══════════════

POST   /api/v1/auth/register
Body:  { "email": "user@example.com", "password": "secret" }
Reply: { "access_token": "eyJ...", "token_type": "bearer" }

POST   /api/v1/auth/login
Body:  { "email": "user@example.com", "password": "secret" }
Reply: { "access_token": "eyJ...", "token_type": "bearer" }


═══════════════ КАБИНЕТЫ ═══════════════

POST   /api/v1/accounts
Header: Authorization: Bearer {token}
Body:  { "vk_account_id": 12345, "name": "ООО Рога" }
Reply: { "id": "uuid", "vk_account_id": 12345, "name": "ООО Рога" }

GET    /api/v1/accounts
Header: Authorization: Bearer {token}
Reply: [
  { "id": "uuid", "vk_account_id": 12345, "name": "ООО Рога" },
  { "id": "uuid", "vk_account_id": 54321, "name": "Ост Хаус" }
]

GET    /api/v1/accounts/{account_id}
Header: Authorization: Bearer {token}
Reply: { "id": "uuid", "vk_account_id": 12345, "name": "ООО Рога" }


═══════════════ VK-ТОКЕН ═══════════════

POST   /api/v1/accounts/{account_id}/token
Header: Authorization: Bearer {token}
Body:  { "access_token": "vk12345abcde..." }
Reply: { "status": "ok", "message": "Token saved" }


═══════════════ СИНХРОНИЗАЦИЯ (главное MVP) ═══════════════

POST   /api/v1/accounts/{account_id}/sync
Header: Authorization: Bearer {token}
Reply: { 
  "status": "syncing",
  "message": "Синхронизация началась, это займёт 5-10 секунд...",
  "started_at": "2026-05-02T10:30:00Z"
}

GET    /api/v1/accounts/{account_id}/sync-status
Header: Authorization: Bearer {token}
Reply: {
  "status": "completed",
  "last_synced_at": "2026-05-02T10:30:15Z",
  "campaigns_synced": 25,
  "ads_synced": 142,
  "error": null
}


═══════════════ КАМПАНИИ (быстро из БД) ═══════════════

GET    /api/v1/accounts/{account_id}/campaigns
Header: Authorization: Bearer {token}
Reply: [
  { "id": "uuid", "vk_campaign_id": 1001, "name": "Summer Sale", "status": "running" },
  { "id": "uuid", "vk_campaign_id": 1002, "name": "Winter Sale", "status": "paused" }
]


═══════════════ ОБЪЯВЛЕНИЯ (быстро из БД) ═══════════════

GET    /api/v1/accounts/{account_id}/ads
Header: Authorization: Bearer {token}
Query:  ?campaign_id=uuid (опционально)
Reply: [
  { "id": "uuid", "vk_ad_id": 5001, "name": "Ad 1", "status": "running", "cpc": 10.5 },
  { "id": "uuid", "vk_ad_id": 5002, "name": "Ad 2", "status": "paused", "cpm": 250.0 }
]


═══════════════ СТАТИСТИКА (из БД) ═══════════════

GET    /api/v1/accounts/{account_id}/stats
Header: Authorization: Bearer {token}
Query:  ?date_from=2026-05-01&date_to=2026-05-02 (опционально, default сегодня)
Reply: [
  {
    "date": "2026-05-02",
    "campaign_id": "uuid",
    "impressions": 1000,
    "clicks": 50,
    "spent": 125.50
  }
]


═══════════════ УПРАВЛЕНИЕ ДОСТУПОМ ═══════════════

POST   /api/v1/accounts/{account_id}/access
Header: Authorization: Bearer {token}
Body:  { "email": "colleague@example.com", "role": "viewer" }
Reply: { "status": "ok", "message": "Доступ предоставлен" }

GET    /api/v1/accounts/{account_id}/access
Header: Authorization: Bearer {token}
Reply: [
  { "email": "owner@example.com", "role": "owner" },
  { "email": "colleague@example.com", "role": "viewer" }
]
```

---

## 5. Реализация ключевого MVP-сервиса (синхронизация)

```python
# app/services/sync.py

from app.services.vk_client import VKApiClient
from app.models import Campaign, Ad, Statistic
from app.core.db import SessionLocal
from datetime import datetime, timedelta

class SyncService:
    """Ручная синхронизация данных из VK"""
    
    async def sync_account(self, account_id: str, access_token: str) -> dict:
        """
        Синхронизировать кампании, объявления и статистику одного кабинета.
        Вызывается вручную через API.
        """
        db = SessionLocal()
        account = db.query(Account).filter(Account.id == account_id).first()
        
        if not account:
            raise ValueError("Account not found")
        
        try:
            vk_client = VKApiClient(access_token)
            
            # 1. Синхронизировать кампании
            campaigns_data = await vk_client.get_campaigns(
                account_id=account.vk_account_id
            )
            campaigns_synced = 0
            for campaign_data in campaigns_data:
                Campaign.upsert(
                    db,
                    account_id=account_id,
                    vk_campaign_id=campaign_data['id'],
                    name=campaign_data['name'],
                    status=campaign_data['status'],
                    day_limit=campaign_data.get('day_limit', 0)
                )
                campaigns_synced += 1
            
            # 2. Синхронизировать объявления
            ads_data = await vk_client.get_ads(
                account_id=account.vk_account_id
            )
            ads_synced = 0
            for ad_data in ads_data:
                Ad.upsert(
                    db,
                    account_id=account_id,
                    vk_ad_id=ad_data['id'],
                    campaign_id=...,  # найти campaign_id по vk_campaign_id
                    name=ad_data['name'],
                    status=ad_data['status']
                )
                ads_synced += 1
            
            # 3. Синхронизировать статистику (только сегодня)
            today = datetime.now().date()
            stats_data = await vk_client.get_statistics(
                account_id=account.vk_account_id,
                ids=[c.vk_campaign_id for c in campaigns_data],
                period='day',
                date_from=str(today),
                date_to=str(today)
            )
            stats_synced = 0
            for stat in stats_data:
                Statistic.upsert(
                    db,
                    account_id=account_id,
                    campaign_id=...,
                    date=today,
                    impressions=stat.get('impressions', 0),
                    clicks=stat.get('clicks', 0),
                    spent=stat.get('spent', 0)
                )
                stats_synced += 1
            
            # 4. Обновить last_synced_at в кабинете
            account.last_synced_at = datetime.now()
            db.commit()
            
            return {
                "status": "success",
                "campaigns_synced": campaigns_synced,
                "ads_synced": ads_synced,
                "stats_synced": stats_synced,
                "synced_at": account.last_synced_at.isoformat()
            }
            
        except Exception as e:
            db.rollback()
            return {
                "status": "failed",
                "error": str(e)
            }
        finally:
            db.close()
```

```python
# app/api/v1/sync.py

from fastapi import APIRouter, Depends, HTTPException
from app.api.v1.deps import get_current_user, get_accessible_accounts
from app.services.sync import SyncService
from app.models import Account, VKToken

router = APIRouter(prefix="/accounts", tags=["sync"])

@router.post("/{account_id}/sync")
async def sync_account(
    account_id: str,
    current_user = Depends(get_current_user),
    accessible_accounts = Depends(get_accessible_accounts)
):
    """
    Синхронизировать кабинет вручную.
    Запрашивает данные из VK и обновляет локальную БД.
    """
    
    # Проверить доступ
    account = next((a for a in accessible_accounts if str(a.id) == account_id), None)
    if not account:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Проверить наличие токена
    db = SessionLocal()
    vk_token = db.query(VKToken).filter(VKToken.account_id == account_id).first()
    if not vk_token:
        raise HTTPException(status_code=400, detail="VK token not set")
    
    # Расшифровать токен
    from app.core.security import decrypt_token
    access_token = decrypt_token(vk_token.access_token)
    
    # Синхронизировать
    sync_service = SyncService()
    result = await sync_service.sync_account(account_id, access_token)
    
    if result['status'] == 'failed':
        raise HTTPException(status_code=500, detail=result['error'])
    
    return result
```

---

## 6. Поток использования MVP

```
1️⃣  Пользователь А регистрируется
    POST /auth/register { email, password }
    ↓ Получает JWT-токен

2️⃣  Пользователь А создаёт кабинет
    POST /accounts { vk_account_id: 12345, name: "ООО Рога" }
    ↓ Получает account_id

3️⃣  Пользователь А загружает VK-токен
    POST /accounts/{id}/token { access_token: "vk1234..." }
    ↓ Токен зашифрован и сохранён в БД

4️⃣  Пользователь А жмёт "Синхронизировать"
    POST /accounts/{id}/sync
    ↓ Тянет из VK кампании, объявления, статистику
    ↓ Сохраняет в PostgreSQL
    ↓ Возвращает: "campaigns_synced: 25, ads_synced: 142"

5️⃣  Пользователь А смотрит кампании (быстро из БД)
    GET /accounts/{id}/campaigns
    ↓ Возвращает список из локальной БД (0.1 сек)

6️⃣  Пользователь А приглашает Пользователя Б
    POST /accounts/{id}/access { email: "b@example.com", role: "viewer" }
    ↓ Создаётся связь user_accounts

7️⃣  Пользователь Б логинится
    POST /auth/login { email, password }
    ↓ Получает JWT-токен

8️⃣  Пользователь Б видит общий кабинет
    GET /accounts
    ↓ Возвращает кабинет потому что есть access в user_accounts

9️⃣  Оба видят одни и те же данные
    GET /accounts/{id}/campaigns
    ↓ Данные из одной таблицы в БД
```

---

## 7. Командная строка для быстрого старта MVP

```bash
# 1. Установка зависимостей
pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic pydantic-settings
pip install cryptography python-jose passlib bcrypt httpx

# 2. Подготовка БД
export DATABASE_URL="postgresql://user:pass@localhost/vk_ads_mvp"
alembic init alembic
alembic revision --autogenerate -m "initial"
alembic upgrade head

# 3. Запуск сервера
uvicorn app.main:app --reload

# 4. Открыть Swagger
# http://localhost:8000/docs
```

---

## 8. Что добавим после MVP

| После MVP | Когда |
|---|---|
| Celery + Redis | Неделя 3-4 |
| OAuth flow | Неделя 4 |
| Пул токенов | Неделя 5 |
| Полная история статистики | Неделя 5 |
| Pagination (200 объектов) | Когда нужно |
| Мониторинг | Когда в продакшене |

---

## 9. Контрольный список на готовность MVP

- [ ] PostgreSQL БД с 8 таблицами
- [ ] JWT авторизация (email/пароль)
- [ ] CRUD для accounts
- [ ] Хранение VK-токена (зашифрованного)
- [ ] Эндпоинт /sync (синхронизация вручную)
- [ ] Чтение campaigns/ads/stats из БД
- [ ] Управление доступом (user_accounts)
- [ ] Проверка прав доступа в каждом эндпоинте
- [ ] Базовая обработка ошибок
- [ ] Swagger документация
- [ ] Простые unit-тесты
- [ ] Готово к показу

---

## 10. Резюме MVP

✅ **Простота** — только самое важное, без излишеств  
✅ **Скорость** — 1-2 недели разработки  
✅ **Доказательство концепции** — многопользовательский доступ к одному кабинету  
✅ **Основа для расширения** — легко добавлять фишки позже  
✅ **Полнофункциональное** — работает end-to-end  

**MVP демонстрирует:**
- Юзеры могут авторизоваться
- Создавать кабинеты
- Приглашать других
- Синхронизировать данные из VK
- Видеть общие данные (кампании, объявления, статистику)
