"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DataProcessingPage() {
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
          Политика по обработке данных пользователей платформы KARTO
        </h1>

        {/* Sub-information */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>Версия 1.1 (Расширенная)</p>
          <span className="text-gray-400">•</span>
          <p suppressHydrationWarning>Дата вступления в силу: 13 февраля 2026 года</p>
          <span className="text-gray-400">•</span>
          <p suppressHydrationWarning>Оператор: Самозанятый Симонян Эрик Каренович, ИНН 231142064831</p>
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
                  Настоящая Политика (далее — «Политика») определяет порядок и условия обработки данных, включая персональные данные и пользовательский контент, на платформе KARTO (далее — «Сервис»).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор ставит своей важнейшей целью соблюдение прав и свобод человека при обработке его персональных данных, в том числе защиты прав на неприкосновенность частной жизни и личную тайну.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Настоящая Политика применяется ко всей информации, которую Оператор может получить о посетителях веб-сайта karto.pro.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Термины и определения
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning><strong>ИИ-алгоритмы:</strong> системы машинного обучения, используемые для сегментации изображений, генерации визуальных эффектов и синтеза текстов.</li>
              <li suppressHydrationWarning><strong>Товарная матрица:</strong> совокупность загруженных Пользователем данных о товарах (фото, описания, цены).</li>
              <li suppressHydrationWarning><strong>Метаданные:</strong> служебная информация, скрытая в файлах (EXIF-данные фото, геометрия объектов).</li>
              <li suppressHydrationWarning><strong>Обезличивание:</strong> действия, в результате которых невозможно без использования дополнительной информации определить принадлежность данных конкретному Пользователю.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Категории и объем обрабатываемых данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1. Персональные данные:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Адрес электронной почты (используется как уникальный идентификатор аккаунта);</li>
                  <li suppressHydrationWarning>Имя или никнейм пользователя;</li>
                  <li suppressHydrationWarning>Данные о платежных транзакциях (номер транзакции, дата, сумма), поступающие от агрегатора ЮKassa.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2. Технические данные:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>IP-адрес, тип браузера, операционная система;</li>
                  <li suppressHydrationWarning>Файлы cookies;</li>
                  <li suppressHydrationWarning>История логов взаимодействия с редактором (время сессии, количество нажатий на функции генерации).</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3. Пользовательский контент:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Исходные фотографии товаров в форматах JPEG, PNG, WEBP и др.;</li>
                  <li suppressHydrationWarning>Текстовые промпты (запросы на генерацию);</li>
                  <li suppressHydrationWarning>Результаты работы ИИ (готовые карточки товаров, SEO-тексты).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Цели обработки данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Предоставление доступа к функционалу генеративного дизайна и автоматизации карточек товаров.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Техническая реализация процесса удаления и замены фона на изображениях с использованием GPU-мощностей.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Улучшение точности работы нейросетей Оператора через анализ ошибок генерации (на основе обезличенных выборок).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Информирование пользователя о статусе готовности генерации или изменениях в тарифах через электронную почту.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.5</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Обеспечение безопасности Сервиса и предотвращение несанкционированного доступа к аккаунтам.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Правовые основания обработки
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Основанием для обработки является согласие Пользователя, выраженное путем регистрации на сайте и принятия условий данной Политики.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор обрабатывает данные только в случае их заполнения и/или отправки Пользователем самостоятельно через формы на сайте.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Порядок сбора, хранения и передачи данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1. Локализация</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  В соответствии с законом №152-ФЗ, сбор и хранение данных граждан РФ осуществляются на территории России (центр обработки данных Timeweb Cloud).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2. Безопасность</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Доступ к данным ограничен. Оператор использует шифрование TLS для передачи данных и AES для хранения критически важной информации.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.3. Передача ИИ-партнерам</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Для генерации контента Оператор может передавать обезличенные данные (текстовые запросы или зашифрованные изображения) провайдерам вычислительных мощностей. При этом персональные данные (email) таким партнерам не передаются.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.4. Сроки</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Данные хранятся в течение срока активности аккаунта. В случае отсутствия активности более 6 месяцев, тяжелые медиафайлы могут быть архивированы.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Права пользователя
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь имеет право в любой момент изменить или удалить свои данные через настройки профиля.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь имеет право запросить у Оператора информацию о том, какие его данные хранятся в системе, направив запрос на aiora.help@mail.ru.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Срок исполнения запроса на удаление данных — не более 10 рабочих дней.
                </p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Удаление данных и отзыв согласия
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь может отозвать согласие на обработку данных, направив письмо на электронную почту Оператора.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  При удалении аккаунта Оператор гарантирует полную очистку серверов от медиафайлов пользователя в течение 30 календарных дней (с учетом времени на очистку резервных копий).
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              9. Заключительные положения
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Настоящая Политика действует бессрочно до замены её новой версией.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор имеет право вносить изменения в Политику без предварительного уведомления. Новая редакция вступает в силу с момента публикации на сайте.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  По всем вопросам, не урегулированным в настоящей Политике, стороны руководствуются действующим законодательством РФ.
                </p>
              </div>
            </div>
          </section>

          {/* Контакты */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              Контакты Оператора
            </h2>
            <div className="text-[15px] leading-6 space-y-1" suppressHydrationWarning>
              <p suppressHydrationWarning>Симонян Эрик Каренович</p>
              <p suppressHydrationWarning>ИНН: 231142064831</p>
              <p suppressHydrationWarning>Email: aiora.help@mail.ru</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
