/**
 * Куда привести человека внутри «Заказов и логистики», чтобы он увидел, откуда взялась цифра совета:
 * вкладка раздела (sub) и блок на ней (anchor). Лежит в памяти страницы: после обновления сбрасывается.
 */
export type EvidenceFocus = { sub: "speed" | "cost"; anchor: string };

let pending: EvidenceFocus | null = null;

export function setEvidenceFocus(focus: EvidenceFocus): void {
  pending = focus;
}

export function peekEvidenceFocus(sub: EvidenceFocus["sub"]): EvidenceFocus | null {
  return pending && pending.sub === sub ? pending : null;
}

export function clearEvidenceFocus(): void {
  pending = null;
}

/** Докручивает до блока и подсвечивает его зелёным кольцом. Ждёт, пока блок появится на странице. */
export function revealEvidence(anchor: string): () => void {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const el = document.querySelector<HTMLElement>(`[data-evidence="${anchor}"]`);
    if (!el) {
      if (tries > 40) clearInterval(timer);
      return;
    }
    clearInterval(timer);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("hub-task-flash");
    setTimeout(() => el.classList.remove("hub-task-flash"), 2200);
  }, 120);
  return () => clearInterval(timer);
}
