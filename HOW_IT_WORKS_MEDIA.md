# Медиа для блока «Как это работает»

## Sticky Scroll Reveal (экран с курсором)

В `src/components/landing/sticky-scroll-reveal.tsx`:
- **Первый экран** — скриншот уже подключён: `public/demo/screen-etap-1.png` (экран «Понимание» с кнопками ВЫБРАТЬ). Курсор анимированно нажимает на левую кнопку «ВЫБРАТЬ».
- **Второй экран** — после клика показывается плейсхолдер «Загрузка фото товара». Чтобы подставить свой скриншот этапа 2: положите файл в `public/demo/screen-etap-2.png` и в компоненте замените блок с `Upload` и текстом на `<Image src="/demo/screen-etap-2.png" ... />` по аналогии с первой сценой.

---

В `src/components/landing/process-section-21st.tsx` у каждого этапа есть поле **`mediaSrc`**. Пока оно не задано — показывается плейсхолдер «Скрин или GIF этапа».

## Как добавить гифки или скриншоты

1. Положите файлы в `public/`, например:
   - `public/landing/step-understanding.gif`
   - `public/landing/step-description.gif`
   - `public/landing/step-visual.gif`
   - `public/landing/step-price.gif`

2. В том же файле в массиве `steps` укажите пути:
   ```ts
   {
     id: "understanding",
     stage: "Понимание",
     // ...
     mediaSrc: "/landing/step-understanding.gif",
     mediaAlt: "Экран этапа Понимание",
   },
   ```

3. Сохраните — изображение или гифка подставятся вместо плейсхолдера.

## Как получить гифки экранов

- **Скриншоты**: сделайте скрин каждого экрана студии (Понимание, Описание, Визуал, Цена) и сохраните как PNG/JPG в `public/landing/`.
- **GIF**: можно записать экран в OBS или другим софтом и экспортировать в GIF, либо сгенерировать короткое видео и конвертировать в GIF (например, через [ezgif.com](https://ezgif.com/video-to-gif)).
- **Видео**: если позже захотите вставить именно видео (MP4), в компоненте можно заменить блок с `Image` на `<video autoPlay loop muted playsInline />` и передавать `mediaSrc` как источник видео.
