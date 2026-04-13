const STORAGE_KEY = "local-explorer.theme.v1";

/**
 * The user-selectable theme modes.
 *
 * - `"light"` / `"dark"` force the corresponding appearance.
 * - `"system"` follows the OS preference via `prefers-color-scheme`.
 */
export type ThemeMode = "dark" | "light" | "system";

/**
 * Ordered cycle: light -> dark -> system -> light
 */
export const THEME_MODES: readonly ThemeMode[] = [
	"light",
	"dark",
	"system",
] as const;

/**
 * Return the next mode in the cycle.
 *
 * light -> dark -> system -> light ...
 */
export function getNextThemeMode(current: ThemeMode): ThemeMode {
	const index = THEME_MODES.indexOf(current);
	const next = THEME_MODES[(index + 1) % THEME_MODES.length];

	// Safety: modular arithmetic on a non-empty array always yields a valid index.
	// The fallback satisfies the type checker without a non-null assertion.
	return next ?? "system";
}

/**
 * Resolve a `ThemeMode` to the effective `"light" | "dark"` value
 * that should be applied to `document.documentElement.dataset.mode`.
 *
 * @param mode - The user-selected mode.
 * @param prefers - Dark Whether the OS currently prefers dark mode.
 */
export function resolveThemeMode(
	mode: ThemeMode,
	prefersDark: boolean
): "dark" | "light" {
	if (mode === "system") {
		return prefersDark ? "dark" : "light";
	}

	return mode;
}

/**
 * Read the persisted theme mode from `localStorage`.
 *
 * Returns `"system"` when:
 * - `localStorage` is unavailable (e.g. SSR, security restrictions)
 * - the stored value is missing or not a recognised mode string
 */
export function loadThemeMode(): ThemeMode {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw !== null && isThemeMode(raw)) {
			return raw;
		}

		return "system";
	} catch {
		return "system";
	}
}

/**
 * Persist the selected theme mode to `localStorage`.
 *
 * Silently swallows errors (e.g. quota exceeded, security restrictions)
 * so the UI never breaks due to storage failures.
 */
export function saveThemeMode(mode: ThemeMode): void {
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// Silently ignore storage errors
	}
}

/**
 * Apply the effective theme to the document root element.
 *
 * Sets `data-mode` on `<html>` which Kumo's CSS uses for dark/light theming.
 */
export function applyThemeMode(mode: ThemeMode, prefersDark: boolean): void {
	document.documentElement.dataset.mode = resolveThemeMode(mode, prefersDark);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isThemeMode(value: string): value is ThemeMode {
	return (THEME_MODES as readonly string[]).includes(value);
}
