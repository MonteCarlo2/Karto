"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PaymentsPolicyPage() {
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
          Политика платежей и подписок KARTO
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
                Настоящая Политика платежей и подписок (далее — «Политика») регулирует порядок оплаты услуг, использования подписок, списания кредитов (лимитов) и проведения финансовых операций на SaaS-платформе KARTO (далее — «Сервис»).
              </p>
              <p suppressHydrationWarning>
                Данная Политика действует в дополнение к Условиям использования. Используя платные функции Сервиса (генерацию карточек, скачивание архивов, покупку дополнительных пакетов), Пользователь принимает условия, изложенные ниже.
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
                  Платформа предлагает ограниченный бесплатный функционал и расширенные платные возможности, предоставляемые по системе подписки или разовой покупки пакетов генераций.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Стоимость подписок, объемы пакетов и условия тарификации могут обновляться администрацией.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оплата осуществляется через защищенные шлюзы сторонних платёжных операторов. Сервис не обрабатывает ваши платежные данные напрямую.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Типы платных услуг и валюта Сервиса
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.1. Подписки (Recurrent)</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Платформа предоставляет доступ к тарифам с автоматическим продлением:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Start/Pro: Ежемесячная подписка с фиксированным лимитом генераций (карточек/видео) и приоритетной скоростью обработки.</li>
                  <li suppressHydrationWarning>Годовая подписка: Предоставляется со скидкой, оплачивается единовременным платежом.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.2. Кредиты и Пакеты (Top-ups)</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Учитывая ресурсоемкость генерации видео и фото, Сервис может использовать систему внутренних единиц («Кредиты» / «Генерации»):
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Кредиты расходуются на создание контента (например, 1 фото = 1 кредит, 1 видео = 10 кредитов).</li>
                  <li suppressHydrationWarning>Пользователь может докупить пакеты кредитов сверх лимита подписки разовым платежом.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.3. Дополнительные опции</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Покупка места в облачном хранилище для исходников.</li>
                  <li suppressHydrationWarning>Выкуп прав на эксклюзивные шаблоны или индивидуальное обучение модели (Enterprise).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Платёжные операторы
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Прием платежей осуществляется через сертифицированных провайдеров (например: CloudPayments, ЮKassa, Tinkoff Kassa, Stripe или аналогов).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор несет ответственность за безопасность транзакции по стандарту PCI DSS.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO не хранит полные номера банковских карт и CVC/CVV-коды. Мы храним только зашифрованные токены (идентификаторы) для обеспечения рекуррентных списаний.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Автоматическое продление (Автоплатеж)
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оформляя подписку, Пользователь соглашается на безакцептное списание средств (рекуррентный платеж) за следующий период обслуживания.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Списание происходит за 24 часа до или в день окончания текущего оплаченного периода.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Если на карте недостаточно средств, система может предпринимать повторные попытки списания в течение нескольких дней. Доступ к платным функциям (генерации без водяных знаков) приостанавливается до успешной оплаты.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Отмена подписки
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь может отключить автопродление в любой момент в разделе «Настройки» → «Биллинг» (Billing).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  При отмене подписки доступ к платным функциям сохраняется до конца уже оплаченного срока.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Неиспользованные генерации (кредиты), входящие в ежемесячный пакет, могут сгорать в конце расчетного периода, если условия тарифа не предусматривают их перенос (Rollover).
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Возвраты и качество генерации (Важно)
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1. Специфика ИИ-услуг</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Пользователь понимает, что услуга считается оказанной в момент завершения генерации изображения или видео нейросетью, независимо от того, понравился ли пользователю результат эстетически.
                  Затраты вычислительных мощностей (GPU) невозвратны.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2. Условия возврата</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Возврат средств возможен только в случаях:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Технического сбоя биллинга (двойное списание).</li>
                  <li suppressHydrationWarning>Полной неработоспособности Сервиса более 24 часов.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.3. Отказ в возврате</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Возврат не производится, если:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Пользователя не устроило качество креатива («Нейросеть нарисовала некрасиво»).</li>
                  <li suppressHydrationWarning>Пользователь забыл отменить подписку до даты списания.</li>
                  <li suppressHydrationWarning>Аккаунт был заблокирован за нарушение правил (генерация запрещенного контента).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Пробные периоды
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Для новых пользователей может быть доступен Trial-период (например, 3 дня или 10 бесплатных генераций).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>7.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  При активации триала может потребоваться привязка карты. Если подписка не отменена до конца триала, произойдет списание за полный месяц.
                </p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Налогообложение
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Для резидентов РФ стоимость услуг не облагается НДС (в связи с применением УСН или иного спецрежима), если не указано иное в чеке.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>8.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Сервис формирует электронный чек в соответствии с законодательством РФ (54-ФЗ) и отправляет его на email.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              9. Ограничения использования
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Покупка подписки не дает права нарушать Политику использования ИИ (генерировать дипфейки, контрафакт и т.д.).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>9.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  В случае блокировки аккаунта за нарушение правил (например, за абьюз системы через мультиаккаунты), остаток средств и кредитов аннулируется без возмещения.
                </p>
              </div>
            </div>
          </section>

          {/* Section 10 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              10. Изменения цен
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  KARTO вправе изменять тарифную сетку по мере добавления новых функций.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>10.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Для действующих подписчиков цена не меняется до конца оплаченного периода. О повышении цен на следующий период Пользователь уведомляется по email или в интерфейсе.
                </p>
              </div>
            </div>
          </section>

          {/* Section 11 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              11. Безопасность
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>11.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Все платежные страницы защищены протоколом SSL/TLS.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>11.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Сервис применяет автоматические системы анти-фрода для предотвращения использования краденых карт.
                </p>
              </div>
            </div>
          </section>

          {/* Section 12 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              12. Контакты по вопросам платежей
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              По вопросам списаний, закрывающих документов (для юрлиц) и возвратов пишите на: support@karto.ru (или актуальный email).
            </p>
          </section>

          {/* Section 13 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              13. Реквизиты
            </h2>
            <div className="space-y-2 text-[15px] leading-6" suppressHydrationWarning>
              <p suppressHydrationWarning>Индивидуальный предприниматель: Симонян Эрик Каренович</p>
              <p suppressHydrationWarning>ИНН: 231142064831</p>
              <p suppressHydrationWarning>Юридический статус: Действующий</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
