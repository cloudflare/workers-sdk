const STORAGE_KEY = "local-explorer.sidebar.groups.v1";

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
		const raw = localStorage.getItem(STORAGE_KEY);
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
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Silently ignore storage errors
	}
}
