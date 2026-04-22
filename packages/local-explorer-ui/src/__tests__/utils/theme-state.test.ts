import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	getNextThemeMode,
	loadThemeMode,
	resolveThemeMode,
	saveThemeMode,
	THEME_MODES,
} from "../../utils/theme-state";
import type { ThemeMode } from "../../utils/theme-state";

const STORAGE_KEY = "local-explorer.theme.v1";

/**
 * Minimal localStorage stub scoped to each test.
 */
function createStorageStub(): Storage {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => {
			store.clear();
		},
		get length() {
			return store.size;
		},
		key: (_index: number) => null,
	};
}

describe("theme-state", () => {
	let storageStub: Storage;

	beforeEach(() => {
		storageStub = createStorageStub();
		vi.stubGlobal("localStorage", storageStub);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("THEME_MODES", () => {
		test("contains exactly light, dark, system in cycle order", ({
			expect,
		}) => {
			expect(THEME_MODES).toEqual(["light", "dark", "system"]);
		});
	});

	describe("getNextThemeMode", () => {
		test("cycles light -> dark", ({ expect }) => {
			expect(getNextThemeMode("light")).toBe("dark");
		});

		test("cycles dark -> system", ({ expect }) => {
			expect(getNextThemeMode("dark")).toBe("system");
		});

		test("cycles system -> light", ({ expect }) => {
			expect(getNextThemeMode("system")).toBe("light");
		});

		test("full cycle returns to the starting mode", ({ expect }) => {
			let mode: ThemeMode = "light";
			for (let i = 0; i < THEME_MODES.length; i++) {
				mode = getNextThemeMode(mode);
			}
			expect(mode).toBe("light");
		});
	});

	describe("resolveThemeMode", () => {
		test('returns "light" for mode "light" regardless of OS', ({ expect }) => {
			expect(resolveThemeMode("light", false)).toBe("light");
			expect(resolveThemeMode("light", true)).toBe("light");
		});

		test('returns "dark" for mode "dark" regardless of OS', ({ expect }) => {
			expect(resolveThemeMode("dark", false)).toBe("dark");
			expect(resolveThemeMode("dark", true)).toBe("dark");
		});

		test('returns OS preference for mode "system"', ({ expect }) => {
			expect(resolveThemeMode("system", false)).toBe("light");
			expect(resolveThemeMode("system", true)).toBe("dark");
		});
	});

	describe("loadThemeMode", () => {
		test('returns "system" when nothing is stored', ({ expect }) => {
			expect(loadThemeMode()).toBe("system");
		});

		test('returns "system" for unrecognised stored value', ({ expect }) => {
			storageStub.setItem(STORAGE_KEY, "neon");
			expect(loadThemeMode()).toBe("system");
		});

		test('returns "system" for empty string', ({ expect }) => {
			storageStub.setItem(STORAGE_KEY, "");
			expect(loadThemeMode()).toBe("system");
		});

		test("returns stored mode when valid", ({ expect }) => {
			for (const mode of THEME_MODES) {
				storageStub.setItem(STORAGE_KEY, mode);
				expect(loadThemeMode()).toBe(mode);
			}
		});

		test('returns "system" when `localStorage.getItem` throws', ({
			expect,
		}) => {
			vi.spyOn(storageStub, "getItem").mockImplementation(() => {
				throw new Error("SecurityError");
			});
			expect(loadThemeMode()).toBe("system");
		});
	});

	describe("saveThemeMode", () => {
		test("persists mode to `localStorage`", ({ expect }) => {
			saveThemeMode("dark");
			expect(storageStub.getItem(STORAGE_KEY)).toBe("dark");
		});

		test("overwrites previous value", ({ expect }) => {
			saveThemeMode("light");
			saveThemeMode("dark");
			expect(storageStub.getItem(STORAGE_KEY)).toBe("dark");
		});

		test("does not throw when `localStorage.setItem` throws", ({ expect }) => {
			vi.spyOn(storageStub, "setItem").mockImplementation(() => {
				throw new Error("QuotaExceededError");
			});
			expect(() => saveThemeMode("dark")).not.toThrow();
		});
	});

	describe("round-trip", () => {
		test("`loadThemeMode` returns what saveThemeMode persisted", ({
			expect,
		}) => {
			for (const mode of THEME_MODES) {
				saveThemeMode(mode);
				expect(loadThemeMode()).toBe(mode);
			}
		});
	});
});
