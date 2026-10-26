# Реестр функций Seller Hub (что есть и что нельзя потерять при редизайне)

Правило: при любой переделке интерфейса (особенно когда будем делать «красиво») ничего из этого списка не удаляем и не прячем без решения Эрика. Перед редизайном раздела сверяемся с этим файлом. Ключевые файлы ниже проверяет тест `src/lib/seller-hub/feature-inventory.test.ts`: если файл удалён или переименован, тест падает.

Принципы, которые тоже входят в функционал:
- запись в кабинет WB только после явного подтверждения человека, каждое действие попадает в журнал;
- платные вызовы нейросети только с показом цены (ручные) или по автоматическому режиму с кэшем, паузой и суточным лимитом;
- оценки нейросети хранятся и не пересчитываются, пока не изменились данные;
- факты и числа считает программа, нейросеть только выбирает из закрытого списка вариантов;
- там, где данные требуют подписки «Джем», об этом написано прямо.

## Продвижение (реклама, карточки, SEO)
- Обзор: показатели рекламы (расход, CTR, заказы, ДРР, CPO), «ДРР общий», график по дням, советы с кнопками «Выполнить».
- Разбор кампаний нейросетью (автоматически при изменении цифр): вердикт, итог, до трёх вариантов; исполняет агент.
- Полоса «Агент рекламы предлагает» (предложения правил) со ссылкой в раздел «Агенты».
- Кампании: таблица, пауза/запуск, пополнение бюджета, добавить товар, зоны показов (поиск/рекомендации), массовое создание «1 товар = 1 кампания» до 100.
- Товары в рекламе: расход, ДРР, запас по марже, ассоциированные заказы.
- Запросы и ставки: ставки по товарам против рекомендованных WB, изменение ставки, поисковые запросы рекламы, ставки по отдельным кластерам (задать/изменить/сбросить), минус-фразы, проверка смысла запросов нейросетью, белый список «Оставить».
- Карточки: вердикт по каждой карточке (пять опор: трафик, конверсия, выкуп, контент, рейтинг), оценка фото нейросетью (с замерами резкости, яркости, разрешения), оценка названия и описания нейросетью, согласованность с продажами, план действий по проблемным карточкам (автоматически), переходы в «SEO-описания» и Поток.
- Откуда покупки: воронка магазина, источники заказов (реклама/органика), «что тормозит товары» (статистическая диагностика с потенциалом).
- Репутация: рейтинг, негатив и вопросы без ответа, динамика негатива (ответы остаются в Автоотзывах).
- Поиск и SEO: запросы покупателей, позиции, недостающие слова (нужна подписка Джем, сказано в интерфейсе).
- Акции: страница акций (календарь, участие), также доступна внутри Продвижения.

## Аналитика (8 вкладок, период 7/14/28/60/90 дней, только данные WB по вашему кабинету)
- Выбор периода сверху: воронка, остатки, деньги, динамика и реклама считаются за выбранный период и сравниваются с предыдущим таким же. Для 60 и 90 дней предыдущего периода в деньгах нет (в выгрузке WB 90 дней), реклама не больше 30 дней.
- Сводка → «Где теряются деньги»: только суммы из отчётов WB (упущенное без товара, убыток по товарам в минус, возвраты, штрафы, переплата за доставку) с источником и периодом.
- Реклама: расход, заказы по рекламе, ДРР рекламы и общий, CPO, CTR, доля рекламных заказов, по дням, кампании, расход без заказов.
- Сводка: показатели за 28 дней против предыдущих 28 (заказы, сумма, средний чек, выкуп, конверсии, упущено без товара), «Мониторинг по направлениям» (финансы, логистика, рейтинг, контент, воронка, остатки), выводы словами, ABC, главные изменения.
- Товары: раскрытие строки открывает экран артикула (воронка, деньги, склад и логистика по одному товару).
- Динамика: заказы по дням за 30/60/90 дней (с отменами, лучший день, половины периода, дни недели) и прежний экран за 7 дней.
- Воронка: просмотры → корзина → заказ → выкуп с прошлым периодом; товары с утечками.
- Товары: матрица со всеми показателями, фильтры, сортировка, ABC, CSV.
- Деньги: куда уходит выручка (удержания WB, логистика, хранение, приёмка), прибыль по себестоимости, по товарам, CSV.
- Остатки: что закончилось, заканчивается, залёживается (пороги настраиваются), упущенное, деньги в залежавшемся.
- Рынок WB: комиссии по вашим категориям из официальной таблицы против фактического удержания; честные пометки про Джем.

## Агенты
- Агент рекламы: пять правил (автопополнение, реклама без заказов, защита от убыточного ДРР, подъём ставки при запасе по марже, тестовая реклама), режимы «предлагать» и «автопилот» (автопилот у автопополнения, серверный проход `/api/seller-hub/agents/run`), очередь предложений, история.
- Журнал действий в базе (кто, что, когда, результат).
- Агенты цен и коммуникаций (заготовки).

## Заказы и логистика (объединённый раздел)
- Заказы и сборка FBS: статусы, возраст ожидающих заказов, создание поставки или добавление в уже открытую, отмена задания (с подтверждением, пишется в журнал), стикеры, QR, передача в доставку; «Поток заказов» (по дням, отмены, пики, концентрация).
- Поставки; Склады и регионы (спрос по регионам, остатки по складам, план отгрузки).

- Блок «Что сделать сейчас» над вкладками: новые заказы не в поставке (с кнопкой «Собрать поставку» по подтверждению), забытые открытые поставки, риск конца запаса на своём складе, повторяющиеся отмены, медленная отгрузка; пороги задаёт продавец.
- Поставки: скорость отгрузки по реальным датам (заказ → закрытие поставки), состав поставки, «В доставку» по подтверждению, QR.
- Агент логистики в разделе «Агенты»: предложения и правила (пороги), исполняет только сборку поставки по подтверждению, автоматического режима нет.

- Заказы: переключатель «Все заказы / По товарам» (заказы, отмены, ждут, в пути, выкуп, выручка, спрос в день, остаток склада, на сколько дней хватит), скачивание CSV.
- Склады и регионы: вкладка «Слоты приёмки» FBO (коэффициенты приёмки WB, бесплатные и платные дни, где лежит мой товар, CSV). Адрес метода у WB не подтверждён (404), нужна сверка.

- Склады и регионы → «Стоимость»: во сколько обходится логистика WB по товарам (цена доставки, рост к прошлым 28 дням, возвраты, доля в выручке, переплата от роста), из отчёта реализации, CSV.

- Предложения логистики из отчёта реализации и времени отправки: «много возвратов у товаров» (с отметкой «высокий возврат» в таблице «Стоимость»), «доставка подорожала», «заказы приходят после обычной отправки».

- «Стоимость» → «Что даст вдвое меньше возвратов»: гипотеза экономии в месяц по товарам через утверждённую маржу на 1 продажу (только логистика, без роста выручки).
- Вечернее напоминание об отправке (порог по часам Москвы, настраивается; 24 — выкл.).

- Склады и регионы → «Регионы»: где чаще отменяют заказы (доля отмен по округам против среднего по магазину).

- Склады и регионы → «Регионы»: заказы по дням недели (среднее на один день недели, без отмен, законченные дни).

- Поставки → «Ритм по дням недели»: в какие дни закрывают поставки и сколько ждут заказы этого дня; совет «в дни без отправок заказы ждут дольше».

## Выключено решением владельца (код сохранён, флаги в src/lib/seller-hub/feature-flags.ts)
- Запись по FBS-поставкам: сборка поставки, «В доставку», QR, стикеры, отмена задания, кнопка «Собрать поставку» в блоке «Что сделать сейчас» (SUPPLY_WRITE_ENABLED). Люди делают это в кабинете WB. Чтение (состав поставки, скорость отгрузки) остаётся.
- Вкладка «Слоты приёмки» FBO (ACCEPTANCE_SLOTS_ENABLED): WB перенёс метод, все известные адреса отвечают 404.

## Прочее, сделанное в проекте
- Задачи: движок, «Магазин в порядке», кнопка исправления цены, заблокированные карточки. Доработки 21.10: защита от «мерцания» (условие должно отсутствовать 30 минут, прежде чем задачу закроют: на промежуточных снимках данные неполные); экран «Настройки задач» (рычаги, реально меняющие правила, с пояснением и границами: срок поставки, покрытие, дни на разбор, избыток запаса, нет продаж, значимое изменение продаж, целевая маржа, падение маржи, слабая карточка, число фото; включение и отключение типов задач; «Не создавать такие задачи по этому товару» из карточки задачи и список таких товаров с кнопкой «Вернуть»; отключение закрывает задачи сразу); «Завершённые» сгруппированы по паре «тип + товар» с числом повторов (полный CSV остался); в карточке задачи «Что менялось по этому товару» из событий; задача из уведомления «Событий» (TASK_FROM_EVENT). Задачи по акциям (22.10): «Акция уводит товар в минус» (TASK_PROMO_LOSS) и «Товар можно добавить в акцию» (TASK_PROMO_OPPORTUNITY), цифры те же, что на странице «Акции» (promo.ts); для автоакций без порогов от WB задач нет.
- События: центр уведомлений кабинета, лента по дням («Сегодня», «Вчера», «19 октября, воскресенье», новые сверху, «Показать более ранние дни»). Уведомления одинаковые, отличается одна пометка «Обратить внимание» (критичное и важное). Направления работают как фильтры с числами: продажи (в т. ч. просадка или скачок заказов за день с возможными причинами в карточке), остатки (закончился), цены и акции (цена, скидка, вход и выход из акций WB, новая акция), карточки (контент, фото, новый и пропавший товар), отзывы (новый негативный отзыв), заказы и поставки (новые и отменённые заказы FBS, созданная и закрытая поставка), реклама (смена статуса и новая кампания), деньги (штрафы, новые документы, рост суммы к выводу), агенты (журнал действий), система (потеря и возврат доступов токена). Над днём — итог дня из истории (заказов и сумма по воронке WB). Серии однотипных событий по товарам (например, обновление цен у десятков товаров) схлопываются в одно уведомление со списком. Убрано как шум: «Появились продажи +1 шт.». Поиск. Управление каждым уведомлением: прочитано и не прочитано, закрепить, в архив и обратно (настройка events.marks); «Отметить всё прочитанным» (events.seenAt). Представления: все, непрочитанные, обратить внимание, закреплённые, архив. Направления можно скрыть из ленты (events.mutedGroups). Выгрузка ленты в CSV. Боковая панель: сводка (непрочитанные, внимание, время данных кабинета), итоги 7 дней к предыдущим 7 (только при полных 14 днях истории), «Что отслеживаем» (по каждому направлению отслеживается или нет и почему), место под новости WB и Ozon. Только факты: состояния и «что делать» ведёт раздел «Задачи». Перенесены в «Задачи» как состояния: «Запас стал коротким», «Отзывы и вопросы без ответа»; убраны шум «Каталог обновлён», блок «Требуют внимания», переключатели «Сегодня / 7 / 28 дней» и график «Заказы и события по дням» (его заменили итоги дня в ленте; те же заказы по дням остаются в «Аналитике → Динамика»). Умные уведомления: пороги подстраиваются под магазин и товар (ожидаемый уровень заказов по медиане 28 дней с поправкой на день недели, разброс по устойчивой оценке MAD и естественному шуму, а не фиксированные проценты), тенденции с началом и возвратом к норме, критерий разности долей для конверсий воронки, «товар замолчал» по модели Пуассона; чувствительность настраивается (events.sensitivity: низкая, обычная, высокая). Настоящие правки карточки «было → стало»: название, описание, характеристики, видео (вместо ложного «Изменился контент» по пересчёту нашей оценки). Интерактивность: из уведомления кнопка перехода в нужный раздел или вкладку аналитики и «Создать задачу» (тип TASK_FROM_EVENT, не закрывается пересчётом задач, повторное нажатие не создаёт дубль). Новости портала WB (официальный News API, токен любой категории, чтение): новости разбираются под профиль продавца (категории и бренды товаров, FBS/FBW, реклама, склады): пометка WB «Персональная новость», совпадение с вашими категориями, рубрики «Важно», «Акции» и др.; тема, тон («скорее хорошая или неприятная», наша оценка заголовка) и «Почему это вам»; пересказ из самого текста; мусор (обучение, пресс-центр, дайджесты, чужие склады) скрыт, общие новости включаются галочкой (events.newsGeneral); «Обратить внимание» только на живые акции, деньги и условия, плохие вести и важное. Предупреждения об акциях: из календаря WB за 3 дня до старта и за 2 до окончания с числом участвующих товаров, из новостей по датам в тексте (без дублей с календарём). Прогноз «товар закончится около даты» при переходе запаса через порог. Управление отбором новостей самим пользователем: «Не по теме» на новости (в архив) с вопросом «скрывать рубрику и дальше?» (events.newsMutedRubrics), список скрытых рубрик с возвратом в боковой панели; персональные новости WB, «Важно» и новости с «Обратить внимание» рубрикой не скрываются. Новости Ozon: позже.
- Обзор, Товары, Проверка расчётов, Кабинет и API.
- Серверный кэш и настройки пользователя в базе (`seller_hub_data_cache`, `seller_hub_user_settings`).

## Файлы (проверяются тестом)
- `src/components/seller-hub/hub-ads.tsx`
- `src/components/seller-hub/hub-ads-review.tsx`
- `src/components/seller-hub/hub-ads-agent.tsx`
- `src/components/seller-hub/hub-agents.tsx`
- `src/components/seller-hub/hub-agents-ads.tsx`
- `src/components/seller-hub/hub-ads-cards.tsx`
- `src/components/seller-hub/hub-ads-cards-vision.tsx`
- `src/components/seller-hub/hub-ads-cards-text.tsx`
- `src/components/seller-hub/hub-ads-cards-plan.tsx`
- `src/components/seller-hub/hub-ads-clusters.tsx`
- `src/components/seller-hub/hub-ads-bids.tsx`
- `src/components/seller-hub/hub-ads-bulk.tsx`
- `src/components/seller-hub/hub-ads-sources.tsx`
- `src/components/seller-hub/hub-ads-reputation.tsx`
- `src/components/seller-hub/hub-seo.tsx`
- `src/components/seller-hub/hub-promotions.tsx`
- `src/components/seller-hub/hub-fulfillment.tsx`
- `src/components/seller-hub/hub-orders-insights.tsx`
- `src/components/seller-hub/hub-action-journal.tsx`
- `src/lib/seller-hub/ads-agent-engine.ts`
- `src/lib/seller-hub/ads-agent.ts`
- `src/lib/seller-hub/ads-autopilot.ts`
- `src/lib/seller-hub/ads-review.ts`
- `src/lib/seller-hub/ads-review-server.ts`
- `src/lib/seller-hub/ads-query-relevance.ts`
- `src/lib/seller-hub/ads-cluster-bid.ts`
- `src/lib/seller-hub/ads-placements.ts`
- `src/lib/seller-hub/ads-nms.ts`
- `src/lib/seller-hub/ads-advisor.ts`
- `src/lib/seller-hub/agent-exec.ts`
- `src/lib/seller-hub/action-log.ts`
- `src/lib/seller-hub/card-verdict.ts`
- `src/lib/seller-hub/card-vision.ts`
- `src/lib/seller-hub/card-vision-prompt.ts`
- `src/lib/seller-hub/card-vision-metrics.ts`
- `src/lib/seller-hub/card-text.ts`
- `src/lib/seller-hub/card-text-prompt.ts`
- `src/lib/seller-hub/card-text-metrics.ts`
- `src/lib/seller-hub/product-advice.ts`
- `src/lib/seller-hub/product-advice-server.ts`
- `src/lib/seller-hub/product-diagnosis.ts`
- `src/lib/seller-hub/funnel-analysis.ts`
- `src/lib/seller-hub/reputation.ts`
- `src/lib/seller-hub/orders-insights.ts`
- `src/lib/seller-hub/ai-budget.ts`
- `src/app/api/seller-hub/agent-rules/route.ts`
- `src/app/api/seller-hub/agents/run/route.ts`
- `src/app/api/seller-hub/action-log/route.ts`
- `src/app/api/seller-hub/card-vision/route.ts`
- `src/app/api/seller-hub/card-text/route.ts`
- `src/app/api/seller-hub/product-advice/route.ts`
- `src/app/api/seller-hub/wildberries/ads/review/route.ts`
- `src/app/api/seller-hub/wildberries/ads/relevance/route.ts`
- `src/app/api/seller-hub/wildberries/ads/cluster-bid/route.ts`
- `src/app/api/seller-hub/wildberries/ads/placements/route.ts`
- `src/app/api/seller-hub/wildberries/ads/nm/route.ts`
- `src/app/api/seller-hub/wildberries/ads/deposit/route.ts`
- `src/app/api/seller-hub/wildberries/ads/minus/route.ts`
- `src/app/api/seller-hub/wildberries/ads/bid/route.ts`
- `src/app/api/seller-hub/wildberries/ads/create/route.ts`
- `src/app/api/seller-hub/wildberries/ads/toggle/route.ts`
- `src/components/seller-hub/hub-events.tsx`
- `src/lib/seller-hub/events-timeline.ts`
- `src/lib/seller-hub/fbs-actions.ts`
- `src/lib/seller-hub/fulfillment-center.ts`
- `src/lib/seller-hub/ship-speed.ts`
- `src/lib/seller-hub/fbs-exec.ts`
- `src/components/seller-hub/hub-ship-speed.tsx`
- `src/components/seller-hub/hub-agents-logistics.tsx`
- `src/components/seller-hub/use-fulfillment.ts`
- `src/app/api/seller-hub/wildberries/orders/supply-orders/route.ts`
- `src/lib/seller-hub/orders-by-product.ts`
- `src/lib/seller-hub/acceptance-slots.ts`
- `src/components/seller-hub/hub-orders-products.tsx`
- `src/components/seller-hub/hub-acceptance.tsx`
- `src/app/api/seller-hub/wildberries/logistics/acceptance/route.ts`
- `src/lib/seller-hub/logistics-cost.ts`
- `src/components/seller-hub/hub-logistics-cost.tsx`
- `src/lib/seller-hub/returns-whatif.ts`
- `src/components/seller-hub/hub-fulfillment-thresholds.tsx`
- `src/lib/seller-hub/district-cancels.ts`
- `src/components/seller-hub/hub-district-cancels.tsx`
- `src/lib/seller-hub/weekday-profile.ts`
- `src/components/seller-hub/hub-weekday-profile.tsx`
- `src/lib/seller-hub/feature-flags.ts`
- `src/lib/seller-hub/analytics-core.ts`
- `src/lib/seller-hub/money-analytics.ts`
- `src/lib/seller-hub/stock-analytics.ts`
- `src/lib/seller-hub/daily-trend.ts`
- `src/components/seller-hub/hub-analytics.tsx`
- `src/components/seller-hub/hub-analytics-summary.tsx`
- `src/components/seller-hub/hub-analytics-funnel.tsx`
- `src/components/seller-hub/hub-analytics-products.tsx`
- `src/components/seller-hub/hub-analytics-money.tsx`
- `src/components/seller-hub/hub-analytics-stock.tsx`
- `src/components/seller-hub/hub-analytics-trend.tsx`
- `src/components/seller-hub/hub-analytics-market.tsx`
- `src/app/api/seller-hub/market/commissions/route.ts`
- `src/lib/seller-hub/analytics-core.ts`
- `src/lib/seller-hub/money-analytics.ts`
- `src/lib/seller-hub/stock-analytics.ts`
- `src/lib/seller-hub/daily-trend.ts`
- `src/components/seller-hub/hub-analytics.tsx`
- `src/components/seller-hub/hub-analytics-summary.tsx`
- `src/components/seller-hub/hub-analytics-funnel.tsx`
- `src/components/seller-hub/hub-analytics-products.tsx`
- `src/components/seller-hub/hub-analytics-money.tsx`
- `src/components/seller-hub/hub-analytics-stock.tsx`
- `src/components/seller-hub/hub-analytics-trend.tsx`
- `src/components/seller-hub/hub-analytics-market.tsx`
- `src/app/api/seller-hub/market/commissions/route.ts`
- `src/lib/seller-hub/monitoring.ts`
- `src/components/seller-hub/hub-analytics-article.tsx`
- `src/components/seller-hub/use-analytics-data.ts`
- `src/components/seller-hub/hub-analytics-ui.tsx`
- `src/components/seller-hub/hub-analytics-ads.tsx`
- `src/components/seller-hub/use-analytics-period.ts`
- `src/lib/seller-hub/analytics-periods.ts`
- `src/app/api/seller-hub/wildberries/analytics/period/route.ts`
- `src/lib/seller-hub/money-leaks.ts`
- `src/lib/seller-hub/metric-history.ts`
- `src/lib/seller-hub/metric-history.test.ts`
- `src/app/api/seller-hub/wildberries/analytics/history/route.ts`
- `src/components/seller-hub/hub-analytics-history.tsx`
- `supabase/migrations/20261021_seller_hub_metric_daily.sql`
- `src/lib/seller-hub/event-engine/store-events.ts`
- `src/lib/seller-hub/event-engine/store-events.test.ts`
- `src/lib/seller-hub/event-engine/derived-events.ts`
- `src/lib/seller-hub/event-engine/derived-events.test.ts`
- `supabase/migrations/20261021_seller_hub_event_signals.sql`
- `src/lib/seller-hub/events-feed.ts`
- `src/lib/seller-hub/events-feed.test.ts`
- `src/lib/seller-hub/events-marks.ts`
- `src/lib/seller-hub/events-marks.test.ts`
- `src/lib/seller-hub/events-overview.ts`
- `src/lib/seller-hub/events-overview.test.ts`
- `src/lib/seller-hub/event-engine/smart-events.ts`
- `src/lib/seller-hub/event-engine/smart-events.test.ts`
- `src/lib/seller-hub/event-engine/card-events.test.ts`
- `src/lib/seller-hub/events-actions.ts`
- `src/lib/seller-hub/task-engine/from-event.ts`
- `src/lib/seller-hub/task-engine/from-event.test.ts`
- `src/app/api/seller-hub/tasks/from-event/route.ts`
- `supabase/migrations/20261021_seller_hub_snapshot_card_fields.sql`
- `supabase/migrations/20261021_seller_hub_tasks_from_event_index.sql`
- `src/lib/services/wildberries/news-client.ts`
- `src/lib/seller-hub/news/analysis.ts`
- `src/lib/seller-hub/news/analysis.test.ts`
- `src/app/api/seller-hub/events/news/route.ts`
- `src/lib/seller-hub/event-engine/promo-forecast.test.ts`
- `src/lib/seller-hub/task-engine/settings-form.ts`
- `src/lib/seller-hub/task-engine/settings-form.test.ts`
- `src/lib/seller-hub/task-engine/completed-groups.ts`
- `src/lib/seller-hub/task-engine/completed-groups.test.ts`
- `src/lib/seller-hub/task-engine/product-events.ts`
- `src/lib/seller-hub/task-engine/promo.ts`
- `src/lib/seller-hub/task-engine/promo.test.ts`
- `src/lib/seller-hub/task-engine/product-events.test.ts`
- `src/components/seller-hub/hub-task-settings.tsx`
- `src/app/api/seller-hub/tasks/settings/route.ts`
- `src/app/api/seller-hub/tasks/mute/route.ts`
- `supabase/migrations/20261021_seller_hub_task_settings_levers.sql`
- Финансы: две вкладки. «Прибыли и убытки» (период 7/14/28/60/90 дней): выручка, удержания WB, к перечислению, логистика, хранение, приёмка, штрафы и удержания (всё из отчёта реализации WB), реклама (статистика WB, не больше 30 дней, за тот же период), остаётся после расходов, себестоимость, налог по ставке и базе пользователя (finance.taxRate, finance.taxBase, не заменяет бухгалтерию), чистая прибыль; чистая прибыль не считается, если себестоимость указана меньше чем по 95% выручки, а чего нет в данных (реклама за длинный период, налог без прибыли) названо, а не заменено нулём. «Баланс и документы»: баланс, сумма к выводу и документы WB (как было).
- `src/lib/seller-hub/pnl.ts`
- `src/lib/seller-hub/pnl.test.ts`
- `src/components/seller-hub/hub-finance-pnl.tsx`
