import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	DEFAULT_GROUP_STATE,
	DEFAULT_SIDEBAR_OPEN,
	loadGroupState,
	loadSidebarOpenState,
	saveGroupState,
	saveSidebarOpenState,
	SIDEBAR_GROUP_IDS,
} from "../../utils/sidebar-state";
import type { SidebarGroupState } from "../../utils/sidebar-state";

const GROUPS_STORAGE_KEY = "local-explorer.sidebar.groups.v1";
const OPEN_STORAGE_KEY = "local-explorer.sidebar.open.v1";

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

describe("sidebar-state", () => {
	let storageStub: Storage;

	beforeEach(() => {
		storageStub = createStorageStub();
		vi.stubGlobal("localStorage", storageStub);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("getDefaultGroupState", () => {
		test("returns all groups expanded", ({ expect }) => {
			for (const id of SIDEBAR_GROUP_IDS) {
				expect(DEFAULT_GROUP_STATE[id]).toBe(true);
			}
		});

		test("contains exactly the known group IDs", ({ expect }) => {
			expect(Object.keys(DEFAULT_GROUP_STATE).sort()).toEqual(
				[...SIDEBAR_GROUP_IDS].sort()
			);
		});
	});

	describe("loadGroupState", () => {
		test("returns defaults when nothing is stored", ({ expect }) => {
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});

		test("returns defaults when stored value is not valid JSON", ({
			expect,
		}) => {
			storageStub.setItem(GROUPS_STORAGE_KEY, "not-json{{{");
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});

		test("returns defaults when stored value is null JSON", ({ expect }) => {
			storageStub.setItem(GROUPS_STORAGE_KEY, "null");
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});

		test("returns defaults when stored value is an array", ({ expect }) => {
			storageStub.setItem(GROUPS_STORAGE_KEY, "[1,2,3]");
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});

		test("returns defaults when stored value is a string", ({ expect }) => {
			storageStub.setItem(GROUPS_STORAGE_KEY, '"hello"');
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});

		test("returns defaults when stored value is a number", ({ expect }) => {
			storageStub.setItem(GROUPS_STORAGE_KEY, "42");
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});

		test("merges partial stored state onto defaults", ({ expect }) => {
			storageStub.setItem(GROUPS_STORAGE_KEY, JSON.stringify({ d1: false }));
			const state = loadGroupState();
			expect(state.d1).toBe(false);
			expect(state.do).toBe(true);
			expect(state.kv).toBe(true);
			expect(state.r2).toBe(true);
			expect(state.workflows).toBe(true);
		});

		test("respects all stored boolean values", ({ expect }) => {
			const stored: SidebarGroupState = {
				d1: false,
				do: false,
				kv: true,
				r2: false,
				workflows: true,
			};
			storageStub.setItem(GROUPS_STORAGE_KEY, JSON.stringify(stored));
			expect(loadGroupState()).toEqual(stored);
		});

		test("ignores non-boolean values in stored object", ({ expect }) => {
			storageStub.setItem(
				GROUPS_STORAGE_KEY,
				JSON.stringify({ d1: "yes", do: 42, kv: null, r2: false })
			);
			const state = loadGroupState();
			// Non-boolean values should fall back to defaults (true)
			expect(state.d1).toBe(true);
			expect(state.do).toBe(true);
			expect(state.kv).toBe(true);
			// Valid boolean should be respected
			expect(state.r2).toBe(false);
			expect(state.workflows).toBe(true);
		});

		test("ignores unknown keys in stored object", ({ expect }) => {
			storageStub.setItem(
				GROUPS_STORAGE_KEY,
				JSON.stringify({ d1: false, unknownGroup: false })
			);
			const state = loadGroupState();
			expect(state.d1).toBe(false);
			expect("unknownGroup" in state).toBe(false);
		});

		test("returns defaults when localStorage.getItem throws", ({ expect }) => {
			vi.spyOn(storageStub, "getItem").mockImplementation(() => {
				throw new Error("SecurityError");
			});
			expect(loadGroupState()).toEqual(DEFAULT_GROUP_STATE);
		});
	});

	describe("saveGroupState", () => {
		test("persists state to localStorage", ({ expect }) => {
			const state: SidebarGroupState = {
				d1: false,
				do: true,
				kv: false,
				r2: true,
				workflows: false,
			};
			saveGroupState(state);
			const raw = storageStub.getItem(GROUPS_STORAGE_KEY);
			expect(raw).not.toBeNull();
			expect(JSON.parse(raw as string)).toEqual(state);
		});

		test("does not throw when localStorage.setItem throws", ({ expect }) => {
			vi.spyOn(storageStub, "setItem").mockImplementation(() => {
				throw new Error("QuotaExceededError");
			});
			expect(() => saveGroupState(DEFAULT_GROUP_STATE)).not.toThrow();
		});
	});

	describe("round-trip", () => {
		test("loadGroupState returns what saveGroupState persisted", ({
			expect,
		}) => {
			const state: SidebarGroupState = {
				d1: false,
				do: false,
				kv: true,
				r2: false,
				workflows: true,
			};
			saveGroupState(state);
			expect(loadGroupState()).toEqual(state);
		});

		test("multiple saves overwrite previous state", ({ expect }) => {
			saveGroupState({ ...DEFAULT_GROUP_STATE, d1: false });
			saveGroupState({ ...DEFAULT_GROUP_STATE, kv: false });
			const state = loadGroupState();
			expect(state.d1).toBe(true); // overwritten by second save
			expect(state.kv).toBe(false);
		});
	});

	describe("DEFAULT_SIDEBAR_OPEN", () => {
		test("defaults to true (expanded)", ({ expect }) => {
			expect(DEFAULT_SIDEBAR_OPEN).toBe(true);
		});
	});

	describe("loadSidebarOpenState", () => {
		test("returns default when nothing is stored", ({ expect }) => {
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns default when stored value is not valid JSON", ({
			expect,
		}) => {
			storageStub.setItem(OPEN_STORAGE_KEY, "not-json{{{");
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns default when stored value is null JSON", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, "null");
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns default when stored value is a string", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, '"hello"');
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns default when stored value is a number", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, "42");
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns default when stored value is an object", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, '{"open":true}');
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns default when stored value is an array", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, "[true]");
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});

		test("returns true when stored value is true", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, "true");
			expect(loadSidebarOpenState()).toBe(true);
		});

		test("returns false when stored value is false", ({ expect }) => {
			storageStub.setItem(OPEN_STORAGE_KEY, "false");
			expect(loadSidebarOpenState()).toBe(false);
		});

		test("returns default when localStorage.getItem throws", ({ expect }) => {
			vi.spyOn(storageStub, "getItem").mockImplementation(() => {
				throw new Error("SecurityError");
			});
			expect(loadSidebarOpenState()).toBe(DEFAULT_SIDEBAR_OPEN);
		});
	});

	describe("saveSidebarOpenState", () => {
		test("persists true to `localStorage`", ({ expect }) => {
			saveSidebarOpenState(true);
			const raw = storageStub.getItem(OPEN_STORAGE_KEY);
			expect(raw).toBe("true");
		});

		test("persists false to `localStorage`", ({ expect }) => {
			saveSidebarOpenState(false);
			const raw = storageStub.getItem(OPEN_STORAGE_KEY);
			expect(raw).toBe("false");
		});

		test("does not throw when localStorage.setItem throws", ({ expect }) => {
			vi.spyOn(storageStub, "setItem").mockImplementation(() => {
				throw new Error("QuotaExceededError");
			});
			expect(() => saveSidebarOpenState(true)).not.toThrow();
		});
	});

	describe("sidebar open round-trip", () => {
		test("`loadSidebarOpenState` returns what `saveSidebarOpenState` persisted", ({
			expect,
		}) => {
			saveSidebarOpenState(false);
			expect(loadSidebarOpenState()).toBe(false);

			saveSidebarOpenState(true);
			expect(loadSidebarOpenState()).toBe(true);
		});

		test("multiple saves overwrite previous state", ({ expect }) => {
			saveSidebarOpenState(false);
			saveSidebarOpenState(true);
			expect(loadSidebarOpenState()).toBe(true);
		});
	});

	describe("storage key isolation", () => {
		test("sidebar open state and group state use separate keys", ({
			expect,
		}) => {
			saveSidebarOpenState(false);
			saveGroupState({ ...DEFAULT_GROUP_STATE, d1: false });

			// Each should be independently readable
			expect(loadSidebarOpenState()).toBe(false);
			expect(loadGroupState().d1).toBe(false);
			expect(loadGroupState().kv).toBe(true);
		});
	});
});
