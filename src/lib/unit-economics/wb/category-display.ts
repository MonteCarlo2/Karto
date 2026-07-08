const WB_NOISY_CATEGORY_PREFIXES = [
  "Автоаксессуары и дополнительное оборудование",
  "Ноутбуки и компьютеры",
  "Хозяйственные товары",
  "Автозапчасти",
  "Компьютеры",
  "Аксессуары",
];

export function formatWbCategoryDisplayName(name: string): string {
  let clean = name.replace(/\s+/g, " ").trim();
  for (const prefix of WB_NOISY_CATEGORY_PREFIXES) {
    if (clean.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
      clean = clean.slice(prefix.length).trim();
      break;
    }
  }
  clean = clean.replace(/^товар$/i, "").trim();
  if (clean) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean || name.trim();
}
