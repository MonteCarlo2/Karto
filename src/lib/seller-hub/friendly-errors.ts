/**
 * Ошибки Wildberries и сети человеческим языком. Сырые тексты вроде «advertChangeStatusViaGRPC: Not Found: advert not found» человеку не показываем:
 * они ничего не объясняют. Наши собственные русские сообщения (без служебных слов) остаются как есть.
 */

const TECHNICAL = /grpc|via[A-Z]|exception|stack|undefined|\bnull\b|[{}]|\bat \w+\.|[a-z]+[A-Z][a-z]+[A-Z]|<!doctype|<html/i;

export function friendlyWbError(raw: unknown): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Wildberries не принял изменение. Попробуйте ещё раз или сделайте это на сайте.";
  const low = text.toLowerCase();
  if (/advert not found|campaign not found|кампани\S* не найден/.test(low)) return "Кампания не найдена в кабинете: возможно, она удалена или принадлежит другому магазину.";
  if (/not found|404/.test(low) && !/[а-я]/i.test(text)) return "Wildberries не нашёл этот объект. Обновите данные и повторите.";
  if (/insufficient|not enough|недостаточно|balance|баланс/.test(low) && !TECHNICAL.test(text)) return "На счёте продвижения не хватает денег. Пополните его и повторите.";
  if (/too many|429|rate limit|слишком много/.test(low)) return "Wildberries просит подождать: слишком много запросов. Повторите через минуту.";
  if (/unauthori[sz]ed|forbidden|401|403|token|токен|доступ/.test(low) && !/[а-я]{5,}/i.test(text)) return "Wildberries не принял токен или у него нет нужных прав. Проверьте токен и доступы в разделе «Кабинет и API».";
  if (/timeout|timed out|fetch failed|econn|enotfound|network|socket|abort/.test(low) && !/[а-я]{5,}/i.test(text)) return "Нет связи с Wildberries. Повторите через минуту.";
  if (/\b5\d\d\b|internal|unavailable|bad gateway/.test(low) && !/[а-я]{5,}/i.test(text)) return "Сервис Wildberries сейчас недоступен. Попробуйте позже.";
  if (/status.*(already|уже)|already|уже в этом/.test(low) && !TECHNICAL.test(text)) return "Кампания уже в таком состоянии: менять нечего.";
  if (TECHNICAL.test(text) || !/[а-я]/i.test(text)) return "Wildberries не принял изменение. Попробуйте ещё раз или сделайте это на сайте.";
  return text.slice(0, 300);
}
