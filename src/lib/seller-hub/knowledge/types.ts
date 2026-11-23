/** База знаний Seller Hub: две ветки. «karto» — как пользоваться сервисом, «wb» — Wildberries простым языком. */
export type KbBranch = "karto" | "wb";

export type KbCategory = {
  id: string;
  branch: KbBranch;
  title: string;
  hint: string;
  /** Имя значка из lucide-react (подбирается в интерфейсе). */
  icon: string;
};

/**
 * Тело статьи — простая разметка, чтобы статьи было удобно писать и проверять глазами:
 * «## Заголовок», «- пункт», «1. шаг», «> Совет: …», «> Важно: …», «> Осторожно: …», пустая строка между абзацами.
 */
export type KbArticle = {
  id: string;
  branch: KbBranch;
  category: string;
  title: string;
  /** Одно-два предложения: о чём статья. Показывается в списке и в результатах поиска. */
  summary: string;
  body: string;
  /** Слова, по которым человек может искать, но которых нет в тексте (как говорят продавцы). */
  keywords?: string[];
  /** Связанные статьи. */
  related?: string[];
  /** Для статей про WB: страница официальной справки, на которую опираемся. */
  source?: string;
};
