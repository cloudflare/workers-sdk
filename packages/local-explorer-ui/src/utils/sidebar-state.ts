const GROUPS_STORAGE_KEY = "local-explorer.sidebar.groups.v1";
const OPEN_STORAGE_KEY = "local-explorer.sidebar.open.v1";

export const SIDEBAR_GROUP_IDS = ["d1", "do", "kv", "r2", "workflows"] as const;

export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number];

export type SidebarGroupState = Record<SidebarGroupId, boolean>;

export const DEFAULT_GROUP_STATE: SidebarGroupState = {
	d1: true,
	do: true,
	kv: true,
	r2: true,
	workflows: true,
};

/**
 * Read persisted group state from `localStorage`.
 *
 * Returns the default (all-expanded) state when:
 * - `localStorage` is unavailable (e.g. SSR, security restrictions)
 * - the stored value is missing, not valid JSON, or not an object
 *
 * Merges stored values onto defaults so that newly-added groups
 * automatically default to expanded without requiring a migration.
 */
export function loadGroupState(): SidebarGroupState {
	try {
		const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
		if (raw === null) {
			return DEFAULT_GROUP_STATE;
		}

		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return DEFAULT_GROUP_STATE;
		}

		const record = parsed as Record<string, unknown>;
		const merged = { ...DEFAULT_GROUP_STATE };

		for (const id of SIDEBAR_GROUP_IDS) {
			if (typeof record[id] === "boolean") {
				merged[id] = record[id];
			}
		}

		return merged;
	} catch {
		return DEFAULT_GROUP_STATE;
	}
}

/**
 * Persist group state to `localStorage`.
 *
 * Silently swallows errors (e.g. quota exceeded, security restrictions)
 * so the UI never breaks due to storage failures.
 */
export function saveGroupState(state: SidebarGroupState): void {
	try {
		localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Silently ignore storage errors
	}
}

export const DEFAULT_SIDEBAR_OPEN = true;

/**
 * Read persisted sidebar open/collapsed state from `localStorage`.
 *
 * Returns `true` (expanded) when:
 * - `localStorage` is unavailable (e.g. SSR, security restrictions)
 * - the stored value is missing, not valid JSON, or not a boolean
 */
export function loadSidebarOpenState(): boolean {
	try {
		const raw = localStorage.getItem(OPEN_STORAGE_KEY);
		if (raw === null) {
			return DEFAULT_SIDEBAR_OPEN;
		}

		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "boolean") {
			return DEFAULT_SIDEBAR_OPEN;
		}

		return parsed;
	} catch {
		return DEFAULT_SIDEBAR_OPEN;
	}
}

/**
 * Persist sidebar open/collapsed state to `localStorage`.
 *
 * Silently swallows errors (e.g. quota exceeded, security restrictions)
 * so the UI never breaks due to storage failures.
 */
export function saveSidebarOpenState(open: boolean): void {
	try {
		localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(open));
	} catch {
		// Silently ignore storage errors
	}
}
