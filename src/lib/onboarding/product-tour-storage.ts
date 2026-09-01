import { createBrowserClient } from "@/lib/supabase/client";
import {
  PRODUCT_TOUR_COMPLETED_STORAGE_KEY,
  PRODUCT_TOUR_COMPLETED_USER_META_KEY,
  PRODUCT_TOUR_PENDING_COOKIE,
  PRODUCT_TOUR_PENDING_STORAGE_KEY,
  PRODUCT_TOUR_RUNNING_STORAGE_KEY,
  PRODUCT_TOUR_STEP_STORAGE_KEY,
} from "@/lib/onboarding/product-tour-constants";

function readCompleted(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY) === "1") return true;
  if (sessionStorage.getItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY) === "1") {
    localStorage.setItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY, "1");
    sessionStorage.removeItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY);
    return true;
  }
  return false;
}

export function markProductTourCompleted(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY, "1");
  sessionStorage.removeItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY);
  sessionStorage.removeItem(PRODUCT_TOUR_PENDING_STORAGE_KEY);
  sessionStorage.removeItem(PRODUCT_TOUR_RUNNING_STORAGE_KEY);
  sessionStorage.removeItem(PRODUCT_TOUR_STEP_STORAGE_KEY);
  void persistTourCompletedToAccount();
}

async function persistTourCompletedToAccount(): Promise<void> {
  try {
    const supabase = createBrowserClient();
    await supabase.auth.updateUser({
      data: { [PRODUCT_TOUR_COMPLETED_USER_META_KEY]: true },
    });
  } catch {
    /* сеть не должна ломать закрытие тура */
  }
}

export function accountHasCompletedTour(user: {
  user_metadata?: Record<string, unknown> | null;
} | null): boolean {
  return user?.user_metadata?.[PRODUCT_TOUR_COMPLETED_USER_META_KEY] === true;
}

/** Новая регистрация: тур снова разрешён, даже если в этом браузере его уже проходили. */
export function armProductTourPending(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY);
  sessionStorage.removeItem(PRODUCT_TOUR_COMPLETED_STORAGE_KEY);
  sessionStorage.removeItem(PRODUCT_TOUR_RUNNING_STORAGE_KEY);
  sessionStorage.removeItem(PRODUCT_TOUR_STEP_STORAGE_KEY);
  sessionStorage.setItem(PRODUCT_TOUR_PENDING_STORAGE_KEY, "1");
}

export function isProductTourCompleted(): boolean {
  return readCompleted();
}

export function setTourRunning(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) sessionStorage.setItem(PRODUCT_TOUR_RUNNING_STORAGE_KEY, "1");
  else sessionStorage.removeItem(PRODUCT_TOUR_RUNNING_STORAGE_KEY);
}

export function isTourRunning(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(PRODUCT_TOUR_RUNNING_STORAGE_KEY) === "1";
}

export function getTourStepIndex(): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(PRODUCT_TOUR_STEP_STORAGE_KEY);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function setTourStepIndex(index: number): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PRODUCT_TOUR_STEP_STORAGE_KEY, String(Math.max(0, index)));
}

export function isProductTourPending(): boolean {
  if (typeof window === "undefined") return false;
  if (readCompleted()) return false;
  if (sessionStorage.getItem(PRODUCT_TOUR_PENDING_STORAGE_KEY) === "1") {
    return true;
  }
  return Boolean(
    document.cookie.match(new RegExp(`(?:^|; )${PRODUCT_TOUR_PENDING_COOKIE}=1`))
  );
}

export function syncProductTourPendingFromCookie(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(PRODUCT_TOUR_PENDING_STORAGE_KEY) === "1") {
    return true;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${PRODUCT_TOUR_PENDING_COOKIE}=1`)
  );
  if (!match) return false;
  document.cookie = `${PRODUCT_TOUR_PENDING_COOKIE}=; Max-Age=0; path=/`;
  armProductTourPending();
  return true;
}

export function shouldForceProductTour(search: string): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(search);
  return params.get("tour") === "1";
}

export function shouldResumeProductTour(search: string): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(search);
  return params.get("tour") === "resume";
}

function captureProductTourPendingFromQuery(search: string): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(search);
  const tour = params.get("tour");
  if (tour === "pending") {
    armProductTourPending();
    return true;
  }
  if (tour === "resume") return isTourRunning() || isProductTourPending();
  return false;
}

export function shouldShowProductTour(search: string): boolean {
  if (shouldForceProductTour(search)) return true;
  if (readCompleted()) {
    return shouldResumeProductTour(search) && isTourRunning();
  }
  if (shouldResumeProductTour(search)) {
    return isTourRunning() || isProductTourPending();
  }
  if (captureProductTourPendingFromQuery(search)) return true;
  syncProductTourPendingFromCookie();
  return isProductTourPending();
}

export function isProductTourLikelyToRun(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("karto-tour-active")) return true;
  const raw = window.location.search;
  const search = raw.startsWith("?") ? raw.slice(1) : raw;
  return shouldShowProductTour(search) || isTourRunning();
}
