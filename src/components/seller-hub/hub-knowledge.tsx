"use client";

import { hub, HubPanel, hubSans } from "./hub-ui";

const GUIDES = [
  {
    title: "Как оформить первую поставку",
    body: "Для FBS вы собираете заказы у себя и передаёте их в поставку. Для FBW везёте товар на склад WB. В Seller Hub поставки только читаются: создание отгрузки остаётся осознанным шагом в разделе заказов.",
  },
  {
    title: "Почему списали за хранение",
    body: "WB берёт плату, если товар лежит на их складе дольше бесплатного срока. Это не ошибка карточки. Смотрите остатки FBO и скорость продаж: если запас большой, а заказов мало, хранение растёт.",
  },
  {
    title: "Автоакция и обычная акция",
    body: "Обычную акцию можно включить и выключить для товара через API. Автоакцию ведёт сам WB: KARTO показывает её, но не обещает вход по скидке, пока площадка не отдаёт такой метод.",
  },
  {
    title: "Что такое маржа в KARTO",
    body: "Это ваша формула: цена для покупателя минус комиссия и логистика минус себестоимость, которую вводите вы. Подписка «Джем» для этого не нужна.",
  },
];

export function HubKnowledge() {
  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-[16px] leading-relaxed" style={{ color: hub.textMuted }}>
        Короткие ответы по кабинету. KARTO внизу экрана отвечает по вашему снимку, эти статьи — общая опора.
      </p>
      {GUIDES.map((guide) => (
        <HubPanel key={guide.title}>
          <div className="px-6 py-5">
            <h2 className="text-[20px] font-semibold" style={hubSans}>
              {guide.title}
            </h2>
            <p className="mt-2 text-[16px] leading-relaxed" style={{ color: hub.textMuted }}>
              {guide.body}
            </p>
          </div>
        </HubPanel>
      ))}
    </div>
  );
}
