"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function TermsPage() {
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
          Условия использования KARTO
        </h1>

        {/* Sub-information */}
        <div className="flex items-center justify-between mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>
            Предварительная версия для периода тестирования платформы KARTO
          </p>
          <span className="text-gray-400 mx-2">•</span>
          <p suppressHydrationWarning>
            Дата вступления в силу: 2026
          </p>
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
                  Настоящие Условия использования (далее — «Условия») регулируют порядок доступа и использования платформы KARTO, включая веб-приложение, инструменты для создания и оптимизации товарных карточек, функции генерации продающих текстов, инфографики, изображений, видеороликов и иные инструменты искусственного интеллекта (далее — «Сервис»).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользуясь Сервисом, вы соглашаетесь с настоящими Условиями. Вы подтверждаете, что будете использовать полученный контент в соответствии с правилами площадок (маркетплейсов), на которых планируете его размещать. Если вы не согласны — использование Сервиса запрещено.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO предоставляет доступ к экспериментальному функционалу генерации медиа и текста. Алгоритмы находятся в стадии обучения: функции могут изменяться, дополняться или временно отключаться без предварительного уведомления.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Условия действуют независимо от того, используете ли вы Сервис в рамках бесплатного пробного периода или платной подписки.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.5</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оплата пакетов генераций является акцептом (принятием) настоящего договора.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Назначение и характер Сервиса
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO предоставляет пользователю доступ к AI-инструментам для автоматизации создания контента (SEO-описания, обработка фото, генерация видео) с целью оформления товарных позиций в электронной коммерции.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Результаты генерации (описания, характеристики, визуальные элементы) являются рекомендательными. Модели ИИ могут допускать фактические ошибки в характеристиках товара, вымышлять несуществующие свойства или создавать визуальные артефакты. Пользователь обязан проверять итоговый контент перед публикацией на маркетплейсе.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.3</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Сервис не гарантирует:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>прохождение модерации на сторонних площадках (Wildberries, Ozon, Яндекс.Маркет и др.);</li>
                  <li suppressHydrationWarning>попадание карточки в топ выдачи или определенный уровень продаж;</li>
                  <li suppressHydrationWarning>юридическую чистоту сгенерированных изображений (отсутствие сходства с чужими товарными знаками).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Регистрация и использование аккаунта
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь несёт полную ответственность за сохранность данных своей учётной записи и за все действия, совершенные под ней (включая загрузку товаров и генерацию контента).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>передавать доступ к аккаунту третьим лицам;</li>
                  <li suppressHydrationWarning>использовать автоматизированные скрипты для массовой генерации (парсинга) контента без согласования;</li>
                  <li suppressHydrationWarning>создавать мультиаккаунты для обхода лимитов бесплатных генераций.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO вправе ограничить генерацию или заблокировать доступ при обнаружении подозрительной активности (например, генерация запрещенных товаров) или нарушении Условий.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Допустимое и запрещённое использование
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1. Запрещённые запросы и контент</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь обязуется не использовать KARTO для создания карточек товаров и контента, связанных с:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>продажей нелегальных товаров, оружия, наркотических веществ;</li>
                  <li suppressHydrationWarning>порнографическими материалами или контентом 18+ (если это нарушает правила целевого маркетплейса);</li>
                  <li suppressHydrationWarning>подделкой брендов (генерация логотипов известных марок на товарах-репликах);</li>
                  <li suppressHydrationWarning>введением покупателей в заблуждение (создание описаний несуществующих функций товара);</li>
                  <li suppressHydrationWarning>разжиганием ненависти или дискриминации;</li>
                  <li suppressHydrationWarning>нарушением авторских прав третьих лиц (загрузка чужих фото для переработки без прав на них).</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2. Неправомерное поведение</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>использовать сгенерированный контент для мошеннических схем;</li>
                  <li suppressHydrationWarning>пытаться манипулировать алгоритмами генерации (prompt injection) для обхода фильтров безопасности;</li>
                  <li suppressHydrationWarning>использовать Сервис для создания фейковых отзывов или накрутки рейтингов.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Контент пользователя и интеллектуальная собственность
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь сохраняет права на свои исходные материалы (загруженные фотографии товаров, видео, логотипы).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь предоставляет KARTO ограниченную лицензию на обработку загруженных материалов (фото/видео) исключительно для:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>выполнения функции генерации (создания инфографики, видеообложек);</li>
                  <li suppressHydrationWarning>обучения внутренних моделей (для улучшения качества визуализации товаров);</li>
                  <li suppressHydrationWarning>технического анализа ошибок генерации.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Контент, сгенерированный Сервисом (итоговые карточки, тексты), может использоваться пользователем в коммерческих целях (продажа товаров), за исключением случаев, когда исходные материалы нарушали чьи-либо права.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO не гарантирует уникальность текстовых описаний или сгенерированных фоновых изображений (схожие описания могут быть сгенерированы для других пользователей с аналогичным товаром).
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Данные и конфиденциальность
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Сервис собирает технические данные: история генераций, загруженные изображения товаров, IP-адреса, логи ошибок.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Мы можем анализировать ваши запросы (названия товаров, промпты) для улучшения качества работы нейросетей и адаптации стилей под конкретные категории товаров.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Личные данные обрабатываются согласно Политике конфиденциальности. Мы не передаем ваши исходные фото товаров третьим лицам для использования в их карточках.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Обработка и хранение персональных данных пользователей (Email, IP-адрес) осуществляется на серверах, расположенных на территории Российской Федерации. Персональные данные не передаются за пределы РФ (отсутствие трансграничной передачи).
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Ограничение ответственности
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Сервис предоставляется «как есть» (AS IS). Качество генерации видео и фото напрямую зависит от качества исходных материалов пользователя.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.2</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  KARTO не несёт ответственности за:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>блокировку карточки товара или личного кабинета селлера на маркетплейсах;</li>
                  <li suppressHydrationWarning>штрафы со стороны маркетплейсов за несоответствие контента их правилам;</li>
                  <li suppressHydrationWarning>нарушение авторских прав, возникшее вследствие использования пользователем чужих исходников;</li>
                  <li suppressHydrationWarning>финансовые убытки пользователя (отсутствие продаж, затраты на рекламу).</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь самостоятельно несет ответственность за проверку фактической информации (размеры, состав, комплектация) в сгенерированном тексте перед публикацией.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.4</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Услуга считается оказанной в полном объеме в момент завершения технического процесса генерации контента (текста или изображения) в интерфейсе Сервиса. Возврат денежных средств за уже сгенерированные единицы контента не производится.
                </p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Удаление аккаунта и прекращение доступа
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь может удалить аккаунт и все связанные с ним данные (историю генераций, загруженные фото) через интерфейс или запрос в поддержку.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO оставляет за собой право удалить аккаунт без возврата средств (при наличии подписки) в случае грубого нарушения правил (например, генерация запрещенного законодательством контента).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Приобретенные пакеты «Потоков» и генераций в Мастерской имеют ограниченный срок действия — 30 (тридцать) календарных дней с момента оплаты. По истечении этого срока неиспользованные остатки аннулируются без возврата средств.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              9. Изменения условий
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Условия могут обновляться по мере добавления новых функций (например, автопостинга на маркетплейсы).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Продолжая использовать KARTO после обновлений, вы принимаете новые правила.
                </p>
              </div>
            </div>
          </section>

          {/* Section 10 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              10. Юридический статус и контакты
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Исполнителем является самозанятый Симонян Эрик Каренович, ИНН 231142064831.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Все претензии и обращения направляются на электронную почту: aiora.help@mail.ru. Срок ответа на запросы пользователей составляет 10 рабочих дней.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
