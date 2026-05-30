export function formatInboxReviewDates(iso?: string): {
  timeLabel: string;
  dateLabel: string;
  listDateLabel: string;
} {
  if (!iso) {
    return { timeLabel: "—", dateLabel: "—", listDateLabel: "—" };
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { timeLabel: "—", dateLabel: "—", listDateLabel: "—" };
  }
  return {
    timeLabel: new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    dateLabel: new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    listDateLabel: new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
  };
}
