/**
 * Утилиты для форматирования описаний под требования маркетплейсов
 */

// Стоп-слова (запрещенные слова)
const STOP_WORDS = {
  // Статус товара
  status: [
    'оригинал', 'original', 'подлинный',
    'копия', 'реплика', 'аналог', 'клон', 'copy', 'подделка',
    '1:1', 'точь-в-точь', 'как оригинал', 'качество ааа', 'качество аaa',
  ],
  // Маркетинг/Цены
  marketing: [
    'скидка', 'распродажа', 'акция', 'розыгрыш', 'кешбэк',
    'лучший', 'топ',
  ],
  // Контакты (частичные совпадения)
  contacts: [
    'http://', 'https://', 'www.', '.ru', '.com',
    'телефон', 'тел:', 'тел.', 'звоните',
    'instagram', 'vk.com', 'telegram', 'whatsapp',
  ],
};

/**
 * Проверка текста на стоп-слова
 * Возвращает массив найденных проблемных слов с их позициями
 */
export function checkStopWords(text: string): Array<{ word: string; category: string; index: number }> {
  const issues: Array<{ word: string; category: string; index: number }> = [];
  const lowerText = text.toLowerCase();
  
  // Проверяем каждую категорию стоп-слов
  Object.entries(STOP_WORDS).forEach(([category, words]) => {
    words.forEach(word => {
      const lowerWord = word.toLowerCase();
      let index = lowerText.indexOf(lowerWord);
      
      while (index !== -1) {
        // Проверяем, что это отдельное слово (не часть другого слова)
        const before = index > 0 ? lowerText[index - 1] : ' ';
        const after = index + lowerWord.length < lowerText.length 
          ? lowerText[index + lowerWord.length] 
          : ' ';
        
        // Если перед и после слова не буквы/цифры - это отдельное слово
        const isWordChar = (char: string) => /[a-z0-9а-яё]/i.test(char);
        if (!isWordChar(before) && !isWordChar(after)) {
          issues.push({
            word: text.substring(index, index + word.length),
            category,
            index,
          });
        }
        
        // Ищем следующее вхождение
        index = lowerText.indexOf(lowerWord, index + 1);
      }
    });
  });
  
  return issues;
}

/**
 * Форматирование текста для копирования (Plain Text)
 * Сохраняет абзацы и преобразует markdown-заголовки/списки в читабельный вид
 */
export function formatForCopy(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#+\s*(.+)$/);

    // Заголовки вида "## Текст"
    if (headingMatch && headingMatch[1]) {
      const clean = headingMatch[1].trim();
      if (clean) {
        result.push(clean.toUpperCase());
        result.push(''); // пустая строка после заголовка
      }
      return;
    }

    // Списки - используем простые символы для Ozon
    if (/^[-•→\d]/.test(trimmed)) {
      const item = trimmed.replace(/^[-•→\d.\s]+/, '').trim();
      if (item) result.push(`• ${item}`);
      return;
    }

    // Обычные строки
    if (trimmed) {
      result.push(trimmed);
    } else {
      // Пустая строка: сохраняем одинарный отступ между блоками
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
    }
  });

  // Убираем пустые строки в конце
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  return result.join('\n');
}

/**
 * Подсветка проблемных слов в тексте
 */
export function highlightStopWords(
  text: string, 
  issues: Array<{ word: string; category: string; index: number }>
): string {
  if (issues.length === 0) return text;
  
  // Сортируем по индексу в обратном порядке, чтобы заменять с конца
  const sortedIssues = [...issues].sort((a, b) => b.index - a.index);
  
  let result = text;
  
  sortedIssues.forEach(issue => {
    const before = result.substring(0, issue.index);
    const word = result.substring(issue.index, issue.index + issue.word.length);
    const after = result.substring(issue.index + issue.word.length);
    
    // Подсвечиваем проблемное слово
    result = `${before}<mark style="background: #fee; color: #c00; padding: 2px 4px; border-radius: 3px; border-bottom: 2px solid #c00;">${word}</mark>${after}`;
  });
  
  return result;
}

/**
 * Получение сообщения о проблеме по категории
 */
export function getStopWordMessage(category: string): string {
  const messages: Record<string, string> = {
    status: 'Уберите это слово. Маркетплейсы могут заблокировать карточку за упоминание статуса товара (оригинал/копия).',
    marketing: 'Уберите это слово. Маркетплейсы могут заблокировать карточку за упоминание скидок/акций в описании.',
    contacts: 'Уберите контактные данные. Маркетплейсы запрещают ссылки и телефоны в описаниях.',
  };
  
  return messages[category] || 'Это слово может вызвать проблемы на маркетплейсах.';
}
