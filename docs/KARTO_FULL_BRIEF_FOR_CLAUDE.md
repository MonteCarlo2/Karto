# KARTO — полный бриф проекта для Claude

> Документ для передачи контекста другому агенту (Claude). Составлен по коду репозитория `karto-new`, продуктовым правилам Seller Hub и аудитам сессии разработки.  
> **Дата среза:** октябрь 2026.  
> **Режим:** факты из кода + зафиксированная доктрина. Где что-то известно только из чатов с Cursor (не из git/roadmap-файла) — помечено явно.  
> Git-история в среде аудита была недоступна (`git` не в PATH) — коммиты здесь не перечисляются.

---

## 0. Как читать этот документ

1. Сначала философия и границы продукта (§1–3).
2. Затем карта продукта целиком (§4–5): Studio, автоответы, Seller Hub, платежи, админка.
3. Потом Seller Hub подробно: что сделано, цепочки данных, пробелы (§6–8).
4. Дорожная карта и следующий этап (§9).
5. Правила работы агента (§10–11).

**Не путать:**
- `PRODUCT.md` описывает KARTO как ИИ-помощник карточек/контента/автоответов (позиционирование бренда).
- Seller Hub — более новый слой «сотрудник по цифрам WB»: действия, задачи, экономика. Доктрина в `.cursor/rules/seller-hub-advantage.mdc`.
- README устарел по стеку/фокусу (ещё про Replicate-пайплайн карточек); источник правды по Seller Hub — код + `seller-hub-advantage.mdc`.

---

## 1. Что такое KARTO

**KARTO** (`karto.pro`) — веб-сервис для продавцов российских маркетплейсов (в первую очередь Wildberries; также Ozon и Яндекс Маркет в частях продукта).

**Две платящие ценности (особенно для Seller Hub):**
1. **Время** — рутина: отзывы, тексты, фото, дыры в карточке.
2. **Деньги** — цена, акция, реклама, остаток — только если действие привязано к факту и подтверждено человеком.

**Не цель:** второй кабинет WB с копиями отчётов. Аналитика — сырьё для решения и действия.

**Пользователи:** владельцы магазинов и брендов без отдельного штата дизайнеров/аналитиков; вторично — агентства с несколькими кабинетами.

**Тон:** на «вы», экспертный, спокойный, зелёный бренд KARTO. Без AI-slop (фиолетовые градиенты, пустые «+48500 ₽», выдуманные эффекты).

---

## 2. Философия продукта (обязательная)

### 2.1 Общая

- Задача важнее декора.
- Доверие через конкретику маркетплейсов, не «AI magic».
- Честность к лимитам API и ИИ: null ≠ 0; truncated ≠ «продаж не было»; нет данных — так и писать.
- Не выдумывать чужие цены, медиану конкурентов, «кликнул но не открыл», прогноз следующей продажи до заказа, эффект «окупаемость ×20».
- Деньги в кабинет WB — только после явного подтверждения пользователя.

### 2.2 Seller Hub (доктрина `.cursor/rules/seller-hub-advantage.mdc`)

KARTO для селлера WB — **сотрудник**, который по его цифрам решает, что сделать с карточкой, и делает это в кабинете. Человек подтверждает то, что двигает деньги.

**Целевое меню (куда идём):**
1. Обзор — утренний стол дел (не графики); пустой = дел нет.
2. Товары — цена, скидка, себестоимость, маржа, остаток (переключатель Товары/Остатки).
3. Поставки — что кончается, куда везти, сколько штук.
4. Продвижение — реклама с действием (фразы, маржа, запас).
5. Отзывы — ответ + повтор поломки.
6. Агенты — правила и журнал.
7. База знаний.
8. Кабинет и API.

**Не делать отдельными пунктами меню (как цель):** Аналитика, Заказы, Финансы, Акции-календарь — это отчёты WB / сырьё. В коде страницы частично ещё есть (legacy / «Данные»).

**Замкнутый круг:** сделали действие → через дни смотрим ту же воронку/отчёт → если эффекта нет, следующее действие другое.  
**Маржа как предохранитель:** себестоимость вводит человек (в API нет); комиссия/логистика — из отчёта реализации, не «типичная комиссия категории».

### 2.3 Уровни ценности функции

Отличать при оценке и при разработке:
1. Показ данных  
2. Расчёт метрик  
3. Выявление проблемы  
4. Объяснение по фактам  
5. Рекомендация действия  
6. Выполнение действия (после confirm)  
7. Проверка результата  

Не предлагать фичи «как у конкурента» без пользы и без подтверждённых данных API.

---

## 3. Технологический стек и инфраструктура

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind |
| Backend | Next.js Route Handlers (`src/app/api/**`) |
| Auth / DB | Supabase (Auth, Postgres, RLS где настроено) |
| AI (карточки/тексты) | OpenRouter и др.; legacy Replicate для части image |
| Платежи | ЮKassa (см. `YOOKASSA_*.md`) |
| Деплой | Timeweb Backend Apps (`DEPLOY.md`), `node start.js` |
| WB API specs | `docs/wb-api/` (официальные OpenAPI — читать перед WB-работой) |

**Ключевые env (имена, не значения):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `AUTO_REPLY_SECRETS_KEY` — шифрование секретов маркетплейсов (автоответы + Seller Hub WB); **обязателен для записи WB-токена Hub**
- `CRON_SECRET` — cron автоответов; у автоответов также fallback-кандидат ключа шифрования
- Провайдеры AI, SMTP, ЮKassa — по соответствующим setup-докам

**Локально (на момент аудита):** в `.env.local` часто **не было** `AUTO_REPLY_SECRETS_KEY` → Seller Hub не мог сохранить токен («Не удалось сохранить подключение», HTTP 400) при живом токене WB.

---

## 4. Карта продукта целиком

### 4.1 Маркетинг и аккаунт

| Путь | Назначение |
|---|---|
| `/` | Лендинг |
| `/pricing` | Тарифы |
| `/login`, `/auth/*`, `/reset-password` | Auth |
| `/profile` | Профиль |
| `/notifications` | Уведомления |
| Юридические страницы | privacy, terms, payments-policy, ai-policy, … |

### 4.2 Studio (контент и утилиты)

Точка входа: `/studio` и подразделы.

| Раздел | Путь | Суть |
|---|---|---|
| Визуал / карточки | `/studio/visual`, generate APIs | Фото, фоны, композитинг, слайды, видео-flow |
| Описания | `/studio/description(s)` | SEO-тексты |
| Понимание товара | `/studio/understanding` | Распознавание |
| Цена / анализ | `/studio/price` | Вспомогательный ценовой анализ |
| Юнит-экономика | `/studio/unit-economics` | Калькуляторы WB/Ozon (отдельные тарифные данные, **не** Seller Hub finance) |
| Бесплатная генерация | `/studio/free` | Лимитированный free-flow |
| Результаты | `/studio/results` | Выдачи генераций |
| Автоответы | `/studio/auto-replies`, `.../workspace` | Полноценный модуль отзывов/вопросов |
| **Seller Hub** | `/studio/seller-hub` | Кабинет действий по WB |

Также: brand onboarding (`/brand`), админка (`/admin/stats`, notifications), Telegram-интеграции API.

### 4.3 Автоответы (смежный крупный модуль)

- Клиентские настройки магазинов (localStorage + server secrets).
- Секреты МП в `auto_reply_marketplace_secrets`, шифрование `server-secrets.ts` (salt `karto-auto-reply-secrets-v1`, кандидаты ключей: `AUTO_REPLY_SECRETS_KEY` → `CRON_SECRET` → hardcoded dev-key).
- Cron inbox sync / renew (`CRON_SECRET`).
- WB/Ozon/Yandex клиенты отзывов.
- Seller Hub **не дублирует** ответы: из Hub уводит в `/studio/auto-replies/workspace`.
- Строки `shop_id=seller-hub` **исключены** из list/upsert автоответов (`isSellerHubSecretShopId`), чтобы не decrypt-ить чужим salt.

### 4.4 Платежи и подписка / «потоки»

- ЮKassa, subscription APIs, flow/token балансы для генераций.
- Документация: `YOOKASSA_*.md`, `FREE_GENERATION_*`, supabase manuals.

### 4.5 Seller Hub — отдельный продукт внутри Studio

См. §6–9. Это основной фокус недавней разработки «кабинета сотрудника».

---

## 5. Интеграции

### 5.1 Wildberries OpenAPI

Спеки: `docs/wb-api/`. Перед любой WB-работой читать официальный yaml, **не выдумывать поля**.

Используемые зоны (неполный список):
- Content (карточки, медиа)
- Prices
- Marketplace (FBS заказы, остатки склада продавца, поставки)
- Analytics (sales-funnel history/products, FBO stocks-report) — rate limit ~3/min personal; **402 Jam** на части funnel
- Finance (баланс, detailed sales-report / realization)
- Advert (кампании, бюджет; **фраз в Hub нет**)
- Promotion calendar / manage (автоакции API ограничены)
- Feedbacks/Questions (в основном через автоответы; в Hub — счётчики)

### 5.2 Ozon / Яндекс

- Verify/sync маршруты и типы в Seller Hub есть; UI Hub при hydrate форсирует Wildberries.
- Юнит-экономика и автоответы шире по МП.

### 5.3 Supabase

- Auth пользователей KARTO.
- Таблицы автоответов, секретов МП.
- Seller Hub: `seller_hub` events/tasks migrations (`20261008_seller_hub_*.sql`).
- Прочий прод: профили, платежи, уведомления, video tokens и т.д.

### 5.4 AI-провайдеры

- OpenRouter / Gemini / OpenAI — тексты, ассистенты, часть студии.
- Replicate — legacy image (segment/enhance/background).

---

## 6. Seller Hub — что это и что уже сделано

### 6.1 Назначение

Рабочее место селлера WB внутри KARTO: sync кабинета → факты → события → задачи → приоритет → действие (часто с записью в WB после confirm).

Entry: `src/app/studio/seller-hub/page.tsx` → `SellerHubApp`.

### 6.2 Навигация сейчас (`nav.ts`)

Группы: Обзор / Задачи / События / Агенты · Товары / Акции · Аналитика / Заказы / Поставки / Реклама / Финансы · База знаний · Кабинет.  
Цены и Остатки как отдельные пункты меню убраны (страницы в коде могут оставаться; остатки — режим каталога).

### 6.3 Foundation: токен WB на сервере

**Сделано:**
- Хранение ciphertext в `auto_reply_marketplace_secrets`, `shop_id = seller-hub`, marketplace wildberries.
- Шифрование AES-256-GCM, salt **`karto-seller-hub-wb-v1`**, ключ **только** `AUTO_REPLY_SECRETS_KEY` (без CRON/dev fallback на запись).
- Actions: connect / migrate / replace / disconnect / status.
- 16+ WB data-routes через `requireSellerHubWbToken` (тело apiKey клиента не источник секрета).
- Черновик токена только в React state (`wbTokenDraft`), не в `karto-seller-hub-v1:{userId}`.
- `alreadyStored`: clear local только после `verify(existing.token)` → `serverVerified`; иначе `keepLocal`.
- Автоответы не читают/не перешифровывают `seller-hub` строки.

**Тесты:** `wb-token.test.ts`, `server-secrets.test.ts` (изоляция hub).

### 6.4 Товары

**Сделано:**
- Sync: карточки, цены, FBO/FBS остатки, промо-календарь, ads list, FBS orders summary, supplies, comms counts, finance balance, analytics 7d.
- UI матрица + режим остатков; себестоимость вручную в снимке; маржа/порог убытка/дни запаса из realization.
- Запись цены/скидки в WB с подтверждением upload; FBS остаток при одном складе.
- Контент-скор, индекс SKU (столпы спрос/склад/контент/отзывы — спрос из funnel, когда есть).

**Ограничения:** пагинация карточек; каталог в **localStorage** (не multi-device); без realization экономика слабее.

### 6.5 Realization и Days of Stock / OOS

**Формула темпа (`stockPace`):**  
- если `recentQty > 0` → daily = recentQty/7 (окно recent);  
- иначе если `qty > 0` → daily = qty/28 (окно span);  
- иначе темпа нет.  
`coverDays = round(stock/daily)` только при stock>0 и daily>0.  
**Не** дата обнуления; при нет продаж — unknown, не выдумывать риск.

**Задачи:** `TASK_LOW_STOCK` (порог `lowStockDays`, default 7), `TASK_STOCK_OUT` (переход в 0).  
**Assess:** `stock-risk.ts` → `assessOosRisk`.  
**Prefetch:** realization подтягивается на уровне Hub после connect (не только из Каталога), чтобы tasks видели coverDays.

### 6.6 События (Events V1)

- Diff чтений товара/магазина → kinds: stock_out, low_stock, sales_*, price, content, unanswered…
- Persistence: Supabase + fallback localStorage.
- Sales в events = **realization qty**, не funnel orders.
- Dedup по event key; UNIQUE в БД.

### 6.7 Task Engine V1

- Facts из snapshot → reconcile → create/refresh/close.
- Типы: stock out/low/excess/stagnant capital, sales drop/growth/no sales, margin*, content*, unanswered reviews/questions.
- Lifecycle: active, in_progress, snoozed, completed, dismissed; condition-cleared vs user-completed.
- Severity при создании: `scoreTask` в `scoring.ts` (зажим floor/ceiling) — **не** порядок списка.
- Supabase persistence, Top Actions (до 5, группировка по nm).

### 6.8 Task Prioritization V1 — **завершён**

- Файл: `task-engine/priority.ts` — `priorityRank` / `compareByPriority` / `sortByPriority`.
- Учитывает: businessImpact → money/scale → urgency; сначала Critical→Important→Opportunity; tie-break до `id`.
- Число приоритета пользователю не показывается.
- Подключено: список задач + Top Actions.
- Тесты: `priority.test.ts` **12/12** (повтор сортировки, tie по id, scaleBonus для NO_SALES / UNANSWERED_REVIEWS / MARGIN_DETERIORATION).
- Не менять алгоритм/веса без явной задачи; «полнота evidence» отдельным множителем не добавляли.

### 6.9 Действия пользователя → WB

| Действие | Статус |
|---|---|
| Цена/скидка | Real + confirm upload |
| FBS stock | Real (один склад) |
| Ads start/pause | Real |
| Promo enter/exit | Partial (маржа/API gaps автоакций) |
| Cards/media | Real |
| Ответ на отзыв | Вне Hub → Auto-replies |
| Phrase ads autopilot | **Нет** |
| «Куда везти» | **Нет** |
| Агенты с auto-write | **Stub** (local scenarios) |

### 6.10 Обзор сейчас vs доктрина

**Сейчас:** `HubHealthBoard` — графики 7д, pipeline FBS, советы-эвристики `buildAdvice`.  
**Доктрина:** очередь подтверждения из Task Engine.  
**Не делать Обзор 2.0**, пока не выровнен контракт продаж/воронки (см. §9).

---

## 7. Четыре плоскости «продаж» (критично понимать)

| Слой | Источник | Окно | Потребители |
|---|---|---|---|
| A Analytics summary | sales-funnel/grouped/history | ~7д | Обзор, страница Analytics |
| B FBS orders | Marketplace orders | 7д | Заказы, pipeline |
| C Realization | Finance detailed report | 28+28д | Маржа, cover, Events sales, Task sales |
| D Funnel products | sales-funnel/products | 28+28д | Индекс спроса, promo pace; **load в основном с Каталога/Акций** |

В `SellerFunnelNm` сейчас только: `orders`, `priorOrders`, `feedbackRating`, `ordersPerDay`.  
Opens/carts/buyouts/cancels из swagger **не сохраняются**.  
Лимит ~3×1000 nm; throttle Analytics; 402 = Jam.

`task-engine/facts.ts` передаёт `ordersPerDay: null` в supplyPace — задачи не используют funnel.

**Это главный продуктовый разрыв после Priority V1.**

---

## 8. История недавней разработки (из сессии Cursor — не git)

Порядок работ в чатах (сжато):
1. Task lifecycle, action audit, price reliability (waitForWbPriceUpload + confirm).
2. Аудит → серверное хранение WB-токена Hub.
3. Фикс: draft не в localStorage; alreadyStored только после serverVerified.
4. Изоляция автоответов от `shop_id=seller-hub`.
5. Диагностика 400 без `AUTO_REPLY_SECRETS_KEY`.
6. Аудит продукта → идея Обзор=очередь; затем Master Plan → приоритет этапа «продажи/воронка».
7. Days of Stock / OOS: логика уже была; закрыт пробел prefetch realization + `assessOosRisk` + evidence.
8. Аудит Priority Layer → дожим тестами (12/12).
9. Master Roadmap Recovery audit → следующий этап = воронка/sales-контракт.

**Согласованный порядок этапов Master Plan (из чата):**  
Foundation → Товары → **Продажи/заказы/воронка** → События → Финансы → Логистика → Продвижение → Отзывы → Контент → Задачи → Обзор 2.0 → Агенты → БЗ → Кабинет.  
Часть этапов сделана вне очереди (Events, Tasks, Priority) — **не переделывать** без причины.

---

## 9. Дорожная карта: статусы и следующий шаг

### Завершено (V1)
- Foundation WB token (server)
- Task Engine V1
- Task Prioritization V1
- Events V1
- Days of Stock / OOS risk (на realization)
- Кабинет WB connect/sync (ядро)

### Частично
- Товары (ядро ок; multi-device нет)
- Продажи/воронка (**главный незакрытый этап плана**)
- Обзор (KPI ≠ очередь)
- Финансы / Логистика / Продвижение / Отзывы / Контент

### Не реализовано / stub
- Агенты (реальные)
- База знаний (живая)
- Ads phrase autopilot
- «Куда везти»
- Эффект-плашка по фактам действий
- Обзор 2.0

### СЛЕДУЮЩИЙ ЭТАП (однозначный)

**«Продажи, заказы и воронка» — завершение контракта данных**, не новый UI-отчёт.

**Зачем:** Events/Tasks/Обзор/индекс едят разные смыслы «продаж». Без выравнивания Обзор 2.0 и Агенты закрепят ложь.

**Критерии готовности (черновик):**
1. Funnel load на уровне Hub после connect (как realization), с честными Jam/429/truncate.
2. Расширить funnel-снимок (opens/carts/orders/prior/buyouts если API отдаёт) **или** явно исключить в UI.
3. Один контракт имён для Events+Tasks: либо funnel orders, либо realization sales — без путаницы в копирайте.
4. Truncate/error ≠ ноль; стратегия >3k nm.
5. Регрессия realization / маржа / cover / tasks / priority.

**Первый минимальный пакет:** hub-prefetch funnel + контракт метрик в facts/events + тесты null/truncate.  
**Не начинать параллельно:** Обзор 2.0, Агенты, UI-полировку всего меню, массовый рефакторинг.

**После этапа 2 (позже):** Обзор 2.0 (очередь Task Engine) → логистика «куда везти» / продвижение фраз — по API-готовности.

---

## 10. Правила для Claude (как работать в этом репо)

### Обязательно
- Читать `.cursor/rules/seller-hub-advantage.mdc` перед фичами Hub.
- Перед WB API — `docs/wb-api/` и правило `wb-api-official-specs`.
- TypeScript: exhaustive `never` в switch по union.
- Imports только наверху файла (no inline imports).
- Минимальный diff; не рефакторить «заодно».
- Не коммитить / не пушить / не деплоить без явной просьбы пользователя.
- Русский UI copy; не выдумывать метрики и поля API.
- Тесты: `npx tsx --test <files>`; tsc/eslint по затронутому.

### Запрещено без явной задачи
- Менять Priority weights / правила формирования задач «для красоты».
- Переписывать Events/Tasks V1.
- Строить второй кабинет WB (лишние отчётные экраны как цель).
- Отдавать серверный WB-токен клиенту.
- Писать draft токена в localStorage.
- Автозамена server secret при migrate.
- Decrypt/reencrypt `seller-hub` кодом автоответов.
- Обещать прогноз продаж / чужие цены / эффект без факта действия.

### Skills / tooling (если доступны в Cursor)
- UI: user-skills-router → design-doctrine, karto-dev-stack, ui-tools, impeccable.
- Seller Hub product psychology: `ux-core`.
- Не путать с лендинговыми hard-rules (hero/brand) — для Hub действует дизайн-система продукта (салат только для active/CTA/спокойного статуса).

### Два score в задачах
- `scoreTask` (`scoring.ts`) — только severity при создании, может писаться в БД.
- `sortByPriority` (`priority.ts`) — порядок списка; число пользователю не показывают.
Не смешивать.

---

## 11. Ключевые пути в коде

```
src/app/studio/seller-hub/          # страница Hub
src/components/seller-hub/          # UI разделов
src/lib/seller-hub/                 # домен Hub
  wb-token.ts / wb-token-store.ts / wb-token-http.ts
  store.ts                          # localStorage snapshot
  product-signal.ts / stock-risk.ts / realization-margin.ts
  task-engine/                      # engine, rules, facts, priority, scoring
  event-engine/ / event-history*.ts
src/app/api/seller-hub/             # HTTP Hub
src/lib/services/wildberries/       # WB clients (content, analytics, advert, …)
src/lib/auto-replies/               # автоответы + server-secrets
docs/wb-api/                        # OpenAPI WB
.cursor/rules/seller-hub-advantage.mdc
```

Полезные тесты:
```
npx tsx --test src/lib/seller-hub/wb-token.test.ts
npx tsx --test src/lib/seller-hub/task-engine/priority.test.ts
npx tsx --test src/lib/seller-hub/task-engine/engine.test.ts
npx tsx --test src/lib/seller-hub/stock-risk.test.ts
npx tsx --test src/lib/auto-replies/server-secrets.test.ts
npx tsx --test src/components/seller-hub/top-actions.test.ts
```

---

## 12. Честность аудита: чего этот бриф не знает

- Состояние env на production Timeweb.
- Живые ответы WB (Jam/429) на конкретном кабинете пользователя.
- Git blame / полный changelog коммитов (git был недоступен при сборке брифа).
- Функции GVO — только вопросы для research, не утверждения.
- Внешние договорённости вне этого файла и `.cursor/rules` — уточнять у владельца продукта.

---

## 13. Одно предложение для старта Claude

**KARTO — ИИ-копилот продавца МП (контент + автоответы + платежи) с растущим Seller Hub: серверный WB-токен, каталог/экономика, Events/Tasks/Priority уже V1; следующий капитальный кусок — выровнять продажи/воронку/заказы как единый достоверный контракт данных, не переписывая готовый Task Engine и не делая Обзор 2.0 раньше времени.**

---

*Конец брифа. При обновлении статуса этапов правь §8–9 и дату среза в шапке.*
