import type { KbCategory } from "./types";

export const KB_CATEGORIES: KbCategory[] = [
  // Наша база: как пользоваться KARTO
  { id: "k-start", branch: "karto", title: "Быстрый старт", hint: "Подключение кабинета и первые шаги", icon: "Rocket" },
  { id: "k-basics", branch: "karto", title: "Основы: задачи, события, маржа", hint: "Как читать главные показатели", icon: "ListChecks" },
  { id: "k-ads", branch: "karto", title: "Продвижение", hint: "Кампании, карточки, воронка, акции", icon: "Megaphone" },
  { id: "k-analytics", branch: "karto", title: "Аналитика и деньги", hint: "Куда уходит выручка и что с этим делать", icon: "BarChart3" },
  { id: "k-orders", branch: "karto", title: "Заказы и логистика", hint: "Склады, регионы, план отгрузки", icon: "Truck" },
  { id: "k-ai", branch: "karto", title: "Нейросеть и агенты", hint: "Что делают автоматически и как это проверить", icon: "Bot" },
  { id: "k-algo", branch: "karto", title: "Как это считается", hint: "Формулы и правила, по которым работают задачи, реклама и карточки", icon: "ListChecks" },
  { id: "k-safety", branch: "karto", title: "Безопасность и подтверждения", hint: "Что мы меняем в кабинете и только ли по вашему слову", icon: "ShieldCheck" },
  { id: "k-faq", branch: "karto", title: "Частые вопросы", hint: "Почему цифры отличаются и что значит «мало данных»", icon: "CircleHelp" },
  // База Wildberries простым языком
  { id: "w-start", branch: "wb", title: "Начало работы", hint: "Как зайти на маркетплейс и с чего начать", icon: "Flag" },
  { id: "w-models", branch: "wb", title: "Схемы работы", hint: "FBW, FBS, DBS, DBW: что выбрать", icon: "Boxes" },
  { id: "w-card", branch: "wb", title: "Карточки и контент", hint: "Название, описание, фото, характеристики", icon: "Image" },
  { id: "w-price", branch: "wb", title: "Цены, скидки и акции", hint: "Как формируется цена и как работают акции", icon: "Percent" },
  { id: "w-money", branch: "wb", title: "Комиссии и деньги", hint: "Расходы, отчёт реализации, выплаты, налоги", icon: "Wallet" },
  { id: "w-ads", branch: "wb", title: "Реклама на WB", hint: "Виды рекламы, ставки, бюджет", icon: "Megaphone" },
  { id: "w-reviews", branch: "wb", title: "Отзывы и рейтинг", hint: "Как рейтинг влияет на продажи", icon: "Star" },
  { id: "w-trouble", branch: "wb", title: "Проблемы и штрафы", hint: "Блокировки, возвраты, падение продаж", icon: "AlertTriangle" },
  { id: "w-api", branch: "wb", title: "API и интеграции", hint: "Токены и права доступа", icon: "Plug" },
];
