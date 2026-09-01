import type { PopoverDOM } from "driver.js";

const ARROW_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><path d="M33 11 18 28l15 17" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><path d="M23 11 38 28 23 45" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const CREATIVE_SIDEBAR_SELECTOR = "[data-tour='creative-sidebar']";
export const CREATIVE_INPUT_SELECTOR = "[data-tour='creative-workspace']";

type StyleBackup = {
  node: HTMLElement;
  zIndex: string;
  position: string;
  pointerEvents: string;
  transform: string;
  filter: string;
  opacity: string;
  isolation: string;
  contain: string;
  willChange: string;
};

let styleBackups: StyleBackup[] = [];

function stripNativeButtonChrome(btn: HTMLButtonElement): void {
  btn.style.border = "none";
  btn.style.outline = "none";
  btn.style.boxShadow = "none";
  btn.style.background = "transparent";
  btn.style.padding = "0";
  btn.style.setProperty("appearance", "none");
  btn.style.setProperty("-webkit-appearance", "none");
}

function backup(node: HTMLElement): void {
  if (styleBackups.some((b) => b.node === node)) return;
  styleBackups.push({
    node,
    zIndex: node.style.zIndex,
    position: node.style.position,
    pointerEvents: node.style.pointerEvents,
    transform: node.style.transform,
    filter: node.style.filter,
    opacity: node.style.opacity,
    isolation: node.style.isolation,
    contain: node.style.contain,
    willChange: node.style.willChange,
  });
}

function isFixedOrSticky(el: HTMLElement): boolean {
  const s = window.getComputedStyle(el);
  return s.position === "fixed" || s.position === "sticky";
}

export function clearTourSpot(): void {
  for (const b of styleBackups) {
    b.node.style.zIndex = b.zIndex;
    b.node.style.position = b.position;
    b.node.style.pointerEvents = b.pointerEvents;
    b.node.style.transform = b.transform;
    b.node.style.filter = b.filter;
    b.node.style.opacity = b.opacity;
    b.node.style.isolation = b.isolation;
    b.node.style.contain = b.contain;
    b.node.style.willChange = b.willChange;
    b.node.classList.remove("karto-tour-spot", "karto-tour-lift");
  }
  styleBackups = [];
  document.querySelectorAll(".karto-tour-spot, .karto-tour-lift").forEach((el) => {
    el.classList.remove("karto-tour-spot", "karto-tour-lift");
  });
}

/**
 * Светится только целевой блок: предкам снимаем transform/opacity,
 * чтобы не поднимать всю секцию (заголовок и лишнее).
 * Fixed/sticky предков поднимаем — иначе элемент остаётся под оверлеем.
 */
export function applyTourSpot(el: HTMLElement): void {
  clearTourSpot();
  backup(el);
  el.classList.add("karto-tour-spot");
  if (window.getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }
  el.style.setProperty("z-index", "1000000001", "important");
  el.style.setProperty("opacity", "1", "important");
  el.style.setProperty("transform", "none", "important");
  el.style.pointerEvents = "auto";

  let node = el.parentElement;
  while (node && node !== document.body) {
    backup(node);
    node.style.setProperty("transform", "none", "important");
    node.style.setProperty("filter", "none", "important");
    node.style.setProperty("opacity", "1", "important");
    node.style.setProperty("isolation", "auto", "important");
    node.style.setProperty("contain", "none", "important");
    node.style.setProperty("will-change", "auto", "important");
    if (isFixedOrSticky(node)) {
      node.classList.add("karto-tour-lift");
      node.style.setProperty("z-index", "1000000001", "important");
      node.style.pointerEvents = "none";
    }
    node = node.parentElement;
  }
}

export function renderTourPopover(
  popover: PopoverDOM,
  opts: {
    activeIndex: number;
    totalSteps: number;
    finalCtaLabel: string;
  }
): void {
  const { activeIndex, totalSteps, finalCtaLabel } = opts;
  const isFinal = activeIndex === totalSteps - 1;
  const prevOff = activeIndex === 0 || isFinal;

  popover.wrapper.classList.toggle("karto-spotlight-tour--final", isFinal);
  popover.closeButton.style.display = "none";
  popover.progress.style.display = isFinal ? "none" : "";

  popover.previousButton.innerHTML = ARROW_LEFT;
  popover.previousButton.setAttribute("aria-label", "Назад");
  popover.previousButton.className =
    "driver-popover-prev-btn driver-popover-footer-btn karto-tour-arrow-btn karto-tour-arrow-btn--prev";
  stripNativeButtonChrome(popover.previousButton);
  popover.previousButton.disabled = prevOff;
  popover.previousButton.classList.toggle("driver-popover-btn-disabled", prevOff);
  if (!prevOff) {
    popover.previousButton.removeAttribute("disabled");
  }

  if (isFinal) {
    popover.previousButton.style.display = "none";
    popover.nextButton.textContent = finalCtaLabel;
    popover.nextButton.className = "driver-popover-next-btn karto-tour-cta-btn";
    popover.nextButton.setAttribute("aria-label", finalCtaLabel);
    popover.nextButton.style.appearance = "none";
    popover.nextButton.style.background = "";
    popover.nextButton.style.border = "";
    popover.nextButton.style.boxShadow = "";
  } else {
    popover.previousButton.style.display = prevOff ? "none" : "";
    popover.nextButton.innerHTML = ARROW_RIGHT;
    popover.nextButton.className =
      "driver-popover-next-btn driver-popover-footer-btn karto-tour-arrow-btn karto-tour-arrow-btn--next";
    popover.nextButton.setAttribute("aria-label", "Далее");
    stripNativeButtonChrome(popover.nextButton);
  }

  popover.progress.textContent = `${String(activeIndex + 1).padStart(2, "0")}  /  ${String(totalSteps).padStart(2, "0")}`;
  popover.progress.className = "karto-tour-index";

  window.queueMicrotask(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.classList.contains("karto-tour-arrow-btn") ||
        active.classList.contains("driver-popover-footer-btn"))
    ) {
      active.blur();
    }
  });
}

export function setCreativeDualHighlight(active: boolean): void {
  document.documentElement.classList.toggle("karto-tour-creative", active);
  const sidebar = document.querySelector(CREATIVE_SIDEBAR_SELECTOR);
  if (sidebar instanceof HTMLElement) {
    sidebar.classList.toggle("karto-tour-also-lit", active);
    if (active) {
      backup(sidebar);
      sidebar.style.setProperty("z-index", "1000000001", "important");
      sidebar.style.pointerEvents = "auto";
    }
  }
}
