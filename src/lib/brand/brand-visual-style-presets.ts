/** Визуальные стили онбординга бренда — один источник для мастера и свободного творчества. */
export type BrandVisualStylePreview =
  | "clean"
  | "infographic"
  | "editorial"
  | "eco"
  | "beauty"
  | "pop"
  | "minimal"
  | "home"
  | "tech"
  | "promo";

export type BrandVisualStyleOption = {
  id: string;
  title: string;
  subtitle: string;
  mood: string;
  composition: string;
  textDensity: string;
  scene: string;
  typography: string;
  colors: string[];
  preview: BrandVisualStylePreview;
};

export const BRAND_VISUAL_STYLE_OPTIONS: BrandVisualStyleOption[] = [
  {
    id: "clean-card",
    title: "Чистая карточка",
    subtitle: "понятная композиция, белый воздух, акцент на товар",
    mood: "спокойно",
    composition: "товар крупно",
    textDensity: "мало текста",
    scene: "светлый фон",
    typography: "аккуратная",
    colors: ["#F8FAF7", "#172217", "#B9FF4B"],
    preview: "clean",
  },
  {
    id: "marketplace-info",
    title: "Маркетплейс-инфографика",
    subtitle: "выгоды, стрелки, подписи и структура для карточки",
    mood: "продающе",
    composition: "инфографика",
    textDensity: "много текста",
    scene: "карточка с выгодами",
    typography: "крупная",
    colors: ["#F4F1E8", "#070907", "#B9FF4B"],
    preview: "infographic",
  },
  {
    id: "premium-editorial",
    title: "Premium editorial",
    subtitle: "каталожная подача, тени, крупная типографика",
    mood: "премиально",
    composition: "каталог",
    textDensity: "средне",
    scene: "студийная сцена",
    typography: "editorial",
    colors: ["#F7F2E8", "#141414", "#C9A66B"],
    preview: "editorial",
  },
  {
    id: "eco-natural",
    title: "Натуральный / Eco",
    subtitle: "природные материалы, мягкий свет, органика",
    mood: "натурально",
    composition: "lifestyle",
    textDensity: "мало текста",
    scene: "природные материалы",
    typography: "мягкая",
    colors: ["#F6F1DE", "#10251D", "#C5D7A4"],
    preview: "eco",
  },
  {
    id: "beauty-clean",
    title: "Beauty clean",
    subtitle: "глянец, чистые поверхности, уходовая эстетика",
    mood: "чисто",
    composition: "студийно",
    textDensity: "мало текста",
    scene: "глянец и уход",
    typography: "тонкая",
    colors: ["#FFF1F6", "#431327", "#F49AB8"],
    preview: "beauty",
  },
  {
    id: "pop-commerce",
    title: "Pop-commerce",
    subtitle: "ярко, контрастно, заметно в ленте",
    mood: "ярко",
    composition: "акцент",
    textDensity: "средне",
    scene: "цветные формы",
    typography: "смелая",
    colors: ["#FFF8D9", "#12140B", "#B9FF4B"],
    preview: "pop",
  },
  {
    id: "apple-minimal",
    title: "Apple-like минимализм",
    subtitle: "очень много воздуха, один объект, строгий порядок",
    mood: "строго",
    composition: "минимализм",
    textDensity: "очень мало",
    scene: "воздух и порядок",
    typography: "строгая",
    colors: ["#FAFAFA", "#050505", "#D8D8D8"],
    preview: "minimal",
  },
  {
    id: "home-cozy",
    title: "Домашний уют",
    subtitle: "интерьер, мягкие ткани, натуральный свет",
    mood: "тепло",
    composition: "интерьер",
    textDensity: "мало текста",
    scene: "дом и свет",
    typography: "дружелюбная",
    colors: ["#FBF4E8", "#2B2118", "#E7D3B0"],
    preview: "home",
  },
  {
    id: "tech-future",
    title: "Tech / Future",
    subtitle: "холодный свет, стекло, технологичность",
    mood: "технологично",
    composition: "градиент",
    textDensity: "средне",
    scene: "стекло и свет",
    typography: "цифровая",
    colors: ["#F8FAFC", "#0F172A", "#38BDF8"],
    preview: "tech",
  },
  {
    id: "promo-banner",
    title: "Акционный баннер",
    subtitle: "скидки, крупный заголовок, яркая промо-подача",
    mood: "акционно",
    composition: "баннер",
    textDensity: "много текста",
    scene: "промо-подача",
    typography: "очень крупная",
    colors: ["#FFF1F2", "#2A0712", "#EF4444"],
    preview: "promo",
  },
];
