import { describe, it } from "vitest";
import {
	CRON_CUSTOM_ROWS_STORAGE_PREFIX,
	cronCustomRowsStorageKey,
	readPersistedCustomCronRows,
	writePersistedCustomCronRows,
} from "../../components/cron-triggers/persistence";
import { createCronRow } from "../../components/cron-triggers/row-state";

class MemoryStorage implements Storage {
	#values = new Map<string, string>();
	writesBlocked = false;

	get length(): number {
		return this.#values.size;
	}

	clear(): void {
		this.#values.clear();
	}

	getItem(key: string): string | null {
		return this.#values.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.#values.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.#values.delete(key);
	}

	setItem(key: string, value: string): void {
		if (this.writesBlocked) {
			throw new Error("quota exceeded");
		}
		this.#values.set(key, value);
	}
}

describe("Cron Trigger custom-row persistence", () => {
	it("uses the versioned project and encoded Worker key", ({ expect }) => {
		expect(cronCustomRowsStorageKey(undefined, "worker")).toBeUndefined();
		expect(cronCustomRowsStorageKey("project-scope", "a Worker/name")).toBe(
			`${CRON_CUSTOM_ROWS_STORAGE_PREFIX}.project-scope.a%20Worker%2Fname`
		);
	});

	it("persists only editable custom drafts and rebuilds transient state", ({
		expect,
	}) => {
		const storage = new MemoryStorage();
		const configured = createCronRow("configured", "configured");
		const custom = {
			...createCronRow("0 12 * * *"),
			calendarValue: "2026-09-10T12:34:56.789",
			customEpochMs: 1,
			invocation: {
				cron: "0 12 * * *",
				requestId: "request-id",
				scheduledTime: 1,
				status: "pending" as const,
			},
			timeMode: "custom" as const,
		};

		writePersistedCustomCronRows(storage, "key", [configured, custom]);
		const raw = storage.getItem("key") ?? "";
		expect(raw).not.toContain(custom.id);
		expect(raw).not.toContain("customEpochMs");
		expect(raw).not.toContain("request-id");
		expect(raw).not.toContain("source");

		const restored = readPersistedCustomCronRows(storage, "key");
		expect(restored).toHaveLength(1);
		expect(restored[0]).toMatchObject({
			calendarValue: "2026-09-10T12:34:56.789",
			cron: "0 12 * * *",
			customEpochMs: Date.UTC(2026, 8, 10, 12, 34, 56, 789),
			source: "custom",
			timeMode: "custom",
		});
		expect(restored[0]?.id).not.toBe(custom.id);
		expect(restored[0]?.invocation).toBeUndefined();
	});

	it("recomputes valid epoch input and retains invalid editable input", ({
		expect,
	}) => {
		const storage = new MemoryStorage();
		const valid = {
			...createCronRow("valid"),
			customTimeInputMode: "epoch" as const,
			epochValue: "123456789",
			timeMode: "custom" as const,
		};
		const invalid = {
			...createCronRow("invalid"),
			cronBuilder: { kind: "daily" as const, hour: "", minute: "7" },
			cronInputMode: "builder" as const,
			customTimeInputMode: "epoch" as const,
			epochValue: "not-an-integer",
			timeMode: "custom" as const,
		};
		writePersistedCustomCronRows(storage, "key", [valid, invalid]);

		const restored = readPersistedCustomCronRows(storage, "key");
		expect(restored[0]?.customEpochMs).toBe(123456789);
		expect(restored[1]?.epochValue).toBe("not-an-integer");
		expect(restored[1]?.customEpochMs).toBeUndefined();
		expect(restored[1]).toMatchObject({
			cronBuilder: { kind: "daily", hour: "", minute: "7" },
			cronInputMode: "builder",
		});
	});

	for (const [label, raw] of [
		["invalid JSON", "not json"],
		["unknown envelope", JSON.stringify({ rows: [] })],
		[
			"unknown row field",
			JSON.stringify([
				{
					cron: "* * * * *",
					cronBuilder: { kind: "daily", hour: "0", minute: "0" },
					cronInputMode: "expression",
					customTimeInputMode: "calendar",
					timeMode: "now",
					unknown: true,
				},
			]),
		],
	] as const) {
		it(`removes malformed or unknown storage: ${label}`, ({ expect }) => {
			const storage = new MemoryStorage();
			storage.setItem("key", raw);
			expect(readPersistedCustomCronRows(storage, "key")).toEqual([]);
			expect(storage.getItem("key")).toBeNull();
		});
	}

	it("removes empty state and tolerates storage failures", ({ expect }) => {
		const storage = new MemoryStorage();
		storage.setItem("key", "old");
		writePersistedCustomCronRows(storage, "key", []);
		expect(storage.getItem("key")).toBeNull();

		const quotaStorage = new MemoryStorage();
		writePersistedCustomCronRows(quotaStorage, "key", [
			createCronRow("persisted"),
		]);
		const previous = quotaStorage.getItem("key");
		quotaStorage.writesBlocked = true;
		writePersistedCustomCronRows(quotaStorage, "key", [
			createCronRow("not persisted"),
		]);
		expect(quotaStorage.getItem("key")).toBe(previous);

		const throwing = {
			getItem: () => {
				throw new Error("blocked");
			},
			removeItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
		} as unknown as Storage;
		expect(() => readPersistedCustomCronRows(throwing, "key")).not.toThrow();
		expect(() =>
			writePersistedCustomCronRows(throwing, "key", [createCronRow("cron")])
		).not.toThrow();
	});
});
