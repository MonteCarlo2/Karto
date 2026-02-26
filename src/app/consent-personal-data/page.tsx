"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ConsentPersonalDataPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f5f3ef] relative" suppressHydrationWarning>
      <div className="container mx-auto px-6 py-12 max-w-4xl" suppressHydrationWarning>
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

        <h1 className="text-4xl font-bold text-gray-900 mb-6 text-center" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
          Согласие на обработку персональных данных пользователей платформы KARTO
        </h1>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>Дата публикации: 13 февраля 2026 года</p>
          <span className="text-gray-400">•</span>
          <p suppressHydrationWarning>Оператор: Самозанятый Симонян Эрик Каренович (ИНН 231142064831)</p>
        </div>

        <div className="max-w-3xl mx-auto space-y-8 text-gray-800" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }} suppressHydrationWarning>
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
              1. Суть согласия
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              Регистрируясь на сайте karto.pro, заполняя формы обратной связи или совершая оплату, я (далее — «Пользователь»), действуя свободно, своей волей и в своем интересе, даю конкретное, информированное и сознательное согласие Оператору на обработку моих персональных данных.
            </p>
          </section>

          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
              2. Перечень обрабатываемых данных
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Я разрешаю Оператору обрабатывать следующую информацию:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Адрес электронной почты (email);</li>
              <li suppressHydrationWarning>Имя и/или никнейм;</li>
              <li suppressHydrationWarning>Технические данные: IP-адрес, тип браузера, данные файлов cookies, геолокация;</li>
              <li suppressHydrationWarning>Сведения о покупках и тарифных планах.</li>
            </ul>
          </section>

          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
              3. Цели обработки данных
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Данные обрабатываются исключительно для:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Создания личного кабинета и идентификации Пользователя;</li>
              <li suppressHydrationWarning>Предоставления доступа к ИИ-сервисам генерации товарных карточек;</li>
              <li suppressHydrationWarning>Направления информационных и рекламных сообщений (в случае активации соответствующего согласия);</li>
              <li suppressHydrationWarning>Получения обратной связи и технической поддержки;</li>
              <li suppressHydrationWarning>Сбора аналитики для улучшения работы платформы через сервис Яндекс.Метрика (при отдельном согласии на аналитические cookies).</li>
            </ul>
          </section>

          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
              4. Условия и место обработки
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1. Локализация</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Я уведомлен, что хранение и первичная обработка моих данных производятся на серверах, расположенных на территории Российской Федерации (провайдер Timeweb Cloud).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2. Безопасность</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Обработка может быть как автоматизированной, так и неавтоматизированной (в случае ручной модерации запросов в поддержку).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.3. Передача</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Я даю согласие на передачу обезличенных данных (запросы, изображения) техническим партнерам Оператора для выполнения процесса нейросетевой генерации.
                </p>
              </div>
            </div>
          </section>

          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
              5. Срок действия и отзыв согласия
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Настоящее согласие действует с момента регистрации и до момента его отзыва или до удаления аккаунта Пользователем.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Я могу отозвать данное согласие в любой момент, направив письменное уведомление на электронную почту Оператора: aiora.help@mail.ru.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор обязуется прекратить обработку и удалить данные в течение 10 рабочих дней с момента получения отзыва.
                </p>
              </div>
            </div>
          </section>

          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: "var(--font-playfair), serif" }} suppressHydrationWarning>
              6. Связь с Политиками
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              Настоящее согласие является неотъемлемой частью Политики конфиденциальности и Условий использования, размещенных на сайте karto.pro.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
