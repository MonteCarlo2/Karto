# Матрица возможностей WB API (генерируется)

Источник: `docs/wb-api/swagger` через `WB_LIMIT_ROWS`. Колонка «в коде»: путь метода встречается в нашем коде. Запись = метод изменяет данные в кабинете.

Всего методов: 300; методов записи: 105; из них используется: 35; не подключено: 70.

## Аналитика и воронка
Методов 28, записи 0, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| POST | `/api/analytics/v3/sales-funnel/products` | нет | да |
| POST | `/api/analytics/v3/sales-funnel/products/history` | нет | нет |
| POST | `/api/analytics/v3/sales-funnel/grouped/history` | нет | да |
| POST | `/api/v2/nm-report/downloads` | нет | нет |
| GET | `/api/v2/nm-report/downloads` | нет | нет |
| POST | `/api/v2/nm-report/downloads/retry` | нет | нет |
| GET | `/api/v2/nm-report/downloads/file/{downloadId}` | нет | нет |
| POST | `/api/v2/search-report/report` | нет | нет |
| POST | `/api/v2/search-report/table/groups` | нет | нет |
| POST | `/api/v2/search-report/table/details` | нет | нет |
| POST | `/api/v2/search-report/product/search-texts` | нет | да |
| POST | `/api/v2/search-report/product/orders` | нет | нет |
| POST | `/api/analytics/v1/stocks-report/wb-warehouses` | нет | да |
| POST | `/api/analytics/v1/stocks-report/seller-warehouses` | нет | нет |
| POST | `/api/analytics/v2/item-rating` | нет | нет |
| POST | `/api/analytics/v1/order-feed` | нет | нет |
| POST | `/api/v1/analytics/excise-report` | нет | нет |
| GET | `/api/analytics/v1/measurement-penalties` | нет | нет |
| GET | `/api/analytics/v1/warehouse-measurements` | нет | нет |
| GET | `/api/analytics/v1/deductions` | нет | нет |
| GET | `/api/v1/analytics/antifraud-details` | нет | нет |
| GET | `/api/v1/analytics/goods-labeling` | нет | нет |
| GET | `/api/v1/analytics/region-sale` | нет | нет |
| GET | `/api/v1/analytics/brand-share/brands` | нет | нет |
| GET | `/api/v1/analytics/brand-share/parent-subjects` | нет | нет |
| GET | `/api/v1/analytics/brand-share` | нет | нет |
| GET | `/api/v1/analytics/banned-products/blocked` | нет | да |
| GET | `/api/v1/analytics/goods-return` | нет | нет |

## Календарь акций WB
Методов 4, записи 1, подключено 1.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/api/v1/calendar/promotions` | нет | да |
| GET | `/api/v1/calendar/promotions/details` | нет | да |
| GET | `/api/v1/calendar/promotions/nomenclatures` | нет | да |
| POST | `/api/v1/calendar/promotions/upload` | да | да |

## Карточки: чтение, создание, правка, удаление
Методов 9, записи 7, подключено 1.

| метод | путь | запись | в коде |
|---|---|---|---|
| POST | `/content/v2/get/cards/list` | нет | да |
| POST | `/content/v2/cards/update` | да | да |
| POST | `/content/v2/cards/moveNm` | да | нет |
| POST | `/content/v2/cards/delete/trash` | да | нет |
| POST | `/content/v2/cards/recover` | да | нет |
| POST | `/content/v2/get/cards/trash` | нет | нет |
| POST | `/content/v2/barcodes` | да | нет |
| POST | `/content/v2/cards/upload` | да | нет |
| POST | `/content/v2/cards/upload/add` | да | нет |

## Медиа: фото и видео
Методов 2, записи 2, подключено 2.

| метод | путь | запись | в коде |
|---|---|---|---|
| POST | `/content/v3/media/file` | да | да |
| POST | `/content/v3/media/save` | да | да |

## Остатки и склады продавца (FBS)
Методов 8, записи 5, подключено 3.

| метод | путь | запись | в коде |
|---|---|---|---|
| PUT | `/api/v3/stocks/{warehouseId}` | да | да |
| DELETE | `/api/v3/stocks/{warehouseId}` | да | да |
| POST | `/api/v3/stocks/{warehouseId}` | нет | да |
| GET | `/api/v3/offices` | нет | нет |
| GET | `/api/v3/warehouses` | нет | да |
| POST | `/api/v3/warehouses` | да | да |
| PUT | `/api/v3/warehouses/{warehouseId}` | да | нет |
| DELETE | `/api/v3/warehouses/{warehouseId}` | да | нет |

## Отзывы и вопросы
Методов 16, записи 6, подключено 3.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/api/v1/questions/count-unanswered` | нет | да |
| GET | `/api/v1/questions/count` | нет | да |
| GET | `/api/v1/questions` | нет | да |
| PATCH | `/api/v1/questions` | да | да |
| GET | `/api/v1/feedbacks/count-unanswered` | нет | да |
| GET | `/api/v1/feedbacks/count` | нет | да |
| GET | `/api/v1/feedbacks` | нет | да |
| POST | `/api/v1/feedbacks/answer` | да | да |
| PATCH | `/api/v1/feedbacks/answer` | да | да |
| POST | `/api/v1/feedbacks/order/return` | да | нет |
| GET | `/api/v1/feedbacks/archive` | нет | нет |
| GET | `/api/feedbacks/v1/pins` | нет | нет |
| POST | `/api/feedbacks/v1/pins` | да | нет |
| DELETE | `/api/feedbacks/v1/pins` | да | нет |
| GET | `/api/feedbacks/v1/pins/count` | нет | нет |
| GET | `/api/feedbacks/v1/pins/limits` | нет | нет |

## Отчёты и финансы
Методов 9, записи 0, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/api/v1/supplier/orders` | нет | да |
| GET | `/api/v1/supplier/sales` | нет | нет |
| GET | `/api/v1/account/balance` | нет | да |
| POST | `/api/finance/v1/sales-reports/list` | нет | да |
| POST | `/api/finance/v1/sales-reports/detailed/{reportId}` | нет | нет |
| POST | `/api/finance/v1/sales-reports/detailed` | нет | да |
| POST | `/api/finance/v1/acquiring/list` | нет | нет |
| POST | `/api/finance/v1/acquiring/detailed/{reportId}` | нет | нет |
| POST | `/api/finance/v1/acquiring/detailed` | нет | нет |

## Профиль продавца, новости, доступы
Методов 9, записи 3, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/api/communications/v2/news` | нет | да |
| GET | `/api/v1/seller-info` | нет | да |
| GET | `/api/common/v1/rating` | нет | нет |
| GET | `/api/common/v1/subscriptions` | нет | да |
| GET | `/api/common/v1/tariff-constructor/options` | нет | нет |
| POST | `/api/v1/invite` | да | нет |
| GET | `/api/v1/users` | нет | нет |
| PUT | `/api/v1/users/access` | да | нет |
| DELETE | `/api/v1/user` | да | нет |

## Прочее
Методов 67, записи 16, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/ping` | нет | да |
| POST | `/content/v2/cards/error/list` | нет | нет |
| GET | `/content/v2/cards/limits` | нет | нет |
| POST | `/api/content/v1/recommendations/list` | нет | нет |
| POST | `/api/content/v1/recommendations/set` | да | нет |
| POST | `/api/discounts-prices/v1/upload/task/b2b/wholesale` | да | нет |
| GET | `/api/v3/dbw/warehouses/{warehouseId}/contacts` | нет | нет |
| PUT | `/api/v3/dbw/warehouses/{warehouseId}/contacts` | да | нет |
| GET | `/api/v3/passes/offices` | нет | нет |
| GET | `/api/v3/passes` | нет | нет |
| PUT | `/api/v3/passes/{passId}` | да | нет |
| DELETE | `/api/v3/passes/{passId}` | да | нет |
| GET | `/api/v3/dbw/orders/new` | нет | нет |
| GET | `/api/v3/dbw/orders` | нет | нет |
| POST | `/api/v3/dbw/orders/delivery-date` | нет | нет |
| POST | `/api/v3/dbw/orders/status` | нет | нет |
| PATCH | `/api/v3/dbw/orders/{orderId}/confirm` | да | нет |
| POST | `/api/v3/dbw/orders/stickers` | нет | нет |
| POST | `/api/v3/dbw/orders/courier` | нет | нет |
| PATCH | `/api/v3/dbw/orders/{orderId}/cancel` | да | нет |
| PUT | `/api/v3/dbw/orders/{orderId}/meta/uin` | да | нет |
| PUT | `/api/v3/dbw/orders/{orderId}/meta/imei` | да | нет |
| PUT | `/api/v3/dbw/orders/{orderId}/meta/gtin` | да | нет |
| GET | `/api/v3/dbs/orders/new` | нет | нет |
| GET | `/api/v3/dbs/orders` | нет | нет |
| POST | `/api/v3/dbs/groups/info` | нет | нет |
| POST | `/api/v3/dbs/orders/client` | нет | нет |
| POST | `/api/v3/dbs/orders/delivery-date` | нет | нет |
| GET | `/api/v3/click-collect/orders/new` | нет | нет |
| GET | `/api/v3/click-collect/orders` | нет | нет |
| POST | `/api/v3/click-collect/orders/client` | нет | нет |
| POST | `/api/v3/click-collect/orders/client/identity` | нет | нет |
| GET | `/api/v1/warehouses` | нет | нет |
| GET | `/api/v1/transit-tariffs` | нет | нет |
| POST | `/api/v1/supplies` | нет | да |
| GET | `/api/v1/supplies/{ID}` | нет | нет |
| GET | `/api/v1/supplies/{ID}/goods` | нет | нет |
| GET | `/api/v1/supplies/{ID}/package` | нет | нет |
| GET | `/api/supplies/v1/drafts` | нет | нет |
| POST | `/api/supplies/v1/drafts` | да | нет |
| DELETE | `/api/supplies/v1/drafts/{draftId}` | да | нет |
| GET | `/api/supplies/v1/drafts/{draftId}/items` | нет | нет |
| POST | `/api/supplies/v1/drafts/{draftId}/items` | да | нет |
| DELETE | `/api/supplies/v1/drafts/{draftId}/items` | да | нет |
| GET | `/api/v1/new-feedbacks-questions` | нет | нет |
| GET | `/api/v1/question` | нет | да |
| GET | `/api/v1/feedback` | нет | да |
| GET | `/api/v1/seller/chats` | нет | нет |
| GET | `/api/v1/seller/events` | нет | нет |
| POST | `/api/v1/seller/message` | да | нет |
| GET | `/api/v1/seller/download/{id}` | нет | нет |
| GET | `/api/v1/claims` | нет | нет |
| PATCH | `/api/v1/claim` | да | нет |
| POST | `/api/v2/stocks-report/products/groups` | нет | нет |
| POST | `/api/v2/stocks-report/products/products` | нет | да |
| POST | `/api/v2/stocks-report/products/sizes` | нет | нет |
| POST | `/api/v2/stocks-report/offices` | нет | нет |
| GET | `/api/v1/warehouse_remains` | нет | нет |
| GET | `/api/v1/warehouse_remains/tasks/{task_id}/status` | нет | нет |
| GET | `/api/v1/warehouse_remains/tasks/{task_id}/download` | нет | нет |
| GET | `/api/v1/paid_storage` | нет | да |
| GET | `/api/v1/paid_storage/tasks/{task_id}/status` | нет | да |
| GET | `/api/v1/paid_storage/tasks/{task_id}/download` | нет | да |
| GET | `/api/v1/documents/categories` | нет | нет |
| GET | `/api/v1/documents/list` | нет | да |
| GET | `/api/v1/documents/download` | нет | нет |
| POST | `/api/v1/documents/download/all` | нет | нет |

## Реклама: кампании, ставки, бюджет
Методов 36, записи 14, подключено 10.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/adv/v1/promotion/count` | нет | да |
| GET | `/api/advert/v2/adverts` | нет | да |
| POST | `/api/advert/v1/bids/min` | нет | да |
| POST | `/adv/v2/seacat/save-ad` | да | да |
| GET | `/adv/v1/supplier/subjects` | нет | нет |
| POST | `/adv/v2/supplier/nms` | нет | нет |
| GET | `/adv/v0/delete` | да | нет |
| POST | `/adv/v0/rename` | да | нет |
| GET | `/adv/v0/start` | да | да |
| GET | `/adv/v0/pause` | да | да |
| GET | `/adv/v0/stop` | да | нет |
| PUT | `/adv/v0/auction/placements` | да | да |
| PATCH | `/api/advert/v1/bids` | да | да |
| GET | `/adv/v1/balance` | нет | да |
| POST | `/api/advert/v2/budget` | нет | да |
| GET | `/adv/v1/budget` | нет | да |
| POST | `/adv/v1/budget/deposit` | да | да |
| GET | `/adv/v1/upd` | нет | нет |
| GET | `/adv/v1/payments` | нет | нет |
| PATCH | `/adv/v0/auction/nms` | да | да |
| GET | `/api/advert/v0/bids/recommendations` | нет | да |
| POST | `/adv/v0/normquery/stats` | нет | да |
| POST | `/adv/v0/normquery/get-bids` | нет | да |
| GET | `/api/advert/v1/config` | нет | нет |
| POST | `/api/advert/v1/normquery/bids` | да | нет |
| POST | `/adv/v0/normquery/bids` | да | да |
| DELETE | `/adv/v0/normquery/bids` | да | да |
| POST | `/adv/v0/normquery/get-minus` | нет | да |
| POST | `/adv/v0/normquery/set-minus` | да | да |
| GET | `/adv/v1/count` | нет | нет |
| GET | `/adv/v1/adverts` | нет | нет |
| GET | `/adv/v1/advert` | нет | нет |
| GET | `/adv/v3/fullstats` | нет | да |
| POST | `/adv/v1/stats` | нет | нет |
| POST | `/adv/v0/normquery/list` | нет | нет |
| POST | `/adv/v1/normquery/stats` | нет | нет |

## Сборочные задания и поставки FBS
Методов 77, записи 44, подключено 13.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/api/v3/orders/new` | нет | да |
| GET | `/api/v3/orders` | нет | да |
| POST | `/api/v3/orders/status` | нет | да |
| GET | `/api/v3/supplies/orders/reshipment` | нет | нет |
| PATCH | `/api/v3/orders/{orderId}/cancel` | да | да |
| POST | `/api/v3/orders/stickers` | нет | да |
| POST | `/api/marketplace/v3/orders/meta` | нет | нет |
| DELETE | `/api/v3/orders/{orderId}/meta` | да | да |
| PUT | `/api/v3/orders/{orderId}/meta/sgtin` | да | да |
| PUT | `/api/v3/orders/{orderId}/meta/uin` | да | да |
| PUT | `/api/v3/orders/{orderId}/meta/imei` | да | да |
| PUT | `/api/v3/orders/{orderId}/meta/gtin` | да | да |
| PUT | `/api/v3/orders/{orderId}/meta/expiration` | да | да |
| PUT | `/api/marketplace/v3/orders/{orderId}/meta/customs-declaration` | да | нет |
| POST | `/api/v3/orders/stickers/cross-border` | нет | нет |
| POST | `/api/v3/orders/status/history` | нет | нет |
| POST | `/api/v3/orders/client` | нет | нет |
| POST | `/api/v3/supplies` | да | да |
| GET | `/api/v3/supplies` | нет | да |
| GET | `/api/marketplace/v3/fbs/shipping-points` | нет | нет |
| PATCH | `/api/marketplace/v3/fbs/supplies/shipping-method` | да | нет |
| PATCH | `/api/marketplace/v3/fbs/supplies/waybill` | да | нет |
| PATCH | `/api/marketplace/v3/supplies/{supplyId}/orders` | да | да |
| GET | `/api/v3/supplies/{supplyId}` | нет | да |
| DELETE | `/api/v3/supplies/{supplyId}` | да | да |
| GET | `/api/marketplace/v3/supplies/{supplyId}/order-ids` | нет | да |
| PATCH | `/api/v3/supplies/{supplyId}/deliver` | да | да |
| GET | `/api/v3/supplies/{supplyId}/barcode` | нет | да |
| GET | `/api/v3/supplies/{supplyId}/trbx` | нет | да |
| POST | `/api/v3/supplies/{supplyId}/trbx` | да | да |
| DELETE | `/api/v3/supplies/{supplyId}/trbx` | да | да |
| POST | `/api/v3/supplies/{supplyId}/trbx/stickers` | нет | да |
| GET | `/api/marketplace/v3/fbs/dictionaries/countries/oksm` | нет | нет |
| PUT | `/api/marketplace/v3/fbs/supplies/{supplyId}/spot` | да | нет |
| POST | `/api/marketplace/v3/fbs/supplies/spot/list` | нет | нет |
| GET | `/api/marketplace/v3/fbs/supplies/{supplyId}/stickers/spot` | нет | нет |
| GET | `/api/marketplace/v3/fbs/orders/archive` | нет | нет |
| GET | `/api/marketplace/v3/fbs/settings/autoreturns` | нет | нет |
| PATCH | `/api/marketplace/v3/fbs/settings/autoreturns` | да | нет |
| POST | `/api/marketplace/v3/fbs/settings/autoreturns/items` | нет | нет |
| PATCH | `/api/marketplace/v3/fbs/settings/autoreturns/items` | да | нет |
| GET | `/api/marketplace/v3/fbs/settings/autoreturns/subcategories/restricted` | нет | нет |
| POST | `/api/marketplace/v3/dbw/orders/client` | нет | нет |
| POST | `/api/marketplace/v3/dbw/orders/status/deliver` | да | нет |
| POST | `/api/marketplace/v3/dbw/orders/meta/details` | нет | нет |
| POST | `/api/marketplace/v3/dbw/orders/meta/delete` | да | нет |
| POST | `/api/marketplace/v3/dbw/orders/meta/sgtin` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/final-price` | нет | нет |
| POST | `/api/marketplace/v3/dbs/orders/b2b/info` | нет | нет |
| POST | `/api/marketplace/v3/dbs/orders/status/info` | нет | нет |
| POST | `/api/marketplace/v3/dbs/orders/status/cancel` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/status/confirm` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/stickers` | нет | нет |
| POST | `/api/marketplace/v3/dbs/orders/status/deliver` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/status/receive` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/status/reject` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/details` | нет | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/delete` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/sgtin` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/uin` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/imei` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/gtin` | да | нет |
| POST | `/api/marketplace/v3/dbs/orders/meta/customs-declaration` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/final-price` | нет | нет |
| POST | `/api/marketplace/v3/click-collect/orders/status/confirm` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/status/prepare` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/status/receive` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/status/reject` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/status/info` | нет | нет |
| POST | `/api/marketplace/v3/click-collect/orders/status/cancel` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/details` | нет | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/delete` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/sgtin` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/uin` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/imei` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/gtin` | да | нет |
| POST | `/api/marketplace/v3/click-collect/orders/meta/customs-declaration` | да | нет |

## Справочники: предметы, характеристики, бренды
Методов 10, записи 0, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/content/v2/object/parent/all` | нет | нет |
| GET | `/content/v2/object/all` | нет | да |
| GET | `/content/v2/object/charcs/{subjectId}` | нет | да |
| GET | `/content/v2/directory/colors` | нет | нет |
| GET | `/content/v2/directory/kinds` | нет | нет |
| GET | `/content/v2/directory/countries` | нет | нет |
| GET | `/content/v2/directory/seasons` | нет | нет |
| GET | `/content/v2/directory/vat` | нет | нет |
| GET | `/content/v2/directory/tnved` | нет | нет |
| GET | `/api/content/v1/brands` | нет | нет |

## Тарифы и приёмка
Методов 9, записи 0, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| POST | `/api/v1/acceptance/options` | нет | нет |
| GET | `/api/v1/tariffs/commission` | нет | нет |
| GET | `/api/tariffs/v1/acceptance/coefficients` | нет | да |
| GET | `/api/v1/tariffs/box` | нет | да |
| GET | `/api/v1/tariffs/pallet` | нет | нет |
| GET | `/api/v1/tariffs/return` | нет | нет |
| GET | `/api/v1/acceptance_report` | нет | нет |
| GET | `/api/v1/acceptance_report/tasks/{task_id}/status` | нет | нет |
| GET | `/api/v1/acceptance_report/tasks/{task_id}/download` | нет | нет |

## Цены и скидки
Методов 11, записи 3, подключено 2.

| метод | путь | запись | в коде |
|---|---|---|---|
| POST | `/api/v2/upload/task` | да | да |
| POST | `/api/v2/upload/task/size` | да | нет |
| POST | `/api/v2/upload/task/club-discount` | да | да |
| GET | `/api/v2/history/tasks` | нет | нет |
| GET | `/api/v2/history/goods/task` | нет | да |
| GET | `/api/v2/buffer/tasks` | нет | нет |
| GET | `/api/v2/buffer/goods/task` | нет | нет |
| GET | `/api/v2/list/goods/filter` | нет | да |
| POST | `/api/v2/list/goods/filter` | нет | да |
| GET | `/api/v2/list/goods/size/nm` | нет | да |
| GET | `/api/v2/quarantine/goods` | нет | нет |

## Ярлыки карточек
Методов 5, записи 4, подключено 0.

| метод | путь | запись | в коде |
|---|---|---|---|
| GET | `/content/v2/tags` | нет | нет |
| POST | `/content/v2/tag` | да | нет |
| PATCH | `/content/v2/tag/{id}` | да | нет |
| DELETE | `/content/v2/tag/{id}` | да | нет |
| POST | `/content/v2/tag/nomenclature/link` | да | нет |
