"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { BrandLogoStep } from "@/components/brand/brand-logo-step";
import { BrandDescriptionInput } from "@/components/brand/brand-description-input";
import { BrandNameGeneration } from "@/components/brand/brand-name-generation";
import { BrandNameHeroInput } from "@/components/brand/brand-name-hero-input";
import { createBrowserClient } from "@/lib/supabase/client";
import { mergePersistedIntoBrandDraft } from "@/lib/brand/merge-brand-draft";
import {
  fetchUserBrandOnboarding,
  upsertUserBrandOnboarding,
} from "@/lib/brand/user-brand-onboarding-db";
import {
  brandStorageKey,
  clearBrandLocalStorage,
} from "@/lib/brand/brand-local-storage";
import { BRAND_PRESET_PALETTES as palettes } from "@/lib/brand/brand-preset-palettes";
import {
  BRAND_VISUAL_STYLE_OPTIONS as styles,
  type BrandVisualStyleOption as VisualStyleOption,
} from "@/lib/brand/brand-visual-style-presets";
import { useToast } from "@/components/ui/toast";

type BrandDraft = {
  name: string;
  /** need_name: пользователь пропустил шаг названия; picked: сгенерированное имя ещё не «подтверждено» переходом к цветам */
  nameAssist: "off" | "need_name" | "picked";
  niche: string;
  description: string;
  paletteId: string;
  customPaletteColors: string[];
  styleId: string;
  customVisualStyle: CustomVisualStyle;
  toneId: string;
  toneLength: "short" | "long";
  logoMode: "upload" | "generate" | "later" | "";
  logoFileName: string;
  logoGeneratedUrls: string[];
  logoChosenUrl: string;
  logoApprovedUrl: string;
};

type Option = {
  id: string;
  title: string;
  subtitle?: string;
};

type PaletteOption = Option & {
  colors: string[];
};

type CustomVisualStyle = {
  composition: string;
  textDensity: string;
  scene: string;
  typography: string;
  mood: string;
};

const emptyDraft: BrandDraft = {
  name: "",
  nameAssist: "off",
  niche: "",
  description: "",
  paletteId: "",
  customPaletteColors: ["#070907", "#2E5A43", "#B9FF4B", "#F3F1EA"],
  styleId: "",
  customVisualStyle: {
    composition: "товар крупно",
    textDensity: "мало текста",
    scene: "светлый фон",
    typography: "аккуратная",
    mood: "спокойно",
  },
  toneId: "",
  toneLength: "short",
  logoMode: "",
  logoFileName: "",
  logoGeneratedUrls: [],
  logoChosenUrl: "",
  logoApprovedUrl: "",
};

const steps = [
  "Название",
  "Ниша",
  "Описание",
  "Цвета",
  "Стиль",
  "Тон",
  "Логотип",
] as const;

const brandNameExamples = [
  "PlayStation",
  "Икея",
  "Apple",
  "Госуслуги",
  "Nike",
  "ВКонтакте",
  "Pomelli",
  "Яндекс Маркет",
  "Dyson",
  "Самокат",
  "Lindoo",
  "Ozon",
  "Zara Home",
  "Золотое Яблоко",
  "Patagonia",
  "Сбер",
  "Maison Kitsune",
  "Тинькофф",
  "Notion",
  "Читай-город",
];

const nicheExamples = [
  "премиальная косметика",
  "товары для дома",
  "sport & lifestyle",
  "детская одежда",
  "умная электроника",
  "уход за волосами",
  "fashion-аксессуары",
  "товары для животных",
  "кофе и чай",
  "эко-товары",
];

const niches = [
  "Косметика",
  "Одежда",
  "Товары для дома",
  "Детские товары",
  "Электроника",
  "Здоровье",
  "Украшения",
  "Подарки",
  "Обувь",
  "Спорт",
  "Товары для животных",
  "Кофе и чай",
  "Еда",
  "Красота",
  "Мебель",
  "Текстиль",
  "Автотовары",
  "Канцелярия",
  "Хобби",
  "Путешествия",
  "Инфотовары",
  "B2B",
];

type ToneOption = {
  id: string;
  title: string;
  sampleShort: string;
  sampleLong: string;
};

const NICHE_PLACEHOLDER = "{{ниша}}";

/** Десять прагматичных манер; одна сплошная строка — как текст на экране карточки. */
const toneOptions: ToneOption[] = [
  {
    id: "expert",
    title: "Экспертный",
    sampleShort:
      "{{ниша}} — материалы, габариты и комплектация списком; ниже блок про гарантию и условия хранения: только то, что помогает сравнить и закрыть возражения без рекламной воды.",
    sampleLong:
      "{{ниша}} описана как для покупателя, который читает характеристики до конца: указали класс защиты, ресурс, температурный режим и совместимость с аксессуарами; отдельно расписали комплектацию коробки и что считается браком; при необходимости приложим инструкцию и сертификаты — напишите в чат, отправим пакет документов без формальностей.",
  },
  {
    id: "friendly",
    title: "Дружелюбный",
    sampleShort:
      "Мы неделю жили с {{ниша}} дома и на работе: подключается без инструкции, не раздражает мелочами и реально экономит время — если сомневаетесь с размером, напишите, скинем фото «в руке» и подскажем по совместимости.",
    sampleLong:
      "Честно про {{ниша}}: берите, если хотите меньше возни и больше спокойствия в быту — мы собрали ответы на частые вопросы прямо в карточке, добавили понятную доставку и возврат, а поддержка отвечает по-человечески; если что-то пойдёт не так, разберёмся вместе и предложим нормальное решение без давления.",
  },
  {
    id: "premium",
    title: "Премиальный",
    sampleShort:
      "{{ниша}} — спокойная премиальная подача: акцент на тактильности, аккуратной сборке и предсказуемом сервисе без криков «хит продаж» — текст для тех, кто покупает редко, но надолго.",
    sampleLong:
      "{{ниша}} звучит собранно и дорого за счёт дисциплины формулировок: коротко о главном преимуществе, затем детали качества и ухода, финиш — про упаковку и доставку без лишнего пафоса; мы сознательно избегаем шумных ярлыков и оставляем место для ощущения продукта, которое подтверждается фактами и комплектацией.",
  },
  {
    id: "bold",
    title: "Смелый",
    sampleShort:
      "{{ниша}} цепляет с первой строки: три коротких повода «зачем сейчас», понятная цена без пряток и честный срок доставки — читаете десять секунд и ясно, что именно получите на руки.",
    sampleLong:
      "{{ниша}} без смягчений: мы назвали главную боль, показали выгоду цифрой или сценарием и закрыли риск простым условием возврата; блок про комплектацию не размыт «и прочее», каждый пункт вы видите до оплаты; если любите прямой тон и быстрое решение — это именно тот текст, который не заставляет перечитывать абзац три раза.",
  },
  {
    id: "minimal",
    title: "Лаконичный",
    sampleShort:
      "{{ниша}}. Что внутри. Зачем нужно. Кому подойдёт. Доставка и возврат — двумя строками внизу, без прилагательных ради объёма.",
    sampleLong:
      "{{ниша}} — четыре блока: состав или параметры, применение, ограничения и комплектация; между блоками нет связки «давайте поговорим о главном», только сухие факты и понятные единицы измерения; если нужны расшифровки — они в развороте характеристик, карточка читается за двадцать секунд и закрывает основной вопрос покупателя.",
  },
  {
    id: "promo",
    title: "Акционный",
    sampleShort:
      "{{ниша}} до воскресенья по промокоду KARTO: −15%, бесплатная доставка от суммы на экране и подарок к заказу при оплате онлайн — количество промонаборов ограничено, условия актуальны на момент заказа.",
    sampleLong:
      "{{ниша}} в акционной подаче без серых зон: промокод, размер скидки и итоговая экономия указаны прямо в тексте; мы отдельно прописали срок действия, исключения для отдалённых регионов и правила подарка; если промокод не применился автоматически, поддержка пересчитает заказ вручную и зафиксирует цену до отправки — так честнее для клиента и меньше недопонимания после оплаты.",
  },
  {
    id: "lifestyle",
    title: "Lifestyle",
    sampleShort:
      "{{ниша}} для города и дороги: утром не тормозит сборы, в сумке занимает минимум места и выглядит как часть вашего дня — про продукт говорим через привычную сцену, а не через список модных слов.",
    sampleLong:
      "{{ниша}} описан через будни: офис, дорога, дом и те мелочи, которые реально раздражают — мы показываем, как продукт убирает лишние шаги из ритуала и остаётся незаметным, пока не понадобится; технические детали есть, но они поддерживают историю, а не перегружают её; если ваш бренд живёт в контенте и визуале, этот голос ложится в ленту естественно.",
  },
  {
    id: "story",
    title: "История бренда",
    sampleShort:
      "{{ниша}} появился после двухсот отзывов: мы убрали лишнее из прототипа и оставили только функции, которые просили чаще всего — без обещаний «из будущего», зато с понятной пользой уже на первой неделе.",
    sampleLong:
      "{{ниша}} рассказывает о людях и решении: почему мы вообще взялись за категорию, какие ошибки первых партий исправили и что изменилось в финальной версии; это не роман, а короткий абзац доверия — покупатель видит мотивацию бренда и понимает, за что именно он платит; дальше блок с характеристиками подкрепляет историю фактами, а не заменяет её.",
  },
  {
    id: "marketplace",
    title: "Маркетплейс",
    sampleShort:
      "{{ниша}}, состояние новое, артикул на упаковке совпадает с карточкой; срок годности или партия указаны на этикетке; отправка в день оплаты до отсечки по времени, трек приходит в смс.",
    sampleLong:
      "{{ниша}} в нейтральном маркетплейс-формате: спереди условия соответствия описанию, объём и единицы продажи, совместимость и ограничения по использованию; блок про возврат оформлен шаблонно и без эмоций; мы минимизируем двусмысленность, чтобы карточка проходила модерацию и не создавала спорных трактовок при приёмке на складе маркетплейса.",
  },
  {
    id: "direct",
    title: "Прямой отклик",
    sampleShort:
      "{{ниша}} закрывает задачу «сделать сейчас»: понятный результат после первого использования, простая установка или старт из коробки и возврат денег за четырнадцать дней, если не зашло.",
    sampleLong:
      "{{ниша}} в стиле прямого отклика: сначала обещание результата простыми словами, затем три доказательства — отзыв, сравнение «до/после» или конкретная метрика; блок риска закрыт политикой возврата и реальными сроками поддержки; текст заточен под быстрое решение, но без нажима на страх — только ясная выгода и честные условия, которые можно проверить до покупки.",
  },
];

type BrandStorageMeta = {
  activeStep: number;
  showNameGen: boolean;
  wizardCompletedAt?: string | null;
};

function writeBrandLocalBundle(
  userId: string | null,
  draft: BrandDraft,
  meta: BrandStorageMeta
) {
  const key = brandStorageKey(userId);
  window.localStorage.setItem(key, JSON.stringify(draft));
  window.localStorage.setItem(`${key}:meta`, JSON.stringify(meta));
}

function formatBrandCompletedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function firstIncompleteIndex(draft: BrandDraft) {
  const completion = getCompletion(draft);
  if (
    draft.nameAssist === "need_name" &&
    draft.name.trim().length < 2 &&
    completion[1] &&
    completion[2]
  ) {
    return 2;
  }
  const next = completion.findIndex((done) => !done);
  return next === -1 ? steps.length - 1 : next;
}

export default function BrandPage() {
  const [draft, setDraft] = useState<BrandDraft>(emptyDraft);
  const [activeStep, setActiveStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [showNameGen, setShowNameGen] = useState(false);
  const [nameGenSelected, setNameGenSelected] = useState<string | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [wizardCompletedAt, setWizardCompletedAt] = useState<string | null>(null);
  const [brandEditMode, setBrandEditMode] = useState(false);

  const hydrateSucceededRef = useRef(false);
  const hydratedUserKeyRef = useRef<string | null>(null);
  /** Шаг, выбранный из профиля («Изменить» → пункт меню); после «Далее» возвращаем в профиль */
  const profileEditEntryStepRef = useRef<number | null>(null);

  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    const header = document.querySelector("header") as HTMLElement | null;
    const footer = document.querySelector("footer") as HTMLElement | null;
    const previousHeaderDisplay = header?.style.display;
    const previousFooterDisplay = footer?.style.display;

    if (header) header.style.display = "none";
    if (footer) footer.style.display = "none";

    return () => {
      if (header) header.style.display = previousHeaderDisplay ?? "";
      if (footer) footer.style.display = previousFooterDisplay ?? "";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();

    async function hydrateForUser(uid: string) {
      const key = uid;
      if (hydrateSucceededRef.current && hydratedUserKeyRef.current === key) {
        return;
      }

      const prevKey = hydratedUserKeyRef.current;
      if (prevKey !== null && prevKey !== key) {
        setBrandEditMode(false);
        profileEditEntryStepRef.current = null;
      }

      setHydrated(false);
      try {
        const applyRestored = (
          draftPayload: unknown,
          meta?: { activeStep?: number; showNameGen?: boolean }
        ) => {
          let restored = mergePersistedIntoBrandDraft(emptyDraft, draftPayload) as BrandDraft;
          const metaStep =
            typeof meta?.activeStep === "number" &&
            meta.activeStep >= 0 &&
            meta.activeStep < steps.length
              ? meta.activeStep
              : null;

          let legacyPickedSkip = false;
          if (restored.nameAssist === "picked" && metaStep !== null && metaStep > 0) {
            restored = { ...restored, nameAssist: "off" };
            legacyPickedSkip = true;
          }

          const step = legacyPickedSkip
            ? firstIncompleteIndex(restored)
            : metaStep ?? firstIncompleteIndex(restored);

          setDraft(restored);
          setActiveStep(step);
          if (typeof meta?.showNameGen === "boolean") {
            setShowNameGen(meta.showNameGen);
          } else {
            const c = getCompletion(restored);
            if (
              restored.nameAssist === "need_name" &&
              restored.name.trim().length < 2 &&
              c[1] &&
              c[2]
            ) {
              setShowNameGen(true);
            } else {
              setShowNameGen(false);
            }
          }
        };

        const row = await fetchUserBrandOnboarding(supabase, uid);
        if (cancelled) return;

        if (row) {
          applyRestored(row.draft_json, {
            activeStep: row.active_step,
            showNameGen: row.show_name_gen,
          });
          setWizardCompletedAt(row.wizard_completed_at ?? null);
        } else {
          /**
           * Нет строки в Supabase = пользователь не начинал / сбросил бренд.
           * Источник правды — сервер: не поднимаем localStorage (karto-brand-draft:uid),
           * иначе после удаления строки «оживает» старый черновик и снова upsert'ится в БД.
           */
          clearBrandLocalStorage(uid);
          setDraft(mergePersistedIntoBrandDraft(emptyDraft, {}) as BrandDraft);
          setActiveStep(0);
          setShowNameGen(false);
          setWizardCompletedAt(null);
        }
      } catch (e) {
        console.error("[brand] hydrate", e);
      } finally {
        if (!cancelled) {
          setHydrated(true);
          hydrateSucceededRef.current = true;
          hydratedUserKeyRef.current = key;
        }
      }
    }

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user?.id) {
        router.replace("/login?redirect=%2Fbrand");
        return;
      }
      await hydrateForUser(session.user.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      if (!uid) {
        router.replace("/login?redirect=%2Fbrand");
        return;
      }
      void hydrateForUser(uid);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (hydrated) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("edit") === "true") {
        setBrandEditMode(true);
        const stepStr = params.get("step");
        let entryStep: number | null = null;
        if (stepStr) {
          const stepNum = parseInt(stepStr, 10);
          if (!isNaN(stepNum) && stepNum >= 0 && stepNum < steps.length) {
            entryStep = stepNum;
            setActiveStep(stepNum);
          }
        }
        profileEditEntryStepRef.current = entryStep;
        window.history.replaceState({}, "", "/brand");
      } else if (wizardCompletedAt && !brandEditMode) {
        router.push("/profile");
      }
    }
  }, [hydrated, wizardCompletedAt, brandEditMode, router]);

  useEffect(() => {
    if (!hydrated) return;
    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = createBrowserClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const uid = session?.user?.id ?? null;
          writeBrandLocalBundle(uid, draft, {
            activeStep,
            showNameGen,
            wizardCompletedAt,
          });
          if (uid) {
            await upsertUserBrandOnboarding(supabase, {
              user_id: uid,
              draft_json: draft as unknown as Record<string, unknown>,
              active_step: activeStep,
              show_name_gen: showNameGen,
              wizard_completed_at: wizardCompletedAt,
            });
          }
        } catch {
          /* ignore */
        }
      })();
    }, 400);
    return () => window.clearTimeout(timerId);
  }, [draft, activeStep, showNameGen, wizardCompletedAt, hydrated]);

  useEffect(() => {
    if (wizardCompletedAt) return;
    const intervalId = window.setInterval(() => {
      setExampleIndex((index) => index + 1);
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [wizardCompletedAt]);

  const completion = useMemo(() => getCompletion(draft), [draft]);
  const currentStepNumber = activeStep + 1;
  const canContinue = completion[activeStep];
  const isLastStep = activeStep === steps.length - 1;
  const brandExample = brandNameExamples[exampleIndex % brandNameExamples.length];
  const nicheExample = nicheExamples[exampleIndex % nicheExamples.length];
  const paletteOptions = useMemo<PaletteOption[]>(
    () => [
      {
        id: "custom",
        title: "Своя",
        subtitle: "custom palette",
        colors: draft.customPaletteColors,
      },
      ...palettes,
    ],
    [draft.customPaletteColors]
  );
  const selectedPalette = paletteOptions.find((palette) => palette.id === draft.paletteId) ?? palettes[15];
  const stageShellMotion = getStageShellMotion(activeStep);

  const toneTitleResolved = useMemo(
    () => toneOptions.find((t) => t.id === draft.toneId)?.title ?? "",
    [draft.toneId]
  );

  const selectedVisualStyle = useMemo(
    () => styles.find((s) => s.id === draft.styleId),
    [draft.styleId]
  );

  const visualStyleSummary = useMemo(() => {
    if (draft.styleId === "custom-style") {
      const c = draft.customVisualStyle;
      return `Кастомный стиль: настроение «${c.mood}», композиция «${c.composition}», сцена «${c.scene}», типографика «${c.typography}», плотность текста «${c.textDensity}».`;
    }
    if (!selectedVisualStyle) return "";
    return `${selectedVisualStyle.title}. ${selectedVisualStyle.subtitle}. Настроение: ${selectedVisualStyle.mood}. Композиция: ${selectedVisualStyle.composition}, сцена: ${selectedVisualStyle.scene}, типографика: ${selectedVisualStyle.typography}.`;
  }, [draft.styleId, draft.customVisualStyle, selectedVisualStyle]);

  const effectivePaletteColors = useMemo(() => {
    if (draft.paletteId === "custom") return draft.customPaletteColors;
    return selectedPalette.colors;
  }, [draft.paletteId, draft.customPaletteColors, selectedPalette.colors]);

  const updateDraft = (patch: Partial<BrandDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateCustomPaletteColor = (colorIndex: number, color: string) => {
    setDraft((current) => {
      const nextColors = [...current.customPaletteColors];
      nextColors[colorIndex] = color;

      return {
        ...current,
        paletteId: "custom",
        customPaletteColors: nextColors,
      };
    });
  };

  const goNext = async () => {
    if (!canContinue) return;
    if (activeStep === 2 && draft.nameAssist === "need_name") {
      setNameGenSelected(null);
      setShowNameGen(true);
      return;
    }

    // После «Придумаем вместе»: ниша и описание уже заполнены — с шага названия сразу к палитре (04).
    if (
      activeStep === 0 &&
      draft.nameAssist === "picked" &&
      draft.niche.trim().length > 0 &&
      draft.description.trim().length >= 20
    ) {
      updateDraft({ nameAssist: "off" });
      setActiveStep(3);
      return;
    }

    let nextDraft = draft;
    if (activeStep === 0 && draft.nameAssist === "picked") {
      nextDraft = { ...draft, nameAssist: "off" };
      updateDraft({ nameAssist: "off" });
    }

    if (isLastStep) {
      if (draft.logoMode === "generate" && draft.logoChosenUrl.trim()) {
        nextDraft = { ...nextDraft, logoApprovedUrl: draft.logoChosenUrl.trim() };
        updateDraft({ logoApprovedUrl: draft.logoChosenUrl.trim() });
      }

      const completedStamp = wizardCompletedAt ?? new Date().toISOString();

      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user?.id ?? null;
        if (uid) {
          const ok = await upsertUserBrandOnboarding(supabase, {
            user_id: uid,
            draft_json: nextDraft as unknown as Record<string, unknown>,
            active_step: activeStep,
            show_name_gen: showNameGen,
            wizard_completed_at: completedStamp,
          });
          if (!ok) {
            showToast({
              type: "error",
              message:
                "Не удалось сохранить бренд. Проверьте соединение или повторите позже.",
            });
            return;
          }
        }
        writeBrandLocalBundle(uid, nextDraft, {
          activeStep,
          showNameGen,
          wizardCompletedAt: completedStamp,
        });
        if (!wizardCompletedAt) {
          setWizardCompletedAt(completedStamp);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Не удалось сохранить. Попробуйте ещё раз.";
        showToast({ type: "error", message: msg });
        return;
      }

      if (brandEditMode) {
        profileEditEntryStepRef.current = null;
        setBrandEditMode(false);
        setShowNameGen(false);
        setNameGenSelected(null);
      }
      router.push("/profile?brandUpdated=1");
      return;
    }

    const entryStep = profileEditEntryStepRef.current;
    if (brandEditMode && entryStep !== null && activeStep === entryStep) {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user?.id ?? null;
        writeBrandLocalBundle(uid, nextDraft, {
          activeStep,
          showNameGen,
          wizardCompletedAt,
        });
        if (uid) {
          await upsertUserBrandOnboarding(supabase, {
            user_id: uid,
            draft_json: nextDraft as unknown as Record<string, unknown>,
            active_step: activeStep,
            show_name_gen: showNameGen,
            wizard_completed_at: wizardCompletedAt,
          });
        }
      } catch {
        /* ignore */
      }
      profileEditEntryStepRef.current = null;
      setBrandEditMode(false);
      setShowNameGen(false);
      setNameGenSelected(null);
      router.push("/profile?brandUpdated=1");
      return;
    }

    setActiveStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const goBack = () => {
    if (brandEditMode) {
      profileEditEntryStepRef.current = null;
      if (showNameGen) {
        setNameGenSelected(null);
        setShowNameGen(false);
        return;
      }
      setBrandEditMode(false);
      return;
    }
    if (showNameGen) {
      setNameGenSelected(null);
      setShowNameGen(false);
      return;
    }
    setActiveStep((step) => Math.max(0, step - 1));
  };

  const wizardDone = Boolean(wizardCompletedAt);

  if (!hydrated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#F3F1EA] text-[#070907]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#2E5A43] border-t-transparent" />
      </div>
    );
  }

  if (wizardDone && !brandEditMode) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#F3F1EA] text-[#070907]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#2E5A43] border-t-transparent" />
      </div>
    );
  }

  return (
    <LayoutGroup id="brand-onboarding">
    <div className="relative h-screen overflow-hidden bg-[#F3F1EA] text-[#070907]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35 blur-3xl" />
        <div className="absolute -right-24 top-16 h-80 w-80 rounded-full bg-[#B9FF4B]/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[#2E5A43]/10 blur-3xl" />
      </div>

      {brandEditMode ? (
        <button
          type="button"
          onClick={() => {
            profileEditEntryStepRef.current = null;
            setBrandEditMode(false);
            setShowNameGen(false);
            setNameGenSelected(null);
          }}
          className="absolute left-6 top-5 z-20 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-[#101410] md:left-9 md:top-7"
        >
          <ChevronLeft className="h-4 w-4" />
          К обзору бренда
        </button>
      ) : (
        <Link
          href="/profile"
          className="absolute left-6 top-5 z-20 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-[#101410] md:left-9 md:top-7"
        >
          <ChevronLeft className="h-4 w-4" />
          В профиль
        </Link>
      )}

      {activeStep >= 2 && !(wizardCompletedAt && brandEditMode) && (
        <motion.div
          initial={{ opacity: 0, x: -18, filter: "blur(10px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="absolute left-6 top-24 z-10 hidden w-64 md:block lg:left-10"
        >
          <div className="mb-4 ml-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
            Настройка
          </div>
          <div className="relative flex flex-col gap-2">
            {steps.map((step, index) => {
              const done = completion[index];
              const active = activeStep === index;
              const available = done || active;

              return (
                <motion.button
                  key={step}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    if (!available) return;
                    setNameGenSelected(null);
                    setShowNameGen(false);
                    setActiveStep(index);
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.035, duration: 0.28 }}
                  className={`flex w-fit min-w-44 items-center gap-3 rounded-full px-4 py-3 text-left transition ${
                    active
                      ? "bg-[#B9FF4B] text-[#070907] shadow-[0_10px_34px_-22px_rgba(46,90,67,0.8)]"
                      : done
                        ? "bg-white/45 text-[#2E5A43]"
                        : "text-neutral-300"
                  }`}
                >
                  <span
                    className={`font-mono text-xs font-semibold ${
                      active ? "text-[#070907]" : done ? "text-[#2E5A43]" : "text-inherit"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-base tracking-[-0.04em] transition ${
                      active ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {step}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}

      {!brandEditMode && (
      <div className="absolute right-6 top-5 z-20 text-sm font-medium text-neutral-400 md:right-9 md:top-7">
        {currentStepNumber}/{steps.length}
      </div>
      )}

      <main
        className={`relative z-10 mx-auto flex h-full w-full flex-col px-6 pb-24 md:px-12 ${
          showNameGen
            ? "max-w-[min(96vw,1320px)] pt-16 md:pt-20"
            : activeStep === 3
              ? "max-w-[1280px] pt-8 md:pt-10"
              : activeStep === 4
                ? "max-w-[1360px] pt-12 md:pt-16"
                : activeStep === 5 || activeStep === 6
                  ? "max-w-[min(96vw,1320px)] pt-10 pb-6 md:pt-14"
                  : "max-w-5xl pt-24 md:pt-28"
        }`}
      >
        <motion.div
          key={`${activeStep}-${showNameGen ? "gen" : "step"}`}
          initial={stageShellMotion.initial}
          animate={stageShellMotion.animate}
          transition={stageShellMotion.transition}
          className={`flex min-h-0 flex-1 flex-col ${
            showNameGen
              ? "justify-start overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : activeStep === 6 &&
                  draft.logoMode === "generate" &&
                  draft.logoGeneratedUrls.length > 0
                ? "justify-start overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                : activeStep === 6 &&
                    (draft.logoMode === "upload" || draft.logoMode === "generate")
                  ? "justify-start overflow-hidden"
                : activeStep === 5 || activeStep === 6
                  ? "justify-start overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  : activeStep === 3
                    ? "justify-start"
                    : "justify-center"
          }`}
        >
          {showNameGen ? (
            <div className="flex w-full min-h-0 flex-1 flex-col pb-8">
              <BrandNameGeneration
                niche={draft.niche}
                description={draft.description}
                selectedName={nameGenSelected}
                onSelectedNameChange={setNameGenSelected}
              />
            </div>
          ) : (
            <>
          {activeStep === 0 && (
            <section className="relative">
              <div className="relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 8, rotate: -4 }}
                  animate={{ opacity: 1, y: 0, rotate: -2 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/55 px-4 py-2 text-sm font-semibold text-[#2E5A43] shadow-[0_12px_40px_-28px_rgba(46,90,67,0.6)] backdrop-blur"
                >
                  <span className="text-base">👋</span>
                  Первый слой бренда
                </motion.div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-neutral-600 sm:text-5xl">
                  <TypewriterText text="Как называется ваш бренд?" speed={62} />
                </h1>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75, duration: 0.35 }}
                  className="mt-3 max-w-xl text-base leading-7 text-neutral-500"
                >
                  Это имя будет жить в логотипе, карточках, описаниях и будущих шаблонах Karto.
                </motion.p>
                <BrandNameHeroInput
                  value={draft.name}
                  rotatingPlaceholder={brandExample}
                  onChange={(name) => {
                    setDraft((current) => ({
                      ...current,
                      name,
                      nameAssist:
                        name.trim().length >= 2 && current.nameAssist === "picked"
                          ? "off"
                          : current.nameAssist,
                    }));
                  }}
                />
                <motion.button
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.88, duration: 0.32 }}
                  type="button"
                  onClick={goNext}
                  disabled={!canContinue}
                  className="mt-8 inline-flex min-w-52 items-center justify-center gap-3 rounded-[1.35rem] bg-[#B9FF4B] px-9 py-5 text-base font-bold text-[#070907] shadow-[0_18px_60px_-34px_rgba(46,90,67,0.9)] transition hover:translate-y-[-1px] hover:bg-[#c7ff68] disabled:translate-y-0 disabled:bg-white/50 disabled:text-neutral-400 disabled:shadow-none"
                >
                  Далее
                  <ArrowRight className="h-5 w-5" />
                </motion.button>
                <div className="mt-6 flex max-w-2xl flex-col gap-4">
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.05, duration: 0.3 }}
                    className="text-sm font-medium leading-relaxed text-neutral-400"
                  >
                    Можно ввести рабочее название — позже его легко изменить.
                  </motion.p>
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.14, duration: 0.28 }}
                    type="button"
                    onClick={() => {
                      updateDraft({ nameAssist: "need_name" });
                      setActiveStep(1);
                    }}
                    className="self-start rounded-full bg-[#070907] px-5 py-[0.42rem] text-[0.68rem] font-semibold tracking-wide text-white shadow-[0_14px_38px_-26px_rgba(7,9,7,0.72)] transition hover:bg-neutral-900 sm:px-[1.05rem] sm:py-[0.5rem] sm:text-[0.74rem]"
                  >
                    Придумаем вместе
                  </motion.button>
                </div>
              </div>
              <NameSignMark />
            </section>
          )}

          {activeStep === 1 && (
            <Stage
              eyebrow={draft.name || "Ваш бренд"}
              title="Какая у вас ниша?"
              subtitle="Можно выбрать готовый вариант или вписать свой."
              emoji="🧭"
              size="large"
              variant="rise"
            >
              <div className="flex max-w-4xl flex-wrap gap-2.5">
                {niches.map((niche) => (
                  <Pill
                    key={niche}
                    active={draft.niche === niche}
                    onClick={() => updateDraft({ niche })}
                    layoutId={draft.niche === niche ? "selected-niche" : undefined}
                  >
                    {niche}
                  </Pill>
                ))}
              </div>
              <div className="relative mt-8 max-w-2xl border-b border-neutral-300 pb-3 focus-within:border-[#2E5A43]">
                {(!draft.niche || niches.includes(draft.niche)) && (
                  <motion.span
                    key={nicheExample}
                    initial={{ opacity: 0, y: 8, filter: "blur(5px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    className="pointer-events-none absolute left-0 top-0 text-4xl font-medium tracking-[-0.07em] text-neutral-300"
                  >
                    {nicheExample}
                  </motion.span>
                )}
                <input
                  value={draft.niche && !niches.includes(draft.niche) ? draft.niche : ""}
                  onChange={(event) => updateDraft({ niche: event.target.value })}
                  placeholder=""
                  className="relative z-10 w-full border-0 bg-transparent text-4xl font-medium tracking-[-0.07em] outline-none"
                />
              </div>
              <InlineNext disabled={!canContinue} onClick={goNext} />
            </Stage>
          )}

          {activeStep === 2 && (
            <Stage
              eyebrow={draft.niche || "Контекст"}
              title="Что важно знать о бренде?"
              subtitle="Опишите товары, аудиторию и ощущение, которое должны давать изображения. Чем больше информации вы дадите, тем точнее мы подстроимся под ваш магазин."
              emoji="📝"
              accent="soft"
              variant="handoff"
            >
              {draft.niche && (
                <motion.div
                  layoutId="selected-niche"
                  className="mb-5 inline-flex rounded-[1.1rem] bg-[#B9FF4B]/90 px-5 py-3 text-sm font-bold text-[#070907] shadow-[0_14px_42px_-30px_rgba(46,90,67,0.8)]"
                >
                  {draft.niche}
                </motion.div>
              )}
              <BrandDescriptionInput
                isActive={activeStep === 2}
                value={draft.description}
                onChange={(description) => updateDraft({ description })}
              />
              <p className="mt-5 text-sm font-medium text-neutral-400">Минимум 20 символов.</p>
              <InlineNext disabled={!canContinue} onClick={goNext} />
            </Stage>
          )}

          {activeStep === 3 && (
            <Stage
              eyebrow="Цветовая система"
              title="Какие цвета ближе бренду?"
              subtitle="Мы предлагаем сочетания, чтобы пользователю не приходилось собирать палитру с нуля."
              emoji="🎨"
              variant="scale"
              hideEyebrow
            >
              <PalettePicker
                palettes={paletteOptions}
                selectedPalette={selectedPalette}
                selectedId={draft.paletteId}
                onSelect={(paletteId) => {
                  if (paletteId === "custom") {
                    updateDraft({ paletteId: "custom" });
                    return;
                  }
                  const preset = palettes.find((p) => p.id === paletteId);
                  if (preset) {
                    updateDraft({ paletteId, customPaletteColors: [...preset.colors] });
                  } else {
                    updateDraft({ paletteId });
                  }
                }}
                onCustomColorChange={updateCustomPaletteColor}
              />
            </Stage>
          )}

          {activeStep === 4 && (
            <Stage
              eyebrow="Визуальный стиль"
              title="Выберите визуальный стиль."
              subtitle="Он определит композицию, настроение и подачу будущего контента."
              emoji="✨"
              variant="slide"
              hideEyebrow
            >
              <VisualStylePicker
                styles={styles}
                selectedId={draft.styleId}
                onSelect={(styleId) => updateDraft({ styleId })}
                customStyle={draft.customVisualStyle}
                onCustomStyleChange={(patch) =>
                  updateDraft({
                    styleId: "custom-style",
                    customVisualStyle: { ...draft.customVisualStyle, ...patch },
                  })
                }
              />
            </Stage>
          )}

          {activeStep === 5 && (
            <Stage
              eyebrow="Голос бренда"
              title="Послушайте, как звучит бренд."
              subtitle="Здесь вы задаёте тон для текстов, которые Karto будет помогать создавать в будущем: сообщения покупателям, отзывы, промо-формулировки и другие черновики в голосе бренда. Ниже — примеры: один и тот же смысл в разных манерах, чтобы было проще сравнить и выбрать."
              emoji="🎙️"
              variant="tone"
              hideEyebrow
              titleClassName="max-w-[min(100vw,56rem)] text-[clamp(2rem,5.8vw,4.15rem)] font-semibold leading-[1.05] tracking-[-0.076em] text-neutral-600 md:whitespace-nowrap"
              subtitleClassName="mt-5 max-w-[min(100vw,56rem)] text-lg leading-8 text-neutral-500 sm:max-w-4xl lg:max-w-5xl"
              contentClassName="mt-6 md:mt-8"
            >
              <ToneHorizontalLanes
                options={toneOptions}
                nicheLabel={draft.niche.trim() || "товар"}
                toneId={draft.toneId}
                toneLength={draft.toneLength}
                onSelectTone={(tid) => updateDraft({ toneId: tid })}
                onToneLength={(len) => updateDraft({ toneLength: len })}
              />
            </Stage>
          )}

          {activeStep === 6 && (
            <Stage
              eyebrow="Логотип"
              title="Логотип бренда."
              subtitle="Файл с устройства или варианты на основе уже заданных названия, ниши, палитры, стиля и тона. Утвердите один вариант или закончите без логотипа."
              emoji="🔖"
              variant="pop"
              hideEyebrow
              titleClassName="max-w-[min(100vw,56rem)] text-[clamp(2rem,5.2vw,3.75rem)] font-semibold leading-[1.06] tracking-[-0.07em] text-neutral-600"
              subtitleClassName="mt-5 max-w-[min(100vw,56rem)] text-lg leading-8 text-neutral-500 sm:max-w-4xl lg:max-w-5xl"
              immersive={
                draft.logoMode === "upload" || draft.logoMode === "generate"
              }
              contentClassName={
                draft.logoMode === "upload" || draft.logoMode === "generate"
                  ? "mt-0 flex min-h-0 flex-1 flex-col pb-2 md:pb-4"
                  : "mt-8 md:mt-10"
              }
            >
              <BrandLogoStep
                draftName={draft.name}
                draftNiche={draft.niche}
                draftDescription={draft.description}
                paletteTitle={draft.paletteId === "custom" ? "Своя палитра" : selectedPalette.title}
                paletteColors={effectivePaletteColors}
                visualStyleSummary={visualStyleSummary}
                toneTitle={toneTitleResolved}
                logoMode={draft.logoMode}
                logoFileName={draft.logoFileName}
                logoGeneratedUrls={draft.logoGeneratedUrls}
                logoChosenUrl={draft.logoChosenUrl}
                logoApprovedUrl={draft.logoApprovedUrl}
                onPatch={(patch) => updateDraft(patch)}
              />
            </Stage>
          )}
            </>
          )}
        </motion.div>
      </main>

      <div className="absolute bottom-7 left-6 right-6 z-20 flex flex-wrap items-center justify-between gap-3 md:left-auto md:right-9">
        <button
          type="button"
          onClick={goBack}
          disabled={activeStep === 0 && !showNameGen && !brandEditMode}
          className="rounded-full border border-neutral-300/70 bg-white/35 px-5 py-3 text-sm font-semibold text-neutral-600 backdrop-blur transition hover:bg-white/60 disabled:opacity-35"
        >
          Назад
        </button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {showNameGen && nameGenSelected ? (
            <button
              type="button"
              onClick={() => {
                updateDraft({ name: nameGenSelected, nameAssist: "picked" });
                setNameGenSelected(null);
                setShowNameGen(false);
                setActiveStep(0);
              }}
              className="inline-flex max-w-[min(calc(100vw-7rem),560px)] shrink-0 flex-col items-stretch justify-center gap-0.5 whitespace-normal rounded-[1.25rem] bg-[#B9FF4B] px-8 py-4 text-left text-sm font-bold leading-snug text-[#070907] shadow-[0_18px_48px_-28px_rgba(46,90,67,0.48)] transition hover:bg-[#c7ff68] sm:px-10 sm:text-base sm:leading-snug"
            >
              Выбрать «{nameGenSelected}»
            </button>
          ) : null}
          {isLastStep && draft.logoMode === "" && (
            <button
              type="button"
              onClick={() =>
                updateDraft({
                  logoMode: "later",
                  logoFileName: "",
                  logoGeneratedUrls: [],
                  logoChosenUrl: "",
                  logoApprovedUrl: "",
                })
              }
              className="rounded-full border-2 border-[#B9FF4B]/85 bg-[#B9FF4B]/22 px-5 py-2.5 text-sm font-bold tracking-tight text-[#070907] shadow-[0_10px_32px_-24px_rgba(185,255,75,0.85)] backdrop-blur-sm transition hover:bg-[#B9FF4B]/42 hover:shadow-[0_14px_38px_-22px_rgba(46,90,67,0.45)] active:scale-[0.98]"
            >
              Закончить без логотипа
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue}
            className={`items-center gap-3 rounded-[1.25rem] bg-[#070907] px-9 py-4 text-base font-bold text-white shadow-[0_18px_48px_-28px_rgba(7,9,7,0.9)] transition hover:-translate-y-0.5 hover:bg-[#2E5A43] disabled:translate-y-0 disabled:bg-neutral-300 disabled:shadow-none ${
              activeStep <= 2 ? "hidden" : "inline-flex"
            }`}
          >
            {isLastStep ? (brandEditMode ? "Сохранить" : "Открыть мой бренд") : "Далее"}
            {!isLastStep && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
    </LayoutGroup>
  );
}

function logoStepComplete(draft: BrandDraft): boolean {
  if (draft.logoMode === "later") return true;
  if (draft.logoMode === "upload") {
    const url = draft.logoApprovedUrl.trim();
    return Boolean(
      draft.logoFileName.trim() &&
        (url.startsWith("http://") || url.startsWith("https://"))
    );
  }
  if (draft.logoMode === "generate") return Boolean(draft.logoChosenUrl.trim());
  return false;
}

function getCompletion(draft: BrandDraft) {
  return [
    draft.name.trim().length >= 2,
    draft.niche.trim().length > 0,
    draft.description.trim().length >= 20,
    Boolean(draft.paletteId),
    Boolean(draft.styleId),
    Boolean(draft.toneId),
    logoStepComplete(draft),
  ];
}

function getStageShellMotion(activeStep: number) {
  const ease = [0.22, 1, 0.36, 1] as const;
  const easeSlide = [0.16, 1, 0.3, 1] as const;
  const motions = [
    {
      initial: { opacity: 0, y: 18, filter: "blur(10px)" },
      animate: { opacity: 1, y: 0, filter: "blur(0px)" },
      transition: { duration: 0.5, ease },
    },
    {
      initial: { opacity: 0, y: 28, scale: 0.985, filter: "blur(12px)" },
      animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
      transition: { duration: 0.82, ease },
    },
    {
      initial: { opacity: 0, x: -26, filter: "blur(10px)" },
      animate: { opacity: 1, x: 0, filter: "blur(0px)" },
      transition: { duration: 0.78, ease: easeSlide },
    },
    {
      initial: { opacity: 0, scale: 0.955, y: 18, filter: "blur(14px)" },
      animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
      transition: { duration: 0.9, ease },
    },
    {
      initial: { opacity: 0, x: 28 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.62, ease },
    },
    {
      initial: { opacity: 0, y: 18 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.58, ease },
    },
    {
      initial: { opacity: 0, y: -14, scale: 0.975, filter: "blur(10px)" },
      animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
      transition: { duration: 0.82, ease },
    },
  ];

  return motions[activeStep] ?? motions[0];
}

function getStagePreset(variant: "rise" | "handoff" | "scale" | "slide" | "pop" | "tone") {
  const ease = [0.22, 1, 0.36, 1] as const;

  if (variant === "handoff") {
    return {
      eyebrow: {
        initial: { opacity: 0, y: -8 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.08, duration: 0.46, ease },
      },
      title: {
        initial: { opacity: 0, x: -18 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: 0.24, duration: 0.66, ease },
      },
      subtitle: {
        initial: { opacity: 0, x: -12 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: 0.58, duration: 0.5, ease },
      },
      content: {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.84, duration: 0.62, ease },
      },
    };
  }

  if (variant === "scale") {
    return {
      eyebrow: {
        initial: { opacity: 0, scale: 0.94 },
        animate: { opacity: 1, scale: 1 },
        transition: { delay: 0.08, duration: 0.5, ease },
      },
      title: {
        initial: { opacity: 0, scale: 0.965, y: 14 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: { delay: 0.26, duration: 0.78, ease },
      },
      subtitle: {
        initial: { opacity: 0, scale: 0.98 },
        animate: { opacity: 1, scale: 1 },
        transition: { delay: 0.72, duration: 0.52, ease },
      },
      content: {
        initial: { opacity: 0, scale: 0.98, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: { delay: 1.02, duration: 0.72, ease },
      },
    };
  }

  if (variant === "slide") {
    return {
      eyebrow: {
        initial: { opacity: 0, x: 16 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: 0.08, duration: 0.46, ease },
      },
      title: {
        initial: { opacity: 0, x: 22 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: 0.18, duration: 0.58, ease },
      },
      subtitle: {
        initial: { opacity: 0, x: 14 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: 0.42, duration: 0.48, ease },
      },
      content: {
        initial: { opacity: 0, x: 14 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: 0.62, duration: 0.52, ease },
      },
    };
  }

  if (variant === "pop") {
    return {
      eyebrow: {
        initial: { opacity: 0, y: -10 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.08, duration: 0.46, ease },
      },
      title: {
        initial: { opacity: 0, scale: 0.94, rotate: -1 },
        animate: { opacity: 1, scale: 1, rotate: 0 },
        transition: { delay: 0.26, duration: 0.76, ease },
      },
      subtitle: {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.72, duration: 0.52, ease },
      },
      content: {
        initial: { opacity: 0, scale: 0.965, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: { delay: 1, duration: 0.68, ease },
      },
    };
  }

  if (variant === "tone") {
    return {
      eyebrow: {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.06, duration: 0.42, ease },
      },
      title: {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.16, duration: 0.58, ease },
      },
      subtitle: {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.44, duration: 0.5, ease },
      },
      content: {
        initial: { opacity: 0, y: 26 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 0.58, duration: 0.68, ease },
      },
    };
  }

  return {
    eyebrow: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { delay: 0.08, duration: 0.48, ease },
    },
    title: {
      initial: { opacity: 0, y: 16, x: -8 },
      animate: { opacity: 1, y: 0, x: 0 },
      transition: { delay: 0.28, duration: 0.68, ease },
    },
    subtitle: {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { delay: 0.78, duration: 0.5, ease },
    },
    content: {
      initial: { opacity: 0, y: 16 },
      animate: { opacity: 1, y: 0 },
      transition: { delay: 1.04, duration: 0.66, ease },
    },
  };
}

function Stage({
  eyebrow,
  title,
  subtitle,
  emoji,
  accent = "default",
  size = "default",
  variant = "rise",
  hideEyebrow = false,
  /** Полноэкранный режим шага: только контент, без заголовка и подзаголовка. */
  immersive = false,
  titleClassName,
  subtitleClassName,
  contentClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  emoji?: string;
  accent?: "default" | "soft";
  size?: "default" | "large";
  variant?: "rise" | "handoff" | "scale" | "slide" | "pop" | "tone";
  hideEyebrow?: boolean;
  immersive?: boolean;
  /** Если задан — заменяет стандартные классы заголовка (например одна строка). */
  titleClassName?: string;
  /** Если задан — заменяет стандартные классы подзаголовка (ширина и типографика). */
  subtitleClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const defaultTitleClassName =
    size === "large"
      ? "max-w-4xl text-6xl font-semibold tracking-[-0.08em] text-neutral-600 sm:text-7xl md:text-8xl"
      : "max-w-4xl text-5xl font-semibold tracking-[-0.075em] text-neutral-600 sm:text-6xl md:text-7xl";
  const resolvedTitleClassName = titleClassName ?? defaultTitleClassName;
  const resolvedSubtitleClassName =
    subtitleClassName ?? "mt-5 max-w-2xl text-lg leading-8 text-neutral-500";
  const motionPreset = getStagePreset(variant);

  return (
    <section className={`relative ${immersive ? "flex min-h-0 flex-1 flex-col" : ""}`}>
      {accent === "soft" && !immersive && (
        <div className="pointer-events-none absolute -right-10 -top-14 hidden rotate-6 rounded-[1.25rem] bg-[#B9FF4B] px-5 py-4 text-sm font-semibold text-[#070907] shadow-[0_18px_60px_-36px_rgba(46,90,67,0.75)] md:block">
          бренд-память
        </div>
      )}
      {!immersive && !hideEyebrow && (
        <motion.p
          initial={motionPreset.eyebrow.initial}
          animate={motionPreset.eyebrow.animate}
          transition={motionPreset.eyebrow.transition}
          className="mb-5 text-sm font-medium text-neutral-500"
        >
          {eyebrow}
        </motion.p>
      )}
      {!immersive && (
        <motion.h1
          initial={motionPreset.title.initial}
          animate={motionPreset.title.animate}
          transition={motionPreset.title.transition}
          className={resolvedTitleClassName}
        >
          {emoji && <span className="mr-3 inline-block align-[0.05em] text-[0.42em]">{emoji}</span>}
          {title}
        </motion.h1>
      )}
      {!immersive && (
        <motion.p
          initial={motionPreset.subtitle.initial}
          animate={motionPreset.subtitle.animate}
          transition={motionPreset.subtitle.transition}
          className={resolvedSubtitleClassName}
        >
          {subtitle}
        </motion.p>
      )}
      <motion.div
        initial={immersive ? { opacity: 0 } : motionPreset.content.initial}
        animate={immersive ? { opacity: 1 } : motionPreset.content.animate}
        transition={immersive ? { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const } : motionPreset.content.transition}
        className={
          immersive
            ? contentClassName ?? "mt-0 flex min-h-0 flex-1 flex-col"
            : contentClassName ?? "mt-10"
        }
      >
        {children}
      </motion.div>
    </section>
  );
}

function TypewriterText({ text, speed = 24 }: { text: string; speed?: number }) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    let index = 0;
    const intervalId = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(intervalId);
      }
    }, speed);

    return () => window.clearInterval(intervalId);
  }, [text, speed]);

  return (
    <>
      {visibleText}
      {visibleText.length < text.length && (
        <span className="ml-1 inline-block h-[0.82em] w-px translate-y-[0.08em] animate-pulse bg-neutral-400" />
      )}
    </>
  );
}

/** Подставляет нишу в шаблоны тона */
function personalizeToneSample(template: string, nicheWord: string) {
  const word = nicheWord.trim() || "продукт";
  return template.split(NICHE_PLACEHOLDER).join(word);
}

/** Печать для шага «Тон»: перенос строк, спокойный ритм; старт строк смещается, чтобы не было «гонки». */
function TypewriterToneDemo({
  text,
  resetKey,
  startDelay = 0,
  className,
}: {
  text: string;
  resetKey: string;
  startDelay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState("");
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    queueMicrotask(() => {
      setVisible("");
    });

    if (!text.length) return;

    let i = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled || i >= text.length) return;

      let pause = 54;
      if (i === 0) pause = 760 + startDelay;
      else {
        const prev = text[i - 1];
        if (/[.!?…]/.test(prev)) pause = 440;
        else if (/[,;:]/.test(prev)) pause = 155;
        else if (prev === " ") pause = 72;
      }

      const id = window.setTimeout(() => {
        if (cancelled) return;
        i += 1;
        setVisible(text.slice(0, i));
        tick();
      }, pause);
      timersRef.current.push(id);
    };

    tick();

    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [text, resetKey, startDelay]);

  return (
    <span className={className}>
      {visible}
      {visible.length < text.length && (
        <span className="ml-0.5 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] rounded-[1px] bg-[#2E5A43] animate-pulse" />
      )}
    </span>
  );
}

function ToneLaneRow({
  tone,
  index,
  nicheLabel,
  nicheKey,
  toneLength,
  selected,
  onSelect,
}: {
  tone: ToneOption;
  index: number;
  nicheLabel: string;
  nicheKey: string;
  toneLength: "short" | "long";
  selected: boolean;
  onSelect: () => void;
}) {
  const raw = toneLength === "short" ? tone.sampleShort : tone.sampleLong;
  const sample = personalizeToneSample(raw, nicheLabel);
  const staggerMs = index * 520;

  return (
    <button
      type="button"
      onClick={() => startTransition(onSelect)}
      className={`group w-full rounded-[1.35rem] border text-left transition-all md:rounded-[1.55rem] ${
        selected
          ? "border-[#070907]/30 bg-[#B9FF4B]/22 shadow-[0_18px_46px_-40px_rgba(46,90,67,0.35)] ring-[3px] ring-[#B9FF4B]/60"
          : "border-[#070907]/12 bg-[#E3DCC8]/45 backdrop-blur-[2px] hover:border-[#070907]/20 hover:bg-[#D9D1BB]/55"
      }`}
    >
      <div className="flex flex-col gap-4 px-5 pb-6 pt-5 md:flex-row md:items-start md:gap-12 md:px-8 md:pb-8 md:pt-7 lg:gap-16">
        <div className="flex shrink-0 flex-row items-baseline gap-4 md:w-52 md:flex-col md:gap-2 lg:w-56">
          <span className="font-mono text-[11px] font-semibold tabular-nums text-neutral-400">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.032em] text-neutral-600 md:text-lg">{tone.title}</span>
        </div>
        <div
          className={`min-w-0 flex-1 ${
            toneLength === "long" ? "min-h-[4.5rem] md:min-h-[5.5rem]" : "min-h-[3.35rem] md:min-h-[3.85rem]"
          }`}
        >
          <TypewriterToneDemo
            text={sample}
            resetKey={`${toneLength}-${tone.id}-${nicheKey}`}
            startDelay={staggerMs}
            className="block whitespace-normal break-words text-left text-[clamp(0.8125rem,1.55vw,1.28rem)] font-medium leading-[1.58] tracking-[-0.028em] text-[#070907] md:text-[clamp(0.9rem,1.22vw,1.42rem)] md:leading-[1.54]"
          />
        </div>
      </div>
    </button>
  );
}

function ToneHorizontalLanes({
  options,
  nicheLabel,
  toneId,
  toneLength,
  onSelectTone,
  onToneLength,
}: {
  options: ToneOption[];
  nicheLabel: string;
  toneId: string;
  toneLength: "short" | "long";
  onSelectTone: (id: string) => void;
  onToneLength: (length: "short" | "long") => void;
}) {
  const nicheKey = nicheLabel.trim() || "default";

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <div className="flex flex-col gap-6 md:gap-8">
        {options.map((tone, index) => (
          <ToneLaneRow
            key={tone.id}
            tone={tone}
            index={index}
            nicheLabel={nicheLabel}
            nicheKey={nicheKey}
            toneLength={toneLength}
            selected={toneId === tone.id}
            onSelect={() => onSelectTone(tone.id)}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-400">объём текста</span>
        <div className="inline-flex rounded-full border border-[#070907]/14 bg-[#ECE7D8]/40 p-1 shadow-[0_12px_36px_-34px_rgba(7,9,7,0.35)]">
          <button
            type="button"
            onClick={() => startTransition(() => onToneLength("short"))}
            className={`rounded-full px-6 py-2.5 text-xs font-bold transition sm:text-sm ${
              toneLength === "short"
                ? "bg-[#070907] text-white shadow-[0_10px_28px_-18px_rgba(7,9,7,0.78)]"
                : "text-neutral-600 hover:text-[#070907]"
            }`}
          >
            Коротко
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => onToneLength("long"))}
            className={`rounded-full px-6 py-2.5 text-xs font-bold transition sm:text-sm ${
              toneLength === "long"
                ? "bg-[#070907] text-white shadow-[0_10px_28px_-18px_rgba(7,9,7,0.78)]"
                : "text-neutral-600 hover:text-[#070907]"
            }`}
          >
            Развёрнуто
          </button>
        </div>
      </div>

      <p className="text-center text-xs font-medium text-neutral-400">
        {toneId ? `Выбран голос: ${options.find((t) => t.id === toneId)?.title ?? ""}` : "Нажмите на блок, чтобы закрепить тон"}
      </p>
    </div>
  );
}

function InlineNext({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2, scale: disabled ? 1 : 1.015 }}
      whileTap={{ scale: disabled ? 1 : 0.985 }}
      transition={{ delay: 0.96, duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-9 inline-flex items-center gap-3 rounded-[1.35rem] bg-[#070907] px-10 py-5 text-base font-bold text-white shadow-[0_20px_54px_-30px_rgba(7,9,7,0.9)] transition hover:bg-[#2E5A43] disabled:bg-neutral-300 disabled:shadow-none"
    >
      Далее
      <ArrowRight className="h-4 w-4" />
    </motion.button>
  );
}

function NameSignMark() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[24%] min-w-[190px] lg:block xl:w-[22%]">
      <motion.div
        initial={{ opacity: 0, y: -14, rotate: -2 }}
        animate={{ opacity: 1, y: [0, -5, 0], rotate: [-1.5, 1, -1.5] }}
        transition={{
          opacity: { delay: 1.05, duration: 0.55 },
          y: { delay: 1.2, duration: 5.8, repeat: Infinity, ease: "easeInOut" },
          rotate: { delay: 1.2, duration: 6.4, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute -right-[6.5rem] top-[-2%] h-52 w-52 origin-top-right scale-[1.3] xl:-right-[8.75rem] xl:top-[-3.5%] xl:h-56 xl:w-56 2xl:-right-[10rem] 2xl:top-[-4%]"
      >
        <svg viewBox="0 0 220 190" className="h-full w-full overflow-visible">
          <motion.path
            d="M58 86 L110 43 L162 86"
            fill="none"
            stroke="#070907"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 1.15, duration: 0.9, ease: "easeInOut" }}
          />
          <motion.circle
            cx="110"
            cy="36"
            r="15"
            fill="#F3F1EA"
            stroke="#070907"
            strokeWidth="7"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.38, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.rect
            x="38"
            y="83"
            width="144"
            height="70"
            rx="13"
            fill="#F3F1EA"
            stroke="#070907"
            strokeWidth="7"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.42, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.rect
            x="55"
            y="104"
            width="74"
            height="8"
            rx="4"
            fill="#B9FF4B"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ transformOrigin: "55px 108px" }}
            transition={{ delay: 1.78, duration: 0.42, ease: "easeOut" }}
          />
          <motion.rect
            x="55"
            y="122"
            width="108"
            height="8"
            rx="4"
            fill="#2E5A43"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ transformOrigin: "55px 126px" }}
            transition={{ delay: 1.9, duration: 0.48, ease: "easeOut" }}
          />
        </svg>
      </motion.div>
    </div>
  );
}

function PalettePicker({
  palettes,
  selectedPalette,
  selectedId,
  onSelect,
  onCustomColorChange,
}: {
  palettes: PaletteOption[];
  selectedPalette: PaletteOption;
  selectedId: string;
  onSelect: (paletteId: string) => void;
  onCustomColorChange: (colorIndex: number, color: string) => void;
}) {
  const labels = ["Заголовок", "Основной", "Акцент", "Фон"];
  const isCustomPalette = selectedPalette.id === "custom";

  return (
    <div className="grid max-w-[1280px] grid-cols-[minmax(0,1fr)_580px] gap-7">
      <motion.div
        key={selectedPalette.id}
        initial={{ opacity: 0, scale: 0.985, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-0"
      >
        <div
          className="relative min-h-[318px] overflow-hidden rounded-[2rem] border-[3px] border-[#070907] p-7 shadow-[0_24px_78px_-58px_rgba(7,9,7,0.9)]"
          style={{ backgroundColor: selectedPalette.colors[3] }}
        >
          <div className="mb-8 flex items-center justify-between">
            <div className="flex gap-2">
              {selectedPalette.colors.slice(0, 3).map((color, index) => (
                <span
                  key={`${selectedPalette.id}-dot-${index}`}
                  className="h-3 w-3 rounded-full border border-[#070907]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <span className="rounded-full border-2 border-[#070907] px-3 py-1 text-xs font-bold" style={{ color: selectedPalette.colors[0] }}>
              {selectedPalette.subtitle}
            </span>
          </div>

          <div className="grid gap-7 md:grid-cols-[1fr_260px]">
            <div>
              <motion.h3
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
                className="max-w-md text-5xl font-bold leading-[0.92] tracking-[-0.08em]"
                style={{ color: selectedPalette.colors[0] }}
              >
                Палитра {selectedPalette.title} в контексте.
              </motion.h3>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                className="mt-6 max-w-sm text-base leading-7"
                style={{ color: selectedPalette.colors[0] }}
              >
                Подборка будет помогать Karto держать единый визуальный стиль карточек, шаблонов и будущих описаний.
              </motion.p>
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                type="button"
                className="mt-8 rounded-none border-[3px] border-[#070907] px-7 py-4 text-base font-bold transition hover:-translate-y-0.5"
                style={{ backgroundColor: selectedPalette.colors[2], color: selectedPalette.colors[0] }}
                onClick={() => onSelect(selectedPalette.id)}
              >
                Выбрать палитру
              </motion.button>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 22, rotate: 1.5 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              transition={{ delay: 0.38, duration: 0.76, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-64"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-0 h-48 w-48 rounded-[1.2rem] border-[3px] border-[#070907]"
                style={{ backgroundColor: selectedPalette.colors[1] }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.68, duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-0 left-0 h-44 w-48 rounded-[1rem] border-[3px] border-[#070907]"
                style={{ backgroundColor: selectedPalette.colors[3] }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: -16 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ delay: 0.84, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-10 left-10 h-20 w-28 rounded-tl-[3rem] border-[3px] border-[#070907]"
                style={{ backgroundColor: selectedPalette.colors[2] }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.02, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-4 top-14 h-12 w-12 rounded-full border-[3px] border-[#070907]"
                style={{ backgroundColor: selectedPalette.colors[2] }}
              />
            </motion.div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {selectedPalette.colors.map((color, index) => (
            <motion.label
              key={`${selectedPalette.id}-${index}`}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18 + index * 0.13, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className={`flex items-center justify-between rounded-[0.85rem] border-2 border-[#070907] bg-white/20 px-4 py-3 text-left text-sm font-bold text-[#070907] ${
                isCustomPalette ? "cursor-pointer transition hover:bg-white/35" : "cursor-default"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full border-2 border-[#070907]" style={{ backgroundColor: color }} />
                {labels[index]}
              </span>
              <span className="flex items-center gap-2">
                {isCustomPalette && (
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => onCustomColorChange(index, event.target.value)}
                    className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    aria-label={`Выбрать цвет: ${labels[index]}`}
                  />
                )}
                <span>{color.toUpperCase()}</span>
              </span>
            </motion.label>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.48, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="grid content-start grid-cols-4 gap-x-4 gap-y-5 pt-3"
      >
        {palettes.map((palette, index) => (
          <motion.button
            key={palette.id}
            type="button"
            onClick={() => onSelect(palette.id)}
            initial={{ opacity: 0, x: 34, y: 10, scale: 0.96, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.85 + index * 0.055, duration: 0.64, ease: [0.22, 1, 0.36, 1] }}
            className={`group relative rounded-full p-1.5 transition hover:-translate-y-0.5 hover:scale-[1.025] ${
              selectedId === palette.id ? "scale-[1.035]" : ""
            }`}
            title={`${palette.title}: ${palette.subtitle}`}
          >
            {selectedId === palette.id && (
              <span
                className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#070907] shadow-[0_0_0_5px_rgba(185,255,75,0.42),0_14px_34px_-14px_rgba(7,9,7,0.9)]"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[#B9FF4B]" />
              </span>
            )}
            {selectedId === palette.id && (
              <span className="absolute inset-0 rounded-full bg-[#B9FF4B]/20 blur-md" />
            )}
            <div
              className={`relative flex h-14 overflow-hidden rounded-[999px_999px_999px_1.2rem] border shadow-[0_16px_46px_-36px_rgba(7,9,7,0.85)] transition ${
                selectedId === palette.id
                  ? "border-[#B9FF4B]/80 shadow-[0_20px_54px_-34px_rgba(46,90,67,0.95)]"
                  : "border-white/65 group-hover:border-[#B9FF4B]/55"
              }`}
            >
              {palette.colors.map((color, colorIndex) => (
                <span key={`${palette.id}-${colorIndex}`} className="w-9" style={{ backgroundColor: color }} />
              ))}
            </div>
            {palette.id === "custom" && (
              <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[#070907] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#B9FF4B] shadow-[0_12px_28px_-18px_rgba(7,9,7,0.9)]">
                индивидуальный
              </span>
            )}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

function VisualStylePicker({
  styles,
  selectedId,
  onSelect,
  customStyle,
  onCustomStyleChange,
}: {
  styles: VisualStyleOption[];
  selectedId: string;
  onSelect: (styleId: string) => void;
  customStyle: CustomVisualStyle;
  onCustomStyleChange: (patch: Partial<CustomVisualStyle>) => void;
}) {
  const customOption: VisualStyleOption = {
    id: "custom-style",
    title: "Индивидуальный",
    subtitle: "соберите свой набор правил",
    mood: customStyle.mood,
    composition: customStyle.composition,
    textDensity: customStyle.textDensity,
    scene: customStyle.scene,
    typography: customStyle.typography,
    colors: ["#070907", "#2E5A43", "#B9FF4B"],
    preview: "clean",
  };
  const styleOptions = [...styles, customOption];
  const selectedStyle = styleOptions.find((style) => style.id === selectedId) ?? styles[0];
  const styleParameterRows: Array<{ key: keyof CustomVisualStyle; label: string; options: string[] }> = [
    {
      key: "composition",
      label: "Композиция",
      options: ["товар крупно", "инфографика", "lifestyle", "каталог", "баннер", "минимализм"],
    },
    {
      key: "textDensity",
      label: "Текст",
      options: ["очень мало", "мало текста", "средне", "много текста"],
    },
    {
      key: "scene",
      label: "Сцена",
      options: ["светлый фон", "студийная сцена", "интерьер", "природные материалы", "цветные формы", "промо-подача"],
    },
    {
      key: "typography",
      label: "Типографика",
      options: ["если будет", "аккуратная", "крупная", "editorial", "строгая", "смелая"],
    },
    {
      key: "mood",
      label: "Настроение",
      options: ["спокойно", "премиально", "натурально", "ярко", "технологично", "акционно"],
    },
  ];

  return (
    <div className="grid max-w-[1280px] grid-cols-[minmax(0,1fr)_430px] gap-8">
      <div className="grid content-start grid-cols-3 gap-4">
        {styleOptions.map((style, index) => (
          <button
            key={style.id}
            type="button"
            onClick={() => startTransition(() => onSelect(style.id))}
            className={`group relative overflow-hidden rounded-[1.4rem] p-4 text-left shadow-[0_18px_52px_-48px_rgba(7,9,7,0.52)] transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 ${
              style.id === "custom-style"
                ? `flex min-h-[120px] flex-col pb-5 pt-4 ${
                    selectedId === style.id
                      ? "bg-[#070907] text-white shadow-[0_24px_66px_-44px_rgba(7,9,7,0.92)]"
                      : "bg-[#070907]/85 text-white hover:bg-[#070907]"
                  }`
                : `min-h-[104px] ${selectedId === style.id ? "bg-[#B9FF4B] text-[#070907] shadow-[0_24px_66px_-44px_rgba(46,90,67,0.9)]" : "bg-[#ECE7D8]/60 text-[#070907] hover:bg-[#E3EED0]/80"}`
            }`}
          >
            {selectedId === style.id && (
              <span
                className={`absolute right-4 top-4 z-10 h-3 w-12 rounded-full ${
                  style.id === "custom-style" ? "bg-[#B9FF4B]" : "bg-[#070907]"
                }`}
              />
            )}
            <div
              className={`mb-3 font-mono text-xs font-bold ${
                style.id === "custom-style" ? "text-white/45" : "text-[#070907]/35"
              }`}
            >
              {String(index + 1).padStart(2, "0")}
            </div>
            <p
              className={`min-w-0 break-words pr-10 font-bold tracking-[-0.055em] ${
                style.id === "custom-style"
                  ? "flex-1 leading-[1.12] text-[clamp(1rem,2.2vw,1.35rem)] text-white [overflow-wrap:anywhere]"
                  : "leading-[1.02] text-[clamp(1.1rem,2.5vw,1.65rem)] text-[#070907]"
              }`}
            >
              {style.title}
            </p>
            <div
              className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${
                style.id === "custom-style" ? "mt-auto" : "mt-3"
              } ${
                style.id === "custom-style"
                  ? "bg-[#B9FF4B] text-[#070907]"
                  : selectedId === style.id
                    ? "bg-white/45 text-[#070907]"
                    : "bg-[#070907]/7 text-[#070907]"
              }`}
            >
              {style.mood}
            </div>
          </button>
        ))}
      </div>

      <aside
        className="relative isolate self-start overflow-hidden rounded-[2.2rem] bg-[#B9FF4B] p-6 text-[#070907] shadow-[0_28px_80px_-58px_rgba(46,90,67,0.55)]"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#F3F1EA]/35 blur-2xl" />
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#070907]/45">итог стиля</p>

        <motion.div
          key={selectedStyle.id}
          initial={{ opacity: 0, x: 14, scale: 0.987 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.82 }}
        >
          <h3 className="break-words pr-1 text-[clamp(1.55rem,3.6vw,2.65rem)] font-bold leading-[1.02] tracking-[-0.052em] text-[#070907]">
            {selectedStyle.title}
          </h3>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {styleParameterRows.map((row, index) => {
              const readValue = selectedStyle[row.key];
              const isCustom = selectedStyle.id === "custom-style";

              return (
                <motion.div
                  key={row.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 32,
                    delay: index * 0.05,
                  }}
                  className={`${index === 4 ? "col-span-2" : ""} rounded-[1.15rem] bg-[#070907]/[0.07] px-4 py-3.5 shadow-[0_12px_36px_-34px_rgba(7,9,7,0.55)]`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#070907]/48">{row.label}</div>
                  {isCustom ? (
                    <select
                      value={customStyle[row.key]}
                      onChange={(event) =>
                        startTransition(() => onCustomStyleChange({ [row.key]: event.target.value }))
                      }
                      className="mt-2 w-full cursor-pointer appearance-none rounded-[1.25rem] border border-[#070907]/12 bg-[#ECE7D8]/92 px-4 py-3 pr-10 text-base font-bold tracking-[-0.035em] text-[#070907] shadow-[0_16px_44px_-40px_rgba(7,9,7,0.72)] outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-[#070907]/20 hover:bg-[#E3EED0]/95 hover:shadow-[0_18px_48px_-38px_rgba(46,90,67,0.48)] focus-visible:border-[#070907]/28 focus-visible:ring-2 focus-visible:ring-[#070907]/15"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23070907' stroke-width='2.2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 0.85rem center",
                        backgroundSize: "0.65rem",
                      }}
                      aria-label={row.label}
                    >
                      {row.options.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 text-xl font-bold tracking-[-0.04em] text-[#070907]">{readValue}</div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <button
          type="button"
          onClick={() => startTransition(() => onSelect(selectedStyle.id))}
          className="mt-4 w-full rounded-[1.15rem] bg-[#070907] px-6 py-4 text-base font-bold text-white transition hover:-translate-y-0.5"
        >
          Выбрать стиль
        </button>
      </aside>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  description,
  layoutId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  description?: string;
  layoutId?: string;
}) {
  return (
    <motion.button
      layoutId={layoutId}
      type="button"
      onClick={onClick}
      title={description}
      className={`group inline-flex items-center gap-2 rounded-[1.1rem] border px-4 py-3 text-sm font-semibold shadow-[0_10px_36px_-32px_rgba(7,9,7,0.65)] backdrop-blur transition hover:-translate-y-0.5 ${
        active
          ? "border-[#B9FF4B] bg-[#B9FF4B] text-[#070907]"
          : "border-white/55 bg-white/42 text-neutral-600 hover:border-[#B9FF4B]/50 hover:bg-white/75 hover:text-[#070907]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full transition ${
          active ? "bg-[#070907]" : "bg-neutral-300 group-hover:bg-[#2E5A43]"
        }`}
      />
      {children}
    </motion.button>
  );
}
