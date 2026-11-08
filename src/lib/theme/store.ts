import { APPEARANCE_KEY, parseAppearance, resolveAppearance } from "./appearance";
import type { AppearancePreference } from "./appearance";

let preference: AppearancePreference | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

export function getServerAppearance(): AppearancePreference { return "system"; }
export function getAppearance(): AppearancePreference {
  if (typeof window === "undefined") return getServerAppearance();
  if (preference === null) {
    try { preference = parseAppearance(window.localStorage.getItem(APPEARANCE_KEY)); }
    catch { preference = parseAppearance(document.documentElement.dataset.appearance); }
  }
  return preference;
}
function applyAppearance() {
  let dark = false;
  try { dark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { /* Light fallback. */ }
  const selected = getAppearance();
  const resolved = resolveAppearance(selected, dark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.appearance = selected;
  document.documentElement.style.colorScheme = resolved;
}
export function setAppearance(value: AppearancePreference) {
  preference = parseAppearance(value);
  try { window.localStorage.setItem(APPEARANCE_KEY, preference); } catch { /* Keep the session preference. */ }
  applyAppearance();
  listeners.forEach((listener) => listener());
}
export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  if (!detach) {
    const onSystemChange = () => {
      if (getAppearance() === "system") applyAppearance();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_KEY && event.key !== null) return;
      preference = parseAppearance(event.newValue);
      applyAppearance();
      listeners.forEach((notify) => notify());
    };
    let media: MediaQueryList | undefined;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", onSystemChange);
    } catch { /* Explicit choices still work when matchMedia is unavailable. */ }
    window.addEventListener("storage", onStorage);
    applyAppearance();
    detach = () => {
      media?.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      detach = null;
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) detach?.();
  };
}
