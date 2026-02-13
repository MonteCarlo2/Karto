"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PrivacyPage() {
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
          Политика конфиденциальности KARTO
        </h1>

        {/* Sub-information */}
        <div className="flex items-center justify-between mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>
            Предварительная версия для периода тестирования платформы
          </p>
          <span className="text-gray-400 mx-2">•</span>
          <p suppressHydrationWarning>
            Дата последнего обновления: 2026
          </p>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto space-y-8 text-gray-800" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }} suppressHydrationWarning>
          {/* Введение */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              Введение
            </h2>
            <div className="space-y-4 text-[15px] leading-6" suppressHydrationWarning>
              <p suppressHydrationWarning>
                Настоящая Политика конфиденциальности (далее — «Политика») регулирует порядок сбора, использования, хранения, передачи и защиты персональных данных и иной информации пользователей (далее — «Пользователь») при использовании SaaS-платформы KARTO и связанных сервисов (далее — «Сервис»), включая инструменты генерации товарных карточек, обработки изображений и видео с помощью искусственного интеллекта.
              </p>
              <p suppressHydrationWarning>
                Используя Сервис (загружая фотографии товаров, генерируя описания или скачивая готовый контент), Пользователь подтверждает, что ознакомлен с настоящей Политикой и принимает ее условия.
              </p>
            </div>
          </section>

          {/* Section 1 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              1. Общие положения
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператором персональных данных является Симонян Эрик Каренович (ИНН 231142064831).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор обязуется обеспечивать конфиденциальность информации Пользователя и принимать необходимые технические меры защиты в соответствии с законодательством РФ.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Категории собираемой информации
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.1. Информация, предоставляемая Пользователем:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Учетные данные: имя, электронная почта, пароль, роль (селлер, менеджер, дизайнер).</li>
                  <li suppressHydrationWarning>Данные о товарах: названия, характеристики, артикулы, цены, описания.</li>
                  <li suppressHydrationWarning>Медиа-контент: загружаемые пользователем фотографии товаров, видеофайлы, логотипы брендов и брендбуки.</li>
                  <li suppressHydrationWarning>Связанные данные: ссылки на магазины на маркетплейсах (Wildberries, Ozon и др.), если они предоставляются для анализа.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.2. Автоматически собираемые данные:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>данные о действиях внутри редактора карточек (время генерации, количество попыток, использованные шаблоны);</li>
                  <li suppressHydrationWarning>техническая информация устройства (тип браузера, ОС, IP-адрес);</li>
                  <li suppressHydrationWarning>cookies и данные сессии.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.3. Данные, связанные с ИИ-функциями:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>текстовые промпты (запросы) для генерации описаний;</li>
                  <li suppressHydrationWarning>результаты анализа изображений (данные компьютерного зрения: определение цвета, формы, типа предмета на фото);</li>
                  <li suppressHydrationWarning>сгенерированные Сервисом варианты карточек и текстов.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Цели обработки данных
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Мы обрабатываем данные исключительно для следующих целей:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Предоставление основного функционала: генерация продающих карточек товара, инфографики и видеообложек.</li>
              <li suppressHydrationWarning>Обучение и калибровка ИИ: анализ загруженных фото для улучшения качества удаления фона, цветокоррекции и подбора стилей (на основе обезличенных данных).</li>
              <li suppressHydrationWarning>Персонализация: сохранение истории генераций и избранных стилей оформления.</li>
              <li suppressHydrationWarning>Техническая поддержка: решение проблем с генерацией или экспортом файлов.</li>
              <li suppressHydrationWarning>Безопасность: предотвращение генерации запрещенного контента и защиты от автоматизированных атак (парсинга).</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Особенности обработки данных ИИ-функциями
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь понимает, что загруженные фотографии товаров обрабатываются алгоритмами машинного обучения (включая сторонние модели генерации изображений).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Чувствительные данные: Пользователь обязуется не загружать в Сервис фото документов, банковских карт или лиц людей без их письменного согласия (модельный релиз), если это не является частью стокового контента для карточки товара.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Контент, передаваемый ИИ-моделям, может временно кэшироваться на серверах обработки для ускорения генерации, но не используется для публичной демонстрации без согласия Пользователя.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Сервис внедряет фильтры безопасности. Если ИИ распознает на фото запрещенные предметы (оружие, наркотические вещества, порнографию), генерация будет заблокирована, а аккаунт может быть отправлен на проверку.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Передача данных третьим лицам
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Мы не продаем ваши данные. Передача возможна только техническим партнерам, обеспечивающим работу сервиса:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6 mb-5" suppressHydrationWarning>
              <li suppressHydrationWarning>Провайдеры ИИ-моделей: Обезличенные текстовые запросы и изображения могут передаваться через API партнерам (например, провайдерам LLM или генеративных сетей) исключительно для выполнения задачи генерации.</li>
              <li suppressHydrationWarning>Облачные хранилища: Загруженные вами тяжелые медиафайлы (видео, фото в высоком разрешении) хранятся на защищенных серверах облачных провайдеров.</li>
              <li suppressHydrationWarning>Правовые требования: В случаях, предусмотренных законодательством.</li>
            </ul>
            <div suppressHydrationWarning>
              <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.3</p>
              <p className="text-[15px] leading-6" suppressHydrationWarning>
                Платежные шлюзы: Для обработки оплаты используется сервис ЮKassa (ООО НКО «Яндекс.Деньги»). Оператор не собирает и не хранит данные банковских карт пользователей.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Хранение и защита данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Первоначальный сбор, систематизация и хранение персональных данных пользователей (Email, IP-адрес) осуществляются на серверах, расположенных на территории Российской Федерации (провайдер Timeweb Cloud).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Меры защиты включают:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>шифрование каналов связи (SSL/TLS);</li>
                  <li suppressHydrationWarning>изоляцию пользовательских данных (другие пользователи не видят ваши загруженные исходники);</li>
                  <li suppressHydrationWarning>регулярные бэкапы баз данных.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  При удалении аккаунта Пользователем, все загруженные медиафайлы и сгенерированные проекты удаляются безвозвратно в течение 30 дней.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор обязуется рассмотреть любой запрос об удалении данных в течение 10 рабочих дней с момента получения обращения на почту aiora.help@mail.ru.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Права Пользователя
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Пользователь имеет право:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>выгрузить все сгенерированные материалы (экспорт проектов);</li>
              <li suppressHydrationWarning>удалить свои исходные фотографии с серверов Оператора;</li>
              <li suppressHydrationWarning>запросить полное удаление аккаунта и персональных данных;</li>
              <li suppressHydrationWarning>отозвать согласие на получение маркетинговых рассылок.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Использование файлов Cookies
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Использование Сервиса подразумевает согласие Пользователя на сбор куки-файлов. Пользователь уведомлен об этом через всплывающий баннер при первом посещении сайта.
                </p>
              </div>
              <p className="text-base leading-7 mt-4" suppressHydrationWarning>
                Сервис применяет cookies для:
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                <li suppressHydrationWarning>поддержания авторизации во время работы над проектом;</li>
                <li suppressHydrationWarning>сохранения настроек редактора карточек.</li>
              </ul>
            </div>
          </section>

          {/* Section 9 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              9. Политика в отношении несовершеннолетних
            </h2>
            <p className="text-base leading-7" suppressHydrationWarning>
              Сервис является бизнес-инструментом (B2B/Prosumer) и не предназначен для лиц младше 18 лет. Мы сознательно не собираем данные детей.
            </p>
          </section>

          {/* Section 10 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              10. Изменения Политики
            </h2>
            <p className="text-base leading-7" suppressHydrationWarning>
              Оператор может обновлять Политику по мере добавления новых функций (например, интеграции по API с кабинетом селлера Wildberries). Продолжение использования Сервиса означает согласие с изменениями.
            </p>
          </section>

          {/* Section 11 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              11. Контакты
            </h2>
            <p className="text-base leading-7" suppressHydrationWarning>
              По вопросам приватности и удаления данных обращайтесь в службу поддержки через интерфейс платформы или по электронной почте, указанной на сайте.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
