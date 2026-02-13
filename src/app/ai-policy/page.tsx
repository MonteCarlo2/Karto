"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AIPolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f5f3ef] relative" suppressHydrationWarning>
      <div className="container mx-auto px-6 py-12 max-w-4xl" suppressHydrationWarning>
        {/* Header with back button and small title */}
        <div className="flex items-start justify-between mb-12" suppressHydrationWarning>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors group"
            suppressHydrationWarning
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span>Назад</span>
          </button>
          
          <Link 
            href="/policy-and-terms"
            className="text-xs text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
            suppressHydrationWarning
          >
            ПОЛИТИКА И УСЛОВИЯ
          </Link>
        </div>

        {/* Main title */}
        <h1 className="text-4xl font-bold text-gray-900 mb-6 text-center" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
          Политика использования искусственного интеллекта (AI Policy) KARTO
        </h1>

        {/* Sub-information */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>Версия 1.1</p>
          <span className="text-gray-400">•</span>
          <p suppressHydrationWarning>Дата обновления: 13 февраля 2026 года</p>
          <span className="text-gray-400">•</span>
          <p suppressHydrationWarning>Оператор: Самозанятый Симонян Эрик Каренович (ИНН 231142064831)</p>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto space-y-8 text-gray-800" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }} suppressHydrationWarning>
          {/* Section 1 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              1. Общие положения
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  ИИ-функции KARTO обеспечивают автоматизированное создание контента: генерацию описаний товаров, обработку фотографий (удаление/замена фона), создание инфографики и видеообложек.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Все результаты формируются автоматически на основе вероятностных алгоритмов. Они могут содержать фактические неточности, визуальные артефакты или ошибки.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь признает ИИ инструментом помощи и обязуется самостоятельно проверять итоговый контент на соответствие реальности.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Допустимое использование ИИ
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Пользователь может применять ИИ-функции KARTO для легальной коммерческой деятельности на маркетплейсах (Wildberries, Ozon, Яндекс.Маркет и др.).
            </p>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              Разрешается: создание SEO-описаний, генерация визуального контента, рерайт текстов, создание сценариев и инфографики.
            </p>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Запрещённое использование ИИ
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Запрещена генерация контента для товаров, запрещенных законодательством РФ (наркотические вещества, оружие и др.).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено намеренное создание контрафакта и использование ИИ для обхода авторских прав третьих лиц.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено создание порнографических материалов (NSFW) и дипфейков реальных людей без их согласия.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено использование ИИ для генерации заведомо ложных медицинских утверждений или фейковых отзывов.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Ответственность Пользователя
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1. Проверка фактов</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Ответственность за соответствие описания реальному товару лежит на Пользователе. ИИ может допускать «галлюцинации» в характеристиках.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2. Визуальный контроль</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь обязан осмотреть сгенерированное изображение на наличие артефактов перед публикацией.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.3. Модерация</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Ответственность за прохождение модерации на маркетплейсах и возможные штрафы площадок за контент несет Пользователь.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Обработка данных ИИ-моделями
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор использует технологии компьютерного зрения для анализа загруженных фото товаров.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Локализация: Первоначальный сбор и обработка данных производятся на территории РФ.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Для выполнения генерации обезличенные данные могут передаваться техническим партнерам (провайдерам GPU-мощностей). Данные передаются в зашифрованном виде исключительно для выполнения текущей задачи.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Интеллектуальные права
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор передает Пользователю все имущественные права на сгенерированный контент для коммерческого использования.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор не гарантирует эксклюзивную защиту сгенерированного ИИ контента от копирования третьими лицами ввиду неопределенности законодательства в этой области.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Контакты
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              По вопросам некорректной работы алгоритмов или нарушения этических норм обращайтесь: aiora.help@mail.ru.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
