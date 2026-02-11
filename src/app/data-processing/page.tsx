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
          Политика по обработке данных пользователей KARTO
        </h1>

        {/* Sub-information */}
        <div className="flex items-center justify-between mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>
            Предварительная версия для периода тестирования платформы
          </p>
          <span className="text-gray-400 mx-2">•</span>
          <p suppressHydrationWarning>
            Дата обновления: 2026
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
                Настоящая Политика по обработке данных пользователей (далее — «Политика») устанавливает порядок, цели, методы и условия обработки данных Пользователей и их товарного контента (далее — «Данные»), поступающих в адрес платформы KARTO (далее — «Компания», «Сервис»).
              </p>
              <p suppressHydrationWarning>
                Политика действует в дополнение к Политике конфиденциальности, Условиям использования и Политике использования ИИ.
              </p>
            </div>
          </section>

          {/* Section 1 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              1. Термины и определения
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Обработка данных — любое действие с данными Пользователя: сбор, запись, хранение, структурирование, передача на сервера генерации, удаление, обезличивание.</li>
              <li suppressHydrationWarning>Товарные данные — информация о товарах Пользователя (фотографии, видео, описания, характеристики, артикулы, цены), загружаемая для создания карточек.</li>
              <li suppressHydrationWarning>Исходные материалы — «сырые» медиафайлы (RAW-фото, видеофрагменты), загружаемые Пользователем для обработки.</li>
              <li suppressHydrationWarning>ИИ-обработка — автоматизированный анализ изображений (Computer Vision), генерация текста (LLM) и синтез медиа (Diffusion models).</li>
              <li suppressHydrationWarning>Рендеринг — процесс создания финального изображения или видео из исходных материалов с применением вычислительных мощностей.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Цели обработки данных
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Компания обрабатывает данные Пользователя для следующих целей:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>обеспечение работы редактора карточек и инструментов генерации;</li>
              <li suppressHydrationWarning>визуальный анализ товаров: автоматическое определение цвета, формы и категории товара по фото;</li>
              <li suppressHydrationWarning>предоставление доступа к генеративным ИИ-функциям (удаление фона, создание инфографики);</li>
              <li suppressHydrationWarning>оптимизация алгоритмов генерации (улучшение качества масок обтравки, цветокоррекции);</li>
              <li suppressHydrationWarning>техническое хранение проектов Пользователя (хостинг изображений и видео);</li>
              <li suppressHydrationWarning>выполнение обязательств перед Пользователем (экспорт готовых материалов);</li>
              <li suppressHydrationWarning>поддержка безопасности и предотвращение загрузки запрещенного контента.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Категории обрабатываемых данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1. Персональные данные</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>электронная почта (логин);</li>
                  <li suppressHydrationWarning>данные аккаунта (роль: селлер, дизайнер, менеджер);</li>
                  <li suppressHydrationWarning>история оплат и статус подписки;</li>
                  <li suppressHydrationWarning>настройки интерфейса (выбранные маркетплейсы, язык).</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2. Товарный контент (Специфика KARTO)</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>загруженные фотографии товаров (включая метаданные файлов EXIF);</li>
                  <li suppressHydrationWarning>видеофайлы и аудиодорожки;</li>
                  <li suppressHydrationWarning>текстовые характеристики (состав, габариты, бренд);</li>
                  <li suppressHydrationWarning>логотипы и элементы фирменного стиля (брендбуки).</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3. Технические данные</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>данные браузера, IP-адрес, тип устройства;</li>
                  <li suppressHydrationWarning>телеметрия редактора (время, затраченное на создание карточки, используемые инструменты);</li>
                  <li suppressHydrationWarning>логи ошибок генерации (сбои GPU, ошибки API).</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.4. Системные данные ИИ</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>текстовые промпты (запросы на генерацию);</li>
                  <li suppressHydrationWarning>маски изображений (какую область фото изменить);</li>
                  <li suppressHydrationWarning>сгенерированные черновики и финальные варианты.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Правовые основания обработки данных
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Данные обрабатываются на основании:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>согласия Пользователя (регистрация, загрузка файлов);</li>
              <li suppressHydrationWarning>исполнения договора (предоставление услуги генерации контента);</li>
              <li suppressHydrationWarning>законных интересов Компании (защита от парсинга, улучшение продукта);</li>
              <li suppressHydrationWarning>выполнения требований закона (хранение финансовых документов).</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Способы обработки данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1. Автоматизированная обработка (основной метод)</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Анализ изображений нейросетями (детектирование объектов, сегментация);</li>
                  <li suppressHydrationWarning>Векторизация текста для поиска релевантных описаний;</li>
                  <li suppressHydrationWarning>Автоматическая фильтрация запрещенного контента (NSFW-фильтры);</li>
                  <li suppressHydrationWarning>Распределенный рендеринг на GPU-кластерах.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2. Неавтоматизированная обработка</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Выборочная проверка качества генерации специалистами QA (на обезличенных данных) для настройки моделей;</li>
                  <li suppressHydrationWarning>Обработка обращений в поддержку (доступ к конкретному проекту по запросу Пользователя).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Передача данных третьим лицам
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Для обеспечения работы "тяжелых" генеративных функций Компания может передавать данные:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Облачным провайдерам хранилищ (S3): для хранения больших массивов фото и видео.</li>
              <li suppressHydrationWarning>Провайдерам GPU-мощностей: зашифрованные исходные файлы передаются на сервера рендеринга для выполнения генерации.</li>
              <li suppressHydrationWarning>Партнерам по ИИ (API): обезличенные запросы передаются провайдерам LLM для генерации текстов.</li>
            </ul>
            <p className="mt-4 text-[15px] leading-6" suppressHydrationWarning>
              Мы гарантируем, что передаются только данные, технически необходимые для выполнения конкретной операции (например, генерации картинки).
            </p>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Условия хранения данных
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Товарный контент (фото/видео) хранится в течение всего срока действия активной подписки Пользователя.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Политика "Холодного хранения": Если аккаунт неактивен более 6 месяцев (нет входов и оплат), Компания вправе архивировать или удалить тяжелые медиафайлы (исходники видео) для оптимизации ресурсов, предварительно уведомив Пользователя.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.3</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  При удалении аккаунта:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Персональные данные удаляются немедленно.</li>
                  <li suppressHydrationWarning>Медиафайлы удаляются с серверов хранения в течение 30 дней (техническая задержка на удаление из бэкапов).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Меры защиты данных
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Компания применяет:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Изоляцию проектов: файлы одного Пользователя технически недоступны другим Пользователям;</li>
              <li suppressHydrationWarning>Шифрование данных при передаче (TLS 1.3) и хранении (AES-256);</li>
              <li suppressHydrationWarning>Защиту от Hotlinking (прямых ссылок на ваши изображения с чужих ресурсов);</li>
              <li suppressHydrationWarning>Регулярные бэкапы баз данных товарных матриц.</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              9. Обработка чувствительных и запрещённых данных
            </h2>
            <p className="mb-3 text-[15px] leading-6" suppressHydrationWarning>
              Сервис предназначен исключительно для товарного контента.
            </p>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Запрещено загружать и обрабатывать:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>фотографии документов (паспорта, права, банковские карты);</li>
              <li suppressHydrationWarning>медицинские снимки или биометрию;</li>
              <li suppressHydrationWarning>личные фото третьих лиц без их согласия (кроме профессиональных моделей);</li>
              <li suppressHydrationWarning>коммерческую тайну, не предназначенную для публичного размещения на маркетплейсах.</li>
            </ul>
            <p className="mt-4 text-[15px] leading-6" suppressHydrationWarning>
              Если Пользователь загружает такие данные, он делает это на свой страх и риск. Алгоритмы ИИ могут непреднамеренно обработать их как обычное изображение.
            </p>
          </section>

          {/* Section 10 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              10. Взаимодействие с ИИ-моделями
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Загруженные фото преобразуются в математические векторы (эмбеддинги) для обработки.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Мы не используем ваши товарные фото для обучения открытых публичных моделей (Foundation Models), которые могут воспроизвести ваш товар для конкурентов.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Данные могут использоваться для дообучения (Fine-tuning) внутренних узкоспециализированных инструментов (например, "инструмент удаления вешалки с одежды"), но только в агрегированном виде.
                </p>
              </div>
            </div>
          </section>

          {/* Section 11 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              11. Права Пользователя
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Пользователь имеет право:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Экспортировать все свои проекты (карточки, тексты) в универсальных форматах (JPG, PNG, CSV);</li>
              <li suppressHydrationWarning>Требовать полного удаления своих исходных материалов с серверов обучения;</li>
              <li suppressHydrationWarning>Запросить лог действий с аккаунтом.</li>
            </ul>
          </section>

          {/* Section 12 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              12. Удаление и архивирование
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>12.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь может удалить отдельные проекты или весь аккаунт через настройки.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>12.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  После удаления аккаунта ссылка на сгенерированные изображения перестанет работать. Пользователь обязан скачать контент до удаления.
                </p>
              </div>
            </div>
          </section>

          {/* Section 13 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              13. Изменения Политики
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              Компания может обновлять Политику, особенно при внедрении новых типов генерации (например, 3D-моделей или AR). Актуальная версия всегда доступна на сайте.
            </p>
          </section>

          {/* Section 14 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              14. Контактная информация
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              По вопросам безопасности данных и управления контентом пишите на email службы поддержки или через чат на платформе.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
