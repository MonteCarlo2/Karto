# Реестр правил задач Seller Hub

Описание по коду `src/lib/seller-hub/task-engine/` на момент пакета C (сглаженный выкуп, спрос 56д, хранение FBS/WB, диагноз NO_SALES по магазину; стандарт v0.3 §3.2–3.4).  
`priority.ts`, Events, Обзор, токен и автоответы сюда не входят — не менялись.

Общие сведения:
- Черновики собирает `reconcileTasks` (`engine.ts`): сначала `finalizeNoSalesDrafts` (BH по магазину), затем `collectDrafts` с `ShopBuyoutContext`.
- Важность по деньгам: `severity.ts`. Пороги в `DEFAULT_TASK_THRESHOLDS` — без изменений пакета C.
- Отчёт по остаткам: `POST /api/v2/stocks-report/products/products` → `snapshot.stocksReport`.
- Платное хранение: `GET /api/v1/paid_storage` (async create/status/download, max 8 дней) → `snapshot.paidStorage` → `fact.storagePerUnitDay`.
- Спрос и запас: `stock-math.ts` (`smoothProductBuyout`, `dailyDemand` + `orders_56d`, `resolveStorageMoneyAtRisk`).
- Реализация: `realizationNeedsReload(syncedAt)` — обновляется при sync Hub, как воронка.
- `officeMissingTime` в формулы дней наличия **не** входит — только evidence.
- Спрос (4 типа) → FDR → взаимное исключение. Severity через `baseSeverity` = floor = ceiling.
- **Взаимоисключение:** `TASK_NO_SALES` вытесняет `TASK_EXCESS_STOCK` по тому же nmId.

Стандарт: `docs/seller-hub/rules-standard.md`.

### Поля stocks-report / paid_storage / каталог

| Поле | Категория | Почему |
|---|---|---|
| `toClientCount`, `fromClientCount` | формула (доступный запас) | «В пути к/от клиента, шт.» |
| `pastBuyoutCount` / `pastOrderCount` | формула (сглаженный b) | прошлое окно воронки |
| `stockFbo` / `stockFbs` | формула хранения | доля WB vs склад продавца |
| `stockCount` | формула (on-hand) | «Остатки на текущий день, шт.» |
| `lostOrdersCount` / `lostOrdersSum` | показ как основные WB в 3.1 | «Упущенные заказы» |
| `availability` | evidence + потолок при deficient | enum |
| `officeMissingTime` | только evidence | агрегация по складам неоднозначна |
| paid_storage `warehousePrice` / `barcodesCount` | формула (ставка хранения) | ₽/шт/день; barcodesCount = подлежащие тарифицированию |
| realization `paidStorage` / `storage` | evidence; **не** ставка | нет среднего остатка за период |
| `realizationLoadedAt` | evidence при burn/b_shop из реализации | дата данных |

---

## TASK_STOCK_OUT (§3.1)

- Без изменений формул пакета C (b через сглаживание, если есть контекст магазина).
- **Тесты:** `severity.test.ts`, `engine.test.ts`.

## TASK_LOW_STOCK (§3.2)

- Спрос: + ветка `orders_56d`. Выкуп: `smoothProductBuyout` + `b_shop`.
- **Тесты:** `severity.test.ts`, `package-c.test.ts`, `engine.test.ts`.

## TASK_EXCESS_STOCK (§3.3) — пакет C

- Излишек = доступный − чистый расход×90. b сглажен; realization burn только при b = null.
- Деньги = `resolveStorageMoneyAtRisk` (FBS → 0; доля WB; иначе paid_storage × 28).
- Illiquid raise ≤ important; deficient → ≤ opportunity.
- **Тесты:** `excess-nosales.test.ts`, `package-c.test.ts`, `severity.test.ts`, `engine.test.ts`.

## TASK_STAGNANT_CAPITAL

- Объединено с TASK_EXCESS_STOCK. `ruleStagnantCapital` → null.

## TASK_NO_SALES (§3.4) — пакет C

- Условия без изменений; диагноз — `no-sales-diag.ts` (cA/cB магазина без товара, Пуассон, BH q=0.05).
- `finalizeNoSalesDrafts` в `reconcileTasks`.
- Деньги хранения с учётом FBS/WB; illiquid raise как в 3.3.
- Вытесняет EXCESS по nmId.
- **Тесты:** `package-c.test.ts`, `excess-nosales.test.ts`.

## TASK_SALES_DROP / GROWTH / CONVERSION_DROP / LOW_TRAFFIC

- Без изменения статистических ворот.

## Маржа (§3.5–3.7) — пакет unit economics

- Общая функция: `computeUnitEconomics` (`unit-economics.ts`) + `productUnitEconomics`.
- Реализация v4: окна current/prior по `rrDate`, поля S/Pay/L/A/Pen/rebill; сверка `bankPaymentSum` (rebill не в L).
- Хранение товара: `paid_storage` за 56 дней (`currentWindowRub` / `priorWindowRub`).
- `TASK_NEGATIVE_MARGIN` / `TASK_MARGIN_NEAR_ZERO` / `TASK_MARGIN_DETERIORATION` / `TASK_LOW_MARGIN` / `TASK_COST_MISSING`.
- Взаимоисключение: убыточная > ухудшилась > ниже целевой.
- Настройки: `tax_rate_percent`, `target_margin_percent`; история себестоимости — `seller_hub_cost_history`.
- **Тесты:** `unit-economics.test.ts`, `engine.test.ts`.

## Контент / отзывы

- `TASK_LOW_CONTENT_SCORE`: severity ≤ opportunity (решение 5), пока нет рублёвой оценки.

---

## Пороги (`DEFAULT_TASK_THRESHOLDS`) — пакет C

Пороги важности **не менялись**. Константы сглаживания / диагноза в коде: K=20 (buyout), E≥3 (Пуассон), BH q=0.05, shop orders ≥20.

---

## Типы с пометкой «требует пересмотра»

| Тип | Что смущает |
|---|---|
| TASK_LOW_MARGIN | порог null, нет UI |
| TASK_MARGIN_DETERIORATION | 5 п.п. без шума выборки |
| TASK_CONTENT_OPPORTUNITY | продажи без статистики |
| TASK_LOW_PHOTO_COUNT | отключено |
| TASK_UNANSWERED_* | любой счётчик >0 |
| paid_storage period | API max 8 дней — ставка за короткий период, не 28 |
| b_shop из реализации | в снимке реализации нет счётчика заказов отдельно от qty продаж |
| наличие 56д | нет подневной истории остатков / stockInAt |
| FBO/FBS в старой выгрузке | до пакета C diagnostics не писала stockFbo/stockFbs |
