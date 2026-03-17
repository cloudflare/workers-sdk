import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

function getSystemTheme(): ResolvedTheme {
	if (typeof window === "undefined") {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
	if (preference === "system") {
		return getSystemTheme();
	}

	return preference;
}

function applyTheme(theme: ResolvedTheme): void {
	if (typeof document === "undefined") {
		return;
	}

	if (theme === "dark") {
		document.documentElement.classList.add("dark");
		return;
	}

	document.documentElement.classList.remove("dark");
}

function getStoredPreference(): ThemePreference {
	if (typeof window === "undefined") {
		return "system";
	}

	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") {
		return stored;
	}

	return "system";
}

export interface UseThemeReturn {
	cycleNext: () => void;
	preference: ThemePreference;
	resolvedTheme: ResolvedTheme;
}

export function useTheme(): UseThemeReturn {
	const [preference, setPreference] =
		useState<ThemePreference>(getStoredPreference);
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
		resolveTheme(getStoredPreference())
	);

	// Apply theme on mount & when resolved theme changes
	useEffect((): void => {
		applyTheme(resolvedTheme);
	}, [resolvedTheme]);

	// Listen for system preference changes when in system mode
	useEffect(() => {
		if (preference !== "system") {
			return;
		}

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		function handleChange(event: MediaQueryListEvent): void {
			const newResolvedTheme = event.matches ? "dark" : "light";
			setResolvedTheme(newResolvedTheme);
		}

		mediaQuery.addEventListener("change", handleChange);

		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, [preference]);

	// Cycle through themes: system -> light -> dark -> system
	const cycleNext = useCallback((): void => {
		setPreference((current) => {
			let next: ThemePreference;

			switch (current) {
				case "system":
					next = "light";
					break;
				case "light":
					next = "dark";
					break;
				case "dark":
					next = "system";
					break;
				default:
					next = "system";
			}

			localStorage.setItem(STORAGE_KEY, next);
			const newResolved = resolveTheme(next);
			setResolvedTheme(newResolved);

			return next;
		});
	}, []);

	return {
		cycleNext,
		preference,
		resolvedTheme,
	};
}
