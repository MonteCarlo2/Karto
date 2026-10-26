# Wildberries OpenAPI — локальная база Seller Hub

Официальные swagger YAML для опоры при разработке KARTO Seller Hub.
**Перед любым новым WB-интеграционным решением** сначала смотри сюда, а не угадывай эндпоинты.

## Источник

| Поле | Значение |
| --- | --- |
| Официальный URL | `https://dev.wildberries.ru/api/swagger/yaml/ru/{name}.yaml` |
| Зеркало (скачано) | `https://raw.githubusercontent.com/eslazarev/wildberries-sdk/main/specs/` |
| Дата снимка | 2026-09-18 |
| Почему зеркало | Прямой `dev.wildberries.ru` отдаёт antibot `498` / HTML challenge из этой среды |

Файлы в `swagger/` названы **как у пользователя** (официальные имена WB).

## Файлы

| Файл | Раздел | Seller Hub |
| --- | --- | --- |
| `01-general.yaml` | Общее, Джем, seller-info | Токены, подписка Джем |
| `02-items.yaml` | Товары / контент / цены | Каталог, карточки, Prices |
| `03-orders-fbs.yaml` | Заказы FBS | Сборка FBS |
| `04-orders-dbw.yaml` | Заказы DBW | — |
| `05-dbs.yaml` | DBS | — |
| `06-in-store-pickup.yaml` | Самовывоз | — |
| `07-orders-fbw.yaml` | Поставки FBW | FBW |
| `08-promotion.yaml` | Маркетинг и продвижение | **Акции, реклама** |
| `09-communications.yaml` | Общение с покупателями | Отзывы / чаты |
| `10-rates.yaml` | Тарифы | Комиссии |
| `11-analytics.yaml` | Аналитика | Отчёты продаж |
| `12-reports.yaml` | Отчёты | Реализация |
| `13-finances.yaml` | Документы и бухгалтерия | — |

Краткий список path’ов: [`_paths_extract.md`](./_paths_extract.md).

## Обновить снимок

```powershell
# Если antibot снова режет official — зеркало GitHub:
$out = "docs/wb-api/swagger"
$base = "https://raw.githubusercontent.com/eslazarev/wildberries-sdk/main/specs"
# затем curl каждого *.yaml из таблицы выше
```

Или вручную скачать с `dev.wildberries.ru` из браузера (пройти challenge) и положить в `swagger/`.

## Жёсткие выводы для Seller Hub (из спеки 2026-09-18)

### Календарь акций (`08-promotion.yaml`)

Только 4 метода:

1. `GET /api/v1/calendar/promotions` — список акций  
2. `GET /api/v1/calendar/promotions/details` — детали + счётчики; у `type: auto` есть поле `exceptionProductsCount` («исключены до старта»)  
3. `GET /api/v1/calendar/promotions/nomenclatures` — товары + пороги — **«неприменим для автоакций»**  
4. `POST /api/v1/calendar/promotions/upload` — добавить в акцию — **«неприменим для автоакций»**

В OpenAPI **нет** метода:

- выгрузки Excel акции;
- списка исключений автоакции;
- записи «исключить товар из автоакции до старта»;
- порога/% по nmID для авто.

Вывод: кабинет умеет исключения до старта (`exceptionProductsCount`), Seller API — только читать счётчик, не управлять.

### Обычные акции (`type: regular`)

`nomenclatures` + `upload` — рабочие рычаги (порог / участие).

### Автоакции (`type: auto`)

Участие через цену/скидку (Prices в блоке товаров), не через calendar upload.  
Предстартовый opt-out через публичный API **не документирован**.

### Джем (`01-general.yaml`)

- `GET /api/common/v1/subscriptions` — статус подписки Джем  
- Часть аналитики/опций помечена как доступная только с Джем  

Перед фичей с «Джем» — проверять этот метод и категорию токена.

## Правило для агента

При задачах Seller Hub / WB API:

1. Открыть нужный YAML в `docs/wb-api/swagger/`.  
2. Не предлагать эндпоинты вне спеки.  
3. Если кабинет умеет, а YAML молчит — считать **undocumented / недоступно**, пока нет Network-доказательства.
