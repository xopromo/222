# Архитектура VK Ads Service — полный план

Документ описывает финальную архитектуру сервиса для управления рекламными кабинетами ВКонтакте с поддержкой нескольких пользователей, оптимизацией лимитов API и фоновой синхронизацией.

---

## 1. Общие принципы

### 1.1 Единица хранения — рекламный кабинет (Account)

**Ключевое решение:** данные привязаны к кабинету, а не к пользователю.

```
Кабинет #12345
    ├── Таргетолог А (role: manager)
    ├── Таргетолог Б (role: analyst)
    └── Таргетолог В (role: view_only)
    
Данные синхронизируются ОДИН РАЗ на всех троих.
```

**Почему это нужно:**
- Один запрос к VK вместо трёх
- В 3 раза медленнее расходуются лимиты
- Консистентные данные для всей команды
- Соответствует реальной работе в кабинетах VK

### 1.2 Токены — ресурс кабинета, а не пользователя

Каждый кабинет имеет пул своих VK-токенов. Несколько пользователей одного кабинета могут давать разные токены — синкер выбирает лучший.

```
Кабинет #12345
├── токен_А (User A's token, 45% лимита осталось)
├── токен_Б (User B's token, 12% лимита осталось) ← берём этот
└── токен_В (User C's token, истёк)
```

---

## 2. База данных (PostgreSQL)

### 2.1 Основные таблицы

```sql
-- Пользователи сервиса (не VK пользователи)
users (
  id: UUID primary key,
  email: string unique,
  password_hash: string,
  created_at: timestamp,
  updated_at: timestamp
)

-- Рекламные кабинеты ВКонтакте
accounts (
  id: UUID primary key,
  vk_account_id: integer unique,     -- ID кабинета в VK
  name: string,                       -- "ООО Рога и Копыта"
  account_type: string,               -- "agency" / "advertiser"
  vk_agency_account_id: integer nullable,  -- если это суб-кабинет
  created_at: timestamp,
  updated_at: timestamp,
  last_synced_at: timestamp nullable
)

-- Связь: какие пользователи имеют доступ к какому кабинету
user_accounts (
  user_id: UUID,
  account_id: UUID,
  role: string,  -- "owner" / "manager" / "analyst" / "view_only"
  access_level: integer,  -- битовая маска прав (опционально)
  created_at: timestamp,
  primary key: (user_id, account_id)
)

-- VK токены, привязанные к кабинету
vk_tokens (
  id: UUID primary key,
  account_id: UUID,               -- к какому кабинету
  vk_user_id: integer,            -- чей это токен (в VK)
  access_token: string encrypted,  -- зашифрованный токен
  refresh_token: string encrypted nullable,  -- если есть
  expires_at: timestamp,
  last_used_at: timestamp,
  requests_last_hour: integer,    -- для отслеживания нагрузки
  requests_last_day: integer,
  is_active: boolean default true,
  error_count: integer default 0, -- для отслеживания проблем
  last_error: string nullable,
  created_at: timestamp,
  updated_at: timestamp,
  foreign key (account_id) references accounts(id)
)

-- Кампании (синхронизируются из VK)
campaigns (
  id: UUID primary key,
  account_id: UUID,
  vk_campaign_id: integer,         -- ID в VK
  name: string,
  status: string,                  -- "running" / "paused" / "deleted"
  day_limit: decimal,
  lifetime_limit: decimal,
  start_time: timestamp nullable,
  stop_time: timestamp nullable,
  created_at: timestamp,
  updated_at: timestamp,
  synced_at: timestamp,
  foreign key (account_id) references accounts(id),
  unique: (account_id, vk_campaign_id)
)

-- Объявления (синхронизируются из VK)
ads (
  id: UUID primary key,
  account_id: UUID,
  campaign_id: UUID,
  vk_ad_id: integer,
  name: string,
  status: string,
  cpc: decimal nullable,
  cpm: decimal nullable,
  ocpm: decimal nullable,
  link_url: string,
  created_at: timestamp,
  updated_at: timestamp,
  synced_at: timestamp,
  foreign key (account_id) references accounts(id),
  foreign key (campaign_id) references campaigns(id),
  unique: (account_id, vk_ad_id)
)

-- Статистика (синхронизируется из VK)
statistics (
  id: UUID primary key,
  account_id: UUID,
  campaign_id: UUID nullable,
  ad_id: UUID nullable,
  date: date,  -- дата за которую статистика
  impressions: integer,
  clicks: integer,
  spent: decimal,
  conversions: integer nullable,
  conversion_value: decimal nullable,
  synced_at: timestamp,
  foreign key (account_id) references accounts(id),
  unique: (account_id, campaign_id, ad_id, date)
)

-- Лог синхронизации (для отслеживания и отладки)
sync_log (
  id: UUID primary key,
  account_id: UUID,
  task_type: string,  -- "sync_campaigns" / "sync_ads" / "sync_stats"
  status: string,     -- "pending" / "in_progress" / "success" / "failed"
  started_at: timestamp,
  completed_at: timestamp nullable,
  error_message: string nullable,
  items_synced: integer,
  api_requests_made: integer,
  foreign key (account_id) references accounts(id)
)
```

### 2.2 Индексы

```sql
create index idx_accounts_vk_id on accounts(vk_account_id);
create index idx_user_accounts_user_id on user_accounts(user_id);
create index idx_user_accounts_account_id on user_accounts(account_id);
create index idx_vk_tokens_account_id on vk_tokens(account_id);
create index idx_vk_tokens_active on vk_tokens(account_id, is_active);
create index idx_campaigns_account_id on campaigns(account_id);
create index idx_ads_account_id on ads(account_id);
create index idx_ads_campaign_id on ads(campaign_id);
create index idx_statistics_account_id on statistics(account_id);
create index idx_statistics_date on statistics(date);
create index idx_sync_log_account_id on sync_log(account_id);
create index idx_sync_log_status on sync_log(status);
```

---

## 3. Авторизация и токены

### 3.1 Два типа токенов

#### VK-токен (OAuth)
- Получаем через VK OAuth flow
- Нужен для запросов к VK API
- Хранится **зашифрованным** в БД
- Привязан к конкретному пользователю VK
- Может истечь (обычно через 24 часа)

#### Сервис-токен (JWT)
- Выдаём после авторизации на сервисе (email/password)
- Используется для всех запросов к нашему API
- Содержит `user_id` и список доступных кабинетов
- Истекает через несколько часов (настраивается)

### 3.2 Поток авторизации

```
1. Пользователь → /auth/register или /auth/login с email/password
2. Проверяем в БД, выдаём JWT-токен
3. Клиент передаёт JWT-токен в заголовке Authorization
4. API проверяет JWT, узнаёт user_id
5. Для первого входа: /auth/vk/login → перенаправляем на VK OAuth
6. После OAuth callback: /auth/vk/callback?code=...
7. Обмениваем code на VK access_token
8. Сохраняем VK-токен в таблицу vk_tokens, привязываем к account_id
9. Следующие синхронизации используют VK-токены из пула
```

### 3.3 Хранение VK-токенов

```python
from cryptography.fernet import Fernet

cipher = Fernet(settings.encryption_key)

# При сохранении
encrypted_token = cipher.encrypt(vk_token.encode()).decode()
db.vk_tokens.create(access_token=encrypted_token)

# При использовании
decrypted_token = cipher.decrypt(db_token.access_token.encode()).decode()
```

---

## 4. Пул токенов и управление лимитами

### 4.1 Выбор токена для синхронизации

Стратегия: "используй токен с наименьшей нагрузкой"

```python
def select_token_for_account(account_id: int) -> VKToken:
    tokens = db.vk_tokens.filter(
        account_id=account_id,
        is_active=True,
        expires_at > now()
    )
    
    # Приоритет:
    # 1. Токены с большим остатком лимита
    # 2. Среди них — с самым давним last_used_at (разнесённая нагрузка)
    # 3. Если запросов мало — используй любой
    
    best = min(tokens, key=lambda t: (
        -t.requests_last_hour,  # меньше запросов = выше приоритет
        t.last_used_at           # давнее использование = выше приоритет
    ))
    return best
```

### 4.2 Отслеживание лимитов

После каждого запроса к VK читаем заголовки:

```python
async def make_vk_request(token: VKToken, method: str, params: dict):
    response = await http_client.post(
        f"https://api.vk.com/method/{method}",
        data={**params, "access_token": token.access_token}
    )
    
    # Парсим заголовки (если новый API) или обновляем counter
    if "X-RateLimit-Hourly-Remaining" in response.headers:
        remaining = int(response.headers["X-RateLimit-Hourly-Remaining"])
        token.requests_last_hour = total_limit - remaining
    else:
        # Для старого API считаем вручную
        token.requests_last_hour += 1
    
    token.last_used_at = now()
    token.save()
    
    return response.json()
```

### 4.3 Обработка ошибок лимитов

```python
async def make_vk_request_with_retry(token: VKToken, method, params):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return await make_vk_request(token, method, params)
        except VKAPIError as e:
            if e.error_code == 601:  # daily quota exceeded
                # Перейти на следующий токен
                next_token = get_next_token_in_pool(token.account_id)
                if next_token and next_token.id != token.id:
                    token = next_token
                    await asyncio.sleep(2 ** attempt)  # exponential backoff
                    continue
                else:
                    # Нет других токенов, приостановить задачу
                    raise
            elif e.error_code == 6:  # too many requests per second
                await asyncio.sleep(2 ** attempt)
                continue
            else:
                raise
```

---

## 5. Фоновая синхронизация (Celery + Redis)

### 5.1 Задачи синхронизации

| Задача | Интервал | Почему |
|---|---|---|
| `sync_campaigns` | 10 мин | Кампании редко создаются/удаляются |
| `sync_ads` | 10 мин | Объявления редко создаются/удаляются |
| `sync_statistics_today` | 30 мин | Сегодняшняя статистика важна для оптимизации |
| `sync_statistics_history` | 1 раз в день (23:00) | История за прошлые дни не меняется |

### 5.2 Структура задач

```python
# celery_app.py

@celery_app.task(bind=True, max_retries=3)
def sync_campaigns(self, account_id: int):
    """Синхронизировать кампании одного кабинета"""
    try:
        account = Account.get(id=account_id)
        token = select_token_for_account(account_id)
        
        campaigns_data = await vk_client.get_campaigns(
            account_id=account.vk_account_id,
            access_token=token.access_token
        )
        
        # Сохранить/обновить в БД
        for campaign_data in campaigns_data:
            Campaign.upsert(
                account_id=account_id,
                vk_campaign_id=campaign_data['id'],
                defaults=campaign_data
            )
        
        # Логировать
        SyncLog.create(
            account_id=account_id,
            task_type='sync_campaigns',
            status='success',
            items_synced=len(campaigns_data)
        )
        
    except Exception as exc:
        self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True)
def sync_statistics_today(self, account_id: int):
    """Синхронизировать статистику за сегодня"""
    account = Account.get(id=account_id)
    token = select_token_for_account(account_id)
    
    # Получить все кампании кабинета
    campaigns = Campaign.filter(account_id=account_id, status='running')
    
    # VK ограничивает: 200 объектов в одном запросе
    # Разбить на части
    for chunk in chunks(campaigns, 200):
        campaign_ids = [c.vk_campaign_id for c in chunk]
        
        stats = await vk_client.get_statistics(
            account_id=account.vk_account_id,
            ids=campaign_ids,
            period='day',
            date_from=today,
            date_to=today,
            access_token=token.access_token
        )
        
        for stat in stats:
            Statistics.upsert(
                account_id=account_id,
                campaign_id=stat['id'],
                date=today,
                defaults=stat
            )
```

### 5.3 Расписание (Beat schedule)

```python
# celery_beat_schedule.py

app.conf.beat_schedule = {
    # Каждые 10 минут для всех кабинетов
    'sync-campaigns-periodic': {
        'task': 'app.celery_tasks.sync_all_campaigns',
        'schedule': crontab(minute='*/10'),
    },
    'sync-ads-periodic': {
        'task': 'app.celery_tasks.sync_all_ads',
        'schedule': crontab(minute='*/10'),
    },
    # Каждые 30 минут
    'sync-stats-today-periodic': {
        'task': 'app.celery_tasks.sync_all_statistics_today',
        'schedule': crontab(minute='*/30'),
    },
    # Каждый день в 23:00
    'sync-stats-history-periodic': {
        'task': 'app.celery_tasks.sync_all_statistics_history',
        'schedule': crontab(hour=23, minute=0),
    },
}

async def sync_all_campaigns():
    """Синхронизировать кампании для всех кабинетов"""
    accounts = Account.filter(is_active=True)
    for account in accounts:
        sync_campaigns.delay(account.id)
```

### 5.4 Токен refresh

```python
@celery_app.task
def refresh_expired_tokens():
    """Обновить токены которые истекают в течение 1 часа"""
    tokens = VKToken.filter(
        expires_at <= now() + timedelta(hours=1),
        expires_at > now()
    )
    
    for token in tokens:
        try:
            new_token_data = await vk_oauth_service.refresh_token(
                token.refresh_token
            )
            token.access_token = encrypt(new_token_data['access_token'])
            token.expires_at = now() + timedelta(seconds=new_token_data['expires_in'])
            token.save()
        except Exception as e:
            token.is_active = False
            token.last_error = str(e)
            token.save()
            # Отправить алерт что токен недействителен

# Запускать каждый час
app.conf.beat_schedule['refresh-tokens'] = {
    'task': 'app.celery_tasks.refresh_expired_tokens',
    'schedule': crontab(minute=0),  # каждый час
}
```

---

## 6. API (FastAPI)

### 6.1 Аутентификация

```python
# app/api/v1/deps.py

async def get_current_user(
    authorization: str = Header(...)
) -> User:
    """Извлечь пользователя из JWT-токена"""
    token = authorization.replace("Bearer ", "")
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    user_id = payload.get("sub")
    user = User.get(id=user_id)
    return user

async def get_accessible_accounts(
    current_user: User = Depends(get_current_user)
) -> list[Account]:
    """Получить список кабинетов которые доступны пользователю"""
    return Account.join(
        UserAccount,
        Account.id == UserAccount.account_id
    ).filter(UserAccount.user_id == current_user.id)
```

### 6.2 Структура роутеров

```python
# app/api/v1/__init__.py

api_router = APIRouter(prefix="/api/v1")

# Авторизация
api_router.include_router(auth_router)

# Кабинеты
api_router.include_router(accounts_router)  # GET /accounts, /accounts/{id}

# Кампании
api_router.include_router(campaigns_router)  # GET/POST /accounts/{id}/campaigns

# Объявления
api_router.include_router(ads_router)  # GET/POST /accounts/{id}/ads

# Статистика
api_router.include_router(stats_router)  # GET /accounts/{id}/stats?date_from=...&date_to=...

# Управление доступом
api_router.include_router(access_router)  # управление user_accounts
```

### 6.3 Пример маршрута

```python
@router.get("/accounts/{account_id}/campaigns")
async def list_campaigns(
    account_id: int,
    current_user: User = Depends(get_current_user),
    accessible_accounts: list[Account] = Depends(get_accessible_accounts)
):
    """Получить кампании кабинета"""
    
    # Проверить доступ
    account = next((a for a in accessible_accounts if a.id == account_id), None)
    if not account:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Вернуть из локальной БД (быстро)
    campaigns = Campaign.filter(account_id=account_id).all()
    return campaigns
```

---

## 7. Создание/изменение объявлений (Write-through)

Когда пользователь создаёт кампанию или меняет объявление — сразу идём в VK, потом обновляем локальную БД.

```python
@router.post("/accounts/{account_id}/campaigns")
async def create_campaign(
    account_id: int,
    campaign_data: CampaignCreate,
    current_user: User = Depends(get_current_user)
):
    # 1. Проверить доступ
    account = check_access(account_id, current_user)
    
    # 2. Отправить в VK
    token = select_token_for_account(account_id)
    vk_response = await vk_client.create_campaigns(
        account_id=account.vk_account_id,
        campaigns=[campaign_data.dict()],
        access_token=token.access_token
    )
    vk_campaign_id = vk_response[0]['id']
    
    # 3. Сохранить в локальную БД
    campaign = Campaign.create(
        account_id=account_id,
        vk_campaign_id=vk_campaign_id,
        **campaign_data.dict()
    )
    
    return campaign
```

---

## 8. Обработка ошибок

### 8.1 Коды ошибок VK API

| Код | Значение | Действие |
|---|---|---|
| 5 | Невалидный токен | Пометить токен как неактивный |
| 6 | Слишком много запросов в сек | Retry с exponential backoff |
| 9 | Flood control | Retry с exponential backoff |
| 601 | Дневной лимит исчерпан | Переключиться на другой токен |
| 630-636 | Ошибки lookalike | Обработать специально |

### 8.2 Fallback при недостатке лимитов

Если все токены исчерпали лимиты:
1. Добавить задачу в очередь на завтра
2. Выдать пользователю сообщение "лимиты исчерпаны, повторим завтра"
3. Отправить алерт в Telegram/Slack администратору

---

## 9. Мониторинг и логирование

### 9.1 Метрики

```python
# Отслеживать для каждого кабинета:
- Количество синхронизаций в день
- Среднее время синхронизации
- Процент успешных синхронизаций
- Количество ошибок по типам
- Использование лимитов (%)
```

### 9.2 Алерты

Отправлять алерт если:
- Токен не обновляется более 1 часа
- Более 3 ошибок подряд при синхронизации
- Использовано более 80% дневного лимита
- Токен истёк и не обновляется

---

## 10. Развёртывание

### 10.1 Docker Compose

```yaml
version: '3.9'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://user:pass@postgres/vk_ads
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    volumes:
      - ./app:/app/app

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: vk_ads
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  celery_worker:
    build: .
    command: celery -A app.celery_app worker -l info
    environment:
      DATABASE_URL: postgresql://user:pass@postgres/vk_ads
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

  celery_beat:
    build: .
    command: celery -A app.celery_app beat -l info
    environment:
      DATABASE_URL: postgresql://user:pass@postgres/vk_ads
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
```

---

## 11. Этапы реализации

| Этап | Задачи | Время |
|---|---|---|
| **1. Фундамент** | PostgreSQL, JWT авторизация, user_accounts | 1-2 недели |
| **2. Синхронизация** | Celery, фоновые задачи sync_campaigns/ads | 1 неделя |
| **3. Пул токенов** | Выбор токена, отслеживание лимитов | 3-5 дней |
| **4. Статистика** | Синхронизация статистики, пагинация по 200 | 3-5 дней |
| **5. Тесты** | Unit/integration тесты | 1 неделя |
| **6. Мониторинг** | Логирование, алерты, метрики | 3-5 дней |

**Итого: 4-5 недель до MVP**

---

## 12. Резюме архитектуры

✅ **Данные по кабинетам** — синхронизируются один раз на всех пользователей  
✅ **Пул токенов** — умный выбор токена по нагрузке и остатку лимита  
✅ **Фоновая синхронизация** — Celery + Redis с разными интервалами  
✅ **Многопользовательское управление** — JWT авторизация + user_accounts таблица  
✅ **Обработка лимитов** — 200 объектов на запрос, exponential backoff, token refresh  
✅ **Безопасность** — зашифрованные VK-токены, проверка доступа на каждый запрос  
✅ **Мониторинг** — логирование, алерты, метрики по лимитам
