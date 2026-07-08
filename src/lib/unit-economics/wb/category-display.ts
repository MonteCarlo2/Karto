const WB_NOISY_CATEGORY_PREFIXES = [
  "Автоаксессуары и дополнительное оборудование",
  "Хозяйственные товары",
  "Автозапчасти",
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
  return clean || name.trim();
}
