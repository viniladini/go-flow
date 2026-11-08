export type AppearancePreference = "light" | "dark" | "system";
export type ResolvedAppearance = "light" | "dark";
export const APPEARANCE_KEY = "go.flow.appearance";
export function parseAppearance(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveAppearance(preference: AppearancePreference, prefersDark: boolean): ResolvedAppearance {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

/** Self-contained: serialized into a blocking head script; no storage write on load. */
export function initializeAppearance() {
  let preference = "system";
  try {
    const stored = window.localStorage.getItem("go.flow.appearance");
    if (stored === "light" || stored === "dark") preference = stored;
  } catch { /* Storage may be unavailable; system remains the default. */ }
  let dark = false;
  try { dark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { /* Light fallback. */ }
  const resolved = preference === "system" ? (dark ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.appearance = preference;
  document.documentElement.style.colorScheme = resolved;
}
export const APPEARANCE_INIT_SCRIPT = "(" + initializeAppearance.toString() + ")();";
