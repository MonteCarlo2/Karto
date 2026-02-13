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
          Политика платежей и подписок платформы KARTO
        </h1>

        {/* Sub-information */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-16 text-sm text-gray-600 max-w-3xl mx-auto" suppressHydrationWarning>
          <p suppressHydrationWarning>Версия 1.1</p>
          <span className="text-gray-400">•</span>
          <p suppressHydrationWarning>Дата вступления в силу: 13 февраля 2026 года</p>
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
                  Настоящая Политика регулирует порядок оплаты, использования лимитов и возврата средств на платформе KARTO (далее — «Сервис»).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оплата услуг Сервиса является подтверждением того, что Пользователь ознакомлен и согласен с настоящей Политикой и Условиями использования.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>1.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Все расчеты на территории РФ производятся в российских рублях.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              2. Формат предоставления услуг
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.1</p>
                <p className="mb-2 text-[15px] leading-6" suppressHydrationWarning>
                  Сервис предоставляет услуги по двум моделям:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning><strong>Пакетная покупка (Top-ups):</strong> Разовое приобретение определенного количества «Потоков» или генераций в Мастерской.</li>
                  <li suppressHydrationWarning><strong>Подписка (Recurrent):</strong> Периодический доступ к расширенному функционалу с ежемесячным списанием средств.</li>
                </ul>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>2.2. Срок действия лимитов</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Все приобретенные пакеты генераций и «Потоков» активны в течение 30 (тридцати) календарных дней с момента оплаты. По истечении этого срока неиспользованные лимиты аннулируются без возврата средств и возможности переноса на следующий период.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              3. Порядок оплаты и безопасность
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Прием платежей осуществляется через лицензированный российский платежный агрегатор ЮKassa (ООО НКО «Яндекс.Деньги»).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор не хранит и не обрабатывает данные банковских карт пользователей. Безопасность транзакций обеспечивается платежным оператором по стандарту PCI DSS.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>3.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  В соответствии с законом №54-ФЗ, после совершения оплаты на электронную почту Пользователя отправляется кассовый чек, сформированный через сервис Мой Налог.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              4. Автоматическое продление (Для тарифов с подпиской)
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  При оформлении подписки Пользователь соглашается на автоматическое списание средств за следующий период (рекуррентный платеж).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Отключить автопродление можно в любой момент в Личном кабинете Сервиса не позднее чем за 24 часа до даты следующего списания.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>4.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  При отмене подписки оплаченный лимит остается доступным до конца 30-дневного периода, после чего сгорает.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              5. Условия возврата денежных средств
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.1. Специфика цифрового контента</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  В соответствии со ст. 26.1 Закона «О защите прав потребителей» и учитывая специфику ИИ-технологий, услуга считается оказанной в полном объеме в момент успешного завершения генерации (создания изображения или текста) нейросетью по запросу Пользователя.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.2. Затраты на вычисления</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Денежные средства за успешно сгенерированные единицы контента возврату не подлежат, так как на их создание были затрачены невозвратные вычислительные мощности (GPU).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.3</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Возврат возможен только в случае технического сбоя на стороне Сервиса (например, двойное списание), подтвержденного логами системы.
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>5.4. Отказ в возврате производится, если:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-5 text-[15px] leading-6" suppressHydrationWarning>
                  <li suppressHydrationWarning>Результат генерации не соответствует эстетическим ожиданиям Пользователя («некрасиво», «не тот стиль»).</li>
                  <li suppressHydrationWarning>Пользователь не использовал оплаченные лимиты в течение установленного срока (30 дней).</li>
                  <li suppressHydrationWarning>Аккаунт Пользователя заблокирован за нарушение правил (генерация запрещенного контента, мультиаккаунтинг).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              6. Ограничение ответственности
            </h2>
            <div className="space-y-5" suppressHydrationWarning>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.1</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор не несет ответственности за невозможность использования Сервиса по причинам, не зависящим от Оператора (отсутствие интернета у пользователя, блокировка банковской карты).
                </p>
              </div>
              <div suppressHydrationWarning>
                <p className="font-semibold text-gray-900 mb-2" suppressHydrationWarning>6.2</p>
                <p className="text-[15px] leading-6" suppressHydrationWarning>
                  Оператор вправе изменять стоимость услуг, уведомляя об этом пользователей через интерфейс сайта или email.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              7. Контакты по финансовым вопросам
            </h2>
            <p className="text-[15px] leading-6" suppressHydrationWarning>
              Все обращения по вопросам платежей и возвратов принимаются на электронную почту: aiora.help@mail.ru.
            </p>
            <p className="text-[15px] leading-6 mt-2" suppressHydrationWarning>
              Срок рассмотрения заявки — до 10 рабочих дней.
            </p>
          </section>

          {/* Section 8 */}
          <section suppressHydrationWarning>
            <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-playfair), serif' }} suppressHydrationWarning>
              8. Реквизиты
            </h2>
            <div className="space-y-2 text-[15px] leading-6" suppressHydrationWarning>
              <p suppressHydrationWarning>Исполнитель: Самозанятый Симонян Эрик Каренович</p>
              <p suppressHydrationWarning>ИНН: 231142064831</p>
              <p suppressHydrationWarning>Юридический статус: Плательщик налога на профессиональный доход</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
