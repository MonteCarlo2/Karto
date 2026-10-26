## 01-general.yaml
- title: ?
- paths: 10
- servers: https://common-api.wildberries.ru, https://common-api.wildberries.ru, https://common-api.wildberries.ru, https://feedbacks-api.wildberries.ru, https://common-api.wildberries.ru, https://common-api.wildberries.ru
  - `/ping`
  - `/api/communications/v2/news`
  - `/api/v1/seller-info`
  - `/api/common/v1/rating`
  - `/api/common/v1/subscriptions`
  - `/api/common/v1/tariff-constructor/options`
  - `/api/v1/invite`
  - `/api/v1/users`
  - `/api/v1/users/access`
  - `/api/v1/user`

## 02-items.yaml
- title: ?
- paths: 45
- servers: https://content-api.wildberries.ru, https://content-api-sandbox.wildberries.ru, https://content-api.wildberries.ru, https://content-api-sandbox.wildberries.ru, https://content-api.wildberries.ru, https://content-api-sandbox.wildberries.ru
  - `/content/v2/object/parent/all`
  - `/content/v2/object/all`
  - `/content/v2/object/charcs/{subjectId}`
  - `/content/v2/directory/colors`
  - `/content/v2/directory/kinds`
  - `/content/v2/directory/countries`
  - `/content/v2/directory/seasons`
  - `/content/v2/directory/vat`
  - `/content/v2/directory/tnved`
  - `/api/content/v1/brands`
  - `/content/v2/tags`
  - `/content/v2/tag`
  - `/content/v2/tag/{id}`
  - `/content/v2/tag/nomenclature/link`
  - `/content/v2/get/cards/list`
  - … +30 more

## 03-orders-fbs.yaml
- title: ?
- paths: 39
- servers: https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru
  - `/api/v3/passes/offices`
  - `/api/v3/passes`
  - `/api/v3/passes/{passId}`
  - `/api/v3/orders/new`
  - `/api/v3/orders`
  - `/api/v3/orders/status`
  - `/api/v3/supplies/orders/reshipment`
  - `/api/v3/orders/{orderId}/cancel`
  - `/api/v3/orders/stickers`
  - `/api/marketplace/v3/orders/meta`
  - `/api/v3/orders/{orderId}/meta`
  - `/api/v3/orders/{orderId}/meta/sgtin`
  - `/api/v3/orders/{orderId}/meta/uin`
  - `/api/v3/orders/{orderId}/meta/imei`
  - `/api/v3/orders/{orderId}/meta/gtin`
  - … +24 more

## 04-orders-dbw.yaml
- title: ?
- paths: 16
- servers: https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru
  - `/api/v3/dbw/orders/new`
  - `/api/v3/dbw/orders`
  - `/api/v3/dbw/orders/delivery-date`
  - `/api/marketplace/v3/dbw/orders/client`
  - `/api/v3/dbw/orders/status`
  - `/api/v3/dbw/orders/{orderId}/confirm`
  - `/api/v3/dbw/orders/stickers`
  - `/api/marketplace/v3/dbw/orders/status/deliver`
  - `/api/v3/dbw/orders/courier`
  - `/api/v3/dbw/orders/{orderId}/cancel`
  - `/api/marketplace/v3/dbw/orders/meta/details`
  - `/api/marketplace/v3/dbw/orders/meta/delete`
  - `/api/marketplace/v3/dbw/orders/meta/sgtin`
  - `/api/v3/dbw/orders/{orderId}/meta/uin`
  - `/api/v3/dbw/orders/{orderId}/meta/imei`
  - … +1 more

## 05-dbs.yaml
- title: ?
- paths: 21
- servers: https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru
  - `/api/v3/dbs/orders/new`
  - `/api/v3/dbs/orders`
  - `/api/marketplace/v3/dbs/orders/final-price`
  - `/api/v3/dbs/groups/info`
  - `/api/v3/dbs/orders/client`
  - `/api/marketplace/v3/dbs/orders/b2b/info`
  - `/api/v3/dbs/orders/delivery-date`
  - `/api/marketplace/v3/dbs/orders/status/info`
  - `/api/marketplace/v3/dbs/orders/status/cancel`
  - `/api/marketplace/v3/dbs/orders/status/confirm`
  - `/api/marketplace/v3/dbs/orders/stickers`
  - `/api/marketplace/v3/dbs/orders/status/deliver`
  - `/api/marketplace/v3/dbs/orders/status/receive`
  - `/api/marketplace/v3/dbs/orders/status/reject`
  - `/api/marketplace/v3/dbs/orders/meta/details`
  - … +6 more

## 06-in-store-pickup.yaml
- title: ?
- paths: 18
- servers: https://marketplace-api.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru, https://marketplace-api.wildberries.ru, https://marketplace-api-sandbox.wildberries.ru, https://marketplace-api.wildberries.ru
  - `/api/v3/click-collect/orders/new`
  - `/api/v3/click-collect/orders`
  - `/api/marketplace/v3/click-collect/orders/final-price`
  - `/api/marketplace/v3/click-collect/orders/status/confirm`
  - `/api/marketplace/v3/click-collect/orders/status/prepare`
  - `/api/v3/click-collect/orders/client`
  - `/api/v3/click-collect/orders/client/identity`
  - `/api/marketplace/v3/click-collect/orders/status/receive`
  - `/api/marketplace/v3/click-collect/orders/status/reject`
  - `/api/marketplace/v3/click-collect/orders/status/info`
  - `/api/marketplace/v3/click-collect/orders/status/cancel`
  - `/api/marketplace/v3/click-collect/orders/meta/details`
  - `/api/marketplace/v3/click-collect/orders/meta/delete`
  - `/api/marketplace/v3/click-collect/orders/meta/sgtin`
  - `/api/marketplace/v3/click-collect/orders/meta/uin`
  - … +3 more

## 07-orders-fbw.yaml
- title: ?
- paths: 10
- servers: https://supplies-api.wildberries.ru, https://supplies-api-sandbox.wildberries.ru, https://supplies-api.wildberries.ru, https://supplies-api-sandbox.wildberries.ru, https://supplies-api.wildberries.ru, https://supplies-api.wildberries.ru
  - `/api/v1/acceptance/options`
  - `/api/v1/warehouses`
  - `/api/v1/transit-tariffs`
  - `/api/v1/supplies`
  - `/api/v1/supplies/{ID}`
  - `/api/v1/supplies/{ID}/goods`
  - `/api/v1/supplies/{ID}/package`
  - `/api/supplies/v1/drafts`
  - `/api/supplies/v1/drafts/{draftId}`
  - `/api/supplies/v1/drafts/{draftId}/items`

## 08-promotion.yaml
- title: ?
- paths: 39
- servers: https://advert-api.wildberries.ru, https://advert-api-sandbox.wildberries.ru, https://advert-api.wildberries.ru, https://advert-api.wildberries.ru, https://advert-api.wildberries.ru, https://advert-api-sandbox.wildberries.ru
  - `/adv/v1/promotion/count`
  - `/api/advert/v2/adverts`
  - `/api/advert/v1/bids/min`
  - `/adv/v2/seacat/save-ad`
  - `/adv/v1/supplier/subjects`
  - `/adv/v2/supplier/nms`
  - `/adv/v0/delete`
  - `/adv/v0/rename`
  - `/adv/v0/start`
  - `/adv/v0/pause`
  - `/adv/v0/stop`
  - `/adv/v0/auction/placements`
  - `/api/advert/v1/bids`
  - `/adv/v1/balance`
  - `/api/advert/v2/budget`
  - … +24 more

## 09-communications.yaml
- title: ?
- paths: 21
- servers: https://feedbacks-api.wildberries.ru, https://feedbacks-api-sandbox.wildberries.ru, https://feedbacks-api.wildberries.ru, https://feedbacks-api-sandbox.wildberries.ru, https://feedbacks-api.wildberries.ru, https://feedbacks-api-sandbox.wildberries.ru
  - `/api/v1/new-feedbacks-questions`
  - `/api/v1/questions/count-unanswered`
  - `/api/v1/questions/count`
  - `/api/v1/questions`
  - `/api/v1/question`
  - `/api/v1/feedbacks/count-unanswered`
  - `/api/v1/feedbacks/count`
  - `/api/v1/feedbacks`
  - `/api/v1/feedbacks/answer`
  - `/api/v1/feedbacks/order/return`
  - `/api/v1/feedback`
  - `/api/v1/feedbacks/archive`
  - `/api/feedbacks/v1/pins`
  - `/api/feedbacks/v1/pins/count`
  - `/api/feedbacks/v1/pins/limits`
  - … +6 more

## 10-rates.yaml
- title: ?
- paths: 5
- servers: https://common-api.wildberries.ru, https://common-api.wildberries.ru, https://common-api.wildberries.ru, https://common-api.wildberries.ru, https://common-api.wildberries.ru
  - `/api/v1/tariffs/commission`
  - `/api/tariffs/v1/acceptance/coefficients`
  - `/api/v1/tariffs/box`
  - `/api/v1/tariffs/pallet`
  - `/api/v1/tariffs/return`

## 11-analytics.yaml
- title: ?
- paths: 19
- servers: https://seller-analytics-api.wildberries.ru, https://seller-analytics-api.wildberries.ru, https://seller-analytics-api.wildberries.ru, https://seller-analytics-api.wildberries.ru, https://seller-analytics-api.wildberries.ru, https://seller-analytics-api.wildberries.ru
  - `/api/analytics/v3/sales-funnel/products`
  - `/api/analytics/v3/sales-funnel/products/history`
  - `/api/analytics/v3/sales-funnel/grouped/history`
  - `/api/v2/nm-report/downloads`
  - `/api/v2/nm-report/downloads/retry`
  - `/api/v2/nm-report/downloads/file/{downloadId}`
  - `/api/v2/search-report/report`
  - `/api/v2/search-report/table/groups`
  - `/api/v2/search-report/table/details`
  - `/api/v2/search-report/product/search-texts`
  - `/api/v2/search-report/product/orders`
  - `/api/analytics/v1/stocks-report/wb-warehouses`
  - `/api/analytics/v1/stocks-report/seller-warehouses`
  - `/api/v2/stocks-report/products/groups`
  - `/api/v2/stocks-report/products/products`
  - … +4 more

## 12-reports.yaml
- title: ?
- paths: 23
- servers: https://statistics-api.wildberries.ru, https://statistics-api-sandbox.wildberries.ru, https://statistics-api.wildberries.ru, https://statistics-api-sandbox.wildberries.ru, https://seller-analytics-api.wildberries.ru, https://seller-analytics-api.wildberries.ru
  - `/api/v1/supplier/orders`
  - `/api/v1/supplier/sales`
  - `/api/v1/analytics/excise-report`
  - `/api/v1/warehouse_remains`
  - `/api/v1/warehouse_remains/tasks/{task_id}/status`
  - `/api/v1/warehouse_remains/tasks/{task_id}/download`
  - `/api/analytics/v1/measurement-penalties`
  - `/api/analytics/v1/warehouse-measurements`
  - `/api/analytics/v1/deductions`
  - `/api/v1/analytics/antifraud-details`
  - `/api/v1/analytics/goods-labeling`
  - `/api/v1/acceptance_report`
  - `/api/v1/acceptance_report/tasks/{task_id}/status`
  - `/api/v1/acceptance_report/tasks/{task_id}/download`
  - `/api/v1/paid_storage`
  - … +8 more

## 13-finances.yaml
- title: ?
- paths: 11
- servers: https://finance-api.wildberries.ru, https://finance-api.wildberries.ru, https://finance-api.wildberries.ru, https://finance-api.wildberries.ru, https://finance-api.wildberries.ru, https://finance-api.wildberries.ru
  - `/api/v1/account/balance`
  - `/api/finance/v1/sales-reports/list`
  - `/api/finance/v1/sales-reports/detailed/{reportId}`
  - `/api/finance/v1/sales-reports/detailed`
  - `/api/finance/v1/acquiring/list`
  - `/api/finance/v1/acquiring/detailed/{reportId}`
  - `/api/finance/v1/acquiring/detailed`
  - `/api/v1/documents/categories`
  - `/api/v1/documents/list`
  - `/api/v1/documents/download`
  - `/api/v1/documents/download/all`
