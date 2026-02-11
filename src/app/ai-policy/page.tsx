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
                Настоящая Политика использования искусственного интеллекта (далее — «Политика») регулирует порядок взаимодействия Пользователей (далее — «Пользователь») с генеративными моделями и ИИ-функциями, встроенными в платформу KARTO (далее — «Сервис»).
              </p>
              <p suppressHydrationWarning>
                Используя функции генерации изображений, видео и текстов, Пользователь подтверждает, что ознакомился с этим документом и принимает изложенные правила, а также осознает ограничения текущих технологий нейросетей.
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
                  ИИ-функции KARTO обеспечивают автоматизированное создание контента для электронной коммерции: генерацию описаний товаров, обработку фотографий (удаление/замена фона), создание инфографики и генерацию видеообложек.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Все результаты, формируемые ИИ, создаются автоматически на основе вероятностных алгоритмов. Они могут содержать фактические неточности, визуальные артефакты или грамматические ошибки.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь понимает, что ИИ является инструментом помощи в оформлении (дизайне) и копирайтинге, но не заменяет проверку характеристик реального товара.
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
              Пользователь может применять ИИ-функции KARTO исключительно для легальной коммерческой деятельности на маркетплейсах, а именно для:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>создания SEO-оптимизированных описаний товаров;</li>
              <li suppressHydrationWarning>генерации визуального контента (фотореалистичных фонов, лайфстайл-сцен);</li>
              <li suppressHydrationWarning>рерайта и улучшения существующих текстов;</li>
              <li suppressHydrationWarning>создания сценариев для рекламных роликов;</li>
              <li suppressHydrationWarning>автоматического перевода контента на другие языки (для трансграничной торговли);</li>
              <li suppressHydrationWarning>генерации инфографики и выделения преимуществ товара.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Запрещённое использование ИИ
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1. Незаконные товары и контент</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено использовать ИИ для генерации контента (текста или изображений), рекламирующего:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>наркотические вещества, оружие, взрывчатку;</li>
                  <li suppressHydrationWarning>поддельные документы или услуги по их изготовлению;</li>
                  <li suppressHydrationWarning>товары, запрещенные к продаже законодательством или правилами маркетплейсов.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2. Нарушение интеллектуальных прав и брендинг</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено использовать ИИ для:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>намеренной генерации логотипов известных мировых брендов на товарах, не имеющих к ним отношения (создание контрафакта);</li>
                  <li suppressHydrationWarning>создания визуальных подделок, имитирующих фирменный стиль конкурентов с целью введения покупателя в заблуждение.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3. Генерация опасного и неэтичного контента</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Запрещено создавать:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>порнографические материалы, изображения обнаженного тела (кроме художественных манекенов/нижнего белья в рамках правил маркетплейсов);</li>
                  <li suppressHydrationWarning>сцены насилия, жестокости, дискриминации;</li>
                  <li suppressHydrationWarning>дипфейки (Deepfakes) реальных людей (политиков, знаменитостей) без их согласия для рекламы товаров.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.4. Манипуляция и дезинформация</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Генерация ложных медицинских утверждений (например, описание БАДа как "лекарства от рака", если это не подтверждено сертификатами);</li>
                  <li suppressHydrationWarning>Создание фейковых отзывов от лица несуществующих покупателей.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.5. Технические злоупотребления</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Попытки "взлома" промптов (Jailbreaking) для обхода фильтров безопасности генерации изображений.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Ответственность Пользователя
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Пользователь соглашается:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Проверять факты: ИИ может написать, что футболка сделана из "100% шелка", хотя вы продаете синтетику. Ответственность за соответствие описания реальному товару лежит на Пользователе.</li>
              <li suppressHydrationWarning>Проверять визуал: ИИ может сгенерировать лишние пальцы на руках моделей или нечитаемый текст на фоне. Пользователь обязан осмотреть изображение перед публикацией.</li>
              <li suppressHydrationWarning>Соблюдать правила площадок: Если сгенерированный контент нарушает правила Wildberries или Ozon (например, запрещенные стоп-слова), ответственность за штрафы несет Пользователь.</li>
            </ul>
            <p className="mt-4 text-[15px] leading-6 font-semibold text-gray-900" suppressHydrationWarning>
              Выводы, решения и действия по публикации контента полностью лежат на Пользователе.
            </p>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Блокировка и ограничение доступа
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Сервис оставляет за собой право ограничить работу ИИ-функций в следующих случаях:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>систематические попытки сгенерировать запрещенный контент (NSFW, насилие);</li>
              <li suppressHydrationWarning>использование автоматизированных скриптов для массовой генерации (нагрузка на GPU);</li>
              <li suppressHydrationWarning>жалобы правообладателей на сгенерированный контент.</li>
            </ul>
            <p className="mt-4 text-base leading-7" suppressHydrationWarning>
              Меры могут включать временную блокировку функции генерации или полную блокировку аккаунта без возврата средств.
            </p>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Обработка данных ИИ-моделями
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  ИИ обрабатывает загруженные фотографии товаров. Мы используем технологии компьютерного зрения (Computer Vision) для анализа изображения.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Важно: Исходные фотографии могут передаваться для обработки на сервера партнеров (провайдеров GPU-мощностей и LLM), обеспечивающих работу генерации. Данные передаются в зашифрованном виде.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  ИИ-модели могут использовать агрегированные данные (например, "какие фоны чаще выбирают для кроссовок") для улучшения качества выдачи, но не используют ваши конкретные фото товаров для прямого обучения, если иное не указано в тарифе.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Ограничения ИИ (Галлюцинации)
            </h2>
            <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
              Пользователь подтверждает понимание того, что:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
              <li suppressHydrationWarning>Текстовые галлюцинации: ИИ может выдумать характеристики товара, которых нет.</li>
              <li suppressHydrationWarning>Визуальные галлюцинации: ИИ может исказить пропорции предмета, добавить артефакты, изменить цвет товара при обработке (цветокоррекция).</li>
              <li suppressHydrationWarning>Контекст: ИИ не видит ваш физический товар, он работает только с загруженным фото и вашим описанием.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Интеллектуальные права на контент, созданный ИИ
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Платформа KARTO передает Пользователю все имущественные права на сгенерированный контент (тексты и изображения), позволяя использовать их в коммерческих целях (продажа товаров).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь признает, что законодательство в области авторского права на произведения, созданные ИИ, находится в стадии формирования, и Платформа не может гарантировать эксклюзивную защиту таких произведений от копирования третьими лицами.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь гарантирует, что исходные материалы (фото товаров), загружаемые для обработки ИИ, не нарушают авторских прав третьих лиц.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              9. Изменения Политики
            </h2>
            <p className="text-base leading-7" suppressHydrationWarning>
              Компания вправе вносить изменения в настоящую Политику по мере развития технологий генеративного ИИ (например, при внедрении генерации видео со звуком). Обновления вступают в силу с момента публикации.
            </p>
          </section>

          {/* Section 10 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              10. Контакты
            </h2>
            <p className="text-base leading-7" suppressHydrationWarning>
              Если вы столкнулись с некорректной работой ИИ или нарушением этических норм генерации, обратитесь в службу поддержки через интерфейс платформы.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
