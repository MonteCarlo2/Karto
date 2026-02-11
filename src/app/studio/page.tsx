"use client";

import { IntroAnimation } from "@/components/ui/intro-animation";

/**
 * Страница /studio теперь показывает вступительную анимацию Потока
 * (зелёный экран «Добро пожаловать…» с большой стрелкой и кнопкой
 * «Запустить Поток»).
 *
 * При нажатии на кнопку переход выполняется внутри IntroAnimation
 * на /studio/understanding — сам поток мы не трогаем.
 */
export default function StudioPage() {
  return <IntroAnimation onComplete={() => {}} />;
}
