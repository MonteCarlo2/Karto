import { redirect } from "next/navigation";

/** Старый URL: список уведомлений теперь только во всплывающей панели у колокольчика. */
export default function NotificationsPage() {
  redirect("/");
}
