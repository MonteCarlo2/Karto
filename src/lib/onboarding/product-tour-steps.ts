import type { DriveStep } from "driver.js";

import { PRODUCT_TOUR_DEMO_CTA } from "@/lib/onboarding/product-tour-demo";

export { PRODUCT_TOUR_DEMO_CTA };

export type ProductTourRoute = "/" | "/studio/free";

export type ProductTourStepMeta = {
  id: string;
  route: ProductTourRoute;
  selector?: string;
  title: string;
  description: string;
  side: "top" | "right" | "bottom" | "left";
  align: "start" | "center" | "end";
  stageRadius?: number;
  popoverOffset?: number;
  openStudio?: boolean;
};

export const PRODUCT_TOUR_STEP_META: ProductTourStepMeta[] = [
  {
    id: "flow",
    route: "/",
    selector: "[data-tour='flow-demo']",
    title: "Поток",
    description:
      "<p>Поток собирает карточку целиком: визуал самой карточки, описание и ценовую политику.</p><p>Всё сразу под Wildberries, Ozon или Яндекс Маркет — без сборки по кускам и без прыжков между разными инструментами.</p>",
    side: "left",
    align: "center",
    popoverOffset: 28,
  },
  {
    id: "creative",
    route: "/studio/free",
    selector: "[data-tour='creative-workspace']",
    title: "Креатив",
    description:
      "<p>Когда нужна не вся карточка, а отдельные картинки или видео под товар.</p><p>Слева формат и загрузка, внизу описываете сцену — и генерируете кадр или ролик.</p>",
    side: "top",
    align: "center",
    popoverOffset: 52,
  },
  {
    id: "auto-replies",
    route: "/",
    selector: "[data-tour='auto-replies-preview']",
    title: "Автоответы",
    description:
      "<p>Отзывы не ждут, пока вы закончите день. KARTO читает их за вас и отвечает так, как ответили бы вы: спокойно, по делу и в вашем тоне.</p><p>Подключите кабинет — ответы уходят сами. Или смотрите текст и отправляйте вручную, как удобнее.</p>",
    side: "right",
    align: "center",
    popoverOffset: 28,
  },
  {
    id: "studio",
    route: "/",
    selector: "[data-tour='studio-menu']",
    title: "Мастерская",
    description:
      "<p>Всё, чем вы пользуетесь по делу, собрали в одном меню — без прыжков по разделам.</p><p>Юнит-экономику и SEO-описание можно открыть сразу, они бесплатные. Если понадобится ещё инструмент — он появится здесь же.</p>",
    side: "bottom",
    align: "end",
    popoverOffset: 20,
    openStudio: true,
  },
  {
    id: "final",
    route: "/",
    title: PRODUCT_TOUR_DEMO_CTA.title,
    description: PRODUCT_TOUR_DEMO_CTA.subtitle,
    side: "top",
    align: "center",
  },
];

export function getStepRoute(index: number): ProductTourRoute {
  return PRODUCT_TOUR_STEP_META[index]?.route ?? "/";
}

export function buildTourDriveSteps(): DriveStep[] {
  return PRODUCT_TOUR_STEP_META.map((meta) => {
    if (!meta.selector) {
      return {
        popover: {
          title: meta.title,
          description: meta.description,
          side: meta.side,
          align: meta.align,
        },
      };
    }
    return {
      element: meta.selector,
      popover: {
        title: meta.title,
        description: meta.description,
        side: meta.side,
        align: meta.align,
      },
    };
  });
}
