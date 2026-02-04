import type { WorkersKvKey } from "./generated";

export * from "./generated";

// KVEntry is a UI-specific type that combines key + value
// (The API returns keys and values in separate calls)
export interface KVEntry {
	key: WorkersKvKey;
	value: string | null;
}
