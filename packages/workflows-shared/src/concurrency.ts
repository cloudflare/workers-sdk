import { DurableObject, RpcTarget } from "cloudflare:workers";
import { createWorkflowError } from "./lib/errors";
import type { ConcurrencyKey, ConcurrencyKeyWithUsage } from "./types";

export const CONCURRENCY_KEYS_OBJECT_NAME = "concurrency-keys";

export const CONCURRENCY_WAIT_POLL_MS = 1_000;

const MAX_KEY_NAME_LENGTH = 255;

// A waiting step re-registers on every pass of its acquire loop, so an entry it stops
// refreshing (its engine died without releasing) drops out of `waiting` counts by itself.
const WAITER_TTL_MS = 5_000;

const KEY_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Node-side packages such as wrangler import `./types`, so the key shapes live there and
// this module, which needs the Workers runtime, stays out of their type checks.
export type {
	ConcurrencyKey,
	ConcurrencyKeyUsage,
	ConcurrencyKeyWithUsage,
} from "./types";

// Test holds from the admin API belong to no Workflow, so their workflow, instance and
// step fields are null.
export type ConcurrencyKeyEntry = {
	workflow_name: string | null;
	instance_id: string | null;
	step: string | null;
	since: string;
};

export type ConcurrencyKeyWaiter = ConcurrencyKeyEntry & {
	blocked_on: string;
	keys: string[];
};

export type AcquireRequest = {
	holderId: string;
	workflow: string;
	instanceId: string;
	step: string;
	keys: readonly string[];
};

export type AcquireResult =
	| { granted: true; heldKeys: string[]; unknownKeys: string[] }
	| { granted: false; blockedOn: string; limit: number; holding: number };

type Holder = {
	workflow: string | null;
	instanceId: string | null;
	step: string | null;
	keys: string[];
	since: number;
};

type Waiter = Holder & { blockedOn: string; lastSeen: number };

type KeyRow = {
	id: string;
	name: string;
	key_limit: number;
	created_on: string;
};

function toKey(row: KeyRow): ConcurrencyKey {
	return {
		id: row.id,
		name: row.name,
		limit: row.key_limit,
		created_on: row.created_on,
	};
}

function validateLimit(limit: unknown): number {
	if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
		throw createWorkflowError(
			"Concurrency key limit must be a positive integer",
			"body"
		);
	}
	return limit;
}

function validateName(name: unknown): string {
	if (
		typeof name !== "string" ||
		name.length === 0 ||
		name.length > MAX_KEY_NAME_LENGTH
	) {
		throw createWorkflowError(
			`Concurrency key name must be between 1 and ${MAX_KEY_NAME_LENGTH} characters`,
			"body"
		);
	}
	return name;
}

function notFound(nameOrId: string): Error {
	return createWorkflowError(
		`concurrency key '${nameOrId}' does not exist`,
		"concurrency_key.not_found"
	);
}

/** Holds every local concurrency key of a Miniflare instance. One object owns all keys,
 * so a step referencing several keys gets all of them or none in a single call. */
export class ConcurrencyKeys extends DurableObject<Record<string, unknown>> {
	#holders = new Map<string, Holder>();
	#waiters = new Map<string, Waiter>();
	#slotListeners = new Set<() => void>();
	#waiterListeners = new Set<() => void>();
	#warnedUnknownKeys = new Set<string>();

	constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
		super(ctx, env);
		ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS concurrency_keys (
				id TEXT PRIMARY KEY NOT NULL,
				name TEXT NOT NULL UNIQUE,
				key_limit INTEGER NOT NULL,
				created_on TEXT NOT NULL
			)
		`);
	}

	acquire(request: AcquireRequest): AcquireResult {
		const existing = this.#holders.get(request.holderId);
		if (existing !== undefined) {
			return { granted: true, heldKeys: existing.keys, unknownKeys: [] };
		}

		const heldKeys: string[] = [];
		const missingKeys: string[] = [];
		for (const name of request.keys) {
			const key = this.#findByName(name);
			if (key === undefined) {
				missingKeys.push(name);
				continue;
			}
			const holding = this.#holdingCount(name);
			if (holding >= key.limit) {
				this.#registerWaiter(request, name);
				return { granted: false, blockedOn: name, limit: key.limit, holding };
			}
			heldKeys.push(name);
		}

		this.#waiters.delete(request.holderId);
		this.#holders.set(request.holderId, {
			workflow: request.workflow,
			instanceId: request.instanceId,
			step: request.step,
			keys: heldKeys,
			since: Date.now(),
		});
		const unknownKeys = missingKeys.filter(
			(name) => !this.#warnedUnknownKeys.has(name)
		);
		for (const name of unknownKeys) {
			this.#warnedUnknownKeys.add(name);
		}
		return { granted: true, heldKeys, unknownKeys };
	}

	async waitForChange(timeoutMs: number): Promise<void> {
		await this.#waitFor(this.#slotListeners, timeoutMs);
	}

	cancelWait(holderId: string): void {
		this.#waiters.delete(holderId);
	}

	release(holderId: string): void {
		this.#waiters.delete(holderId);
		if (this.#holders.delete(holderId)) {
			this.#notify(this.#slotListeners);
		}
	}

	releaseInstance(workflow: string, instanceId: string): void {
		let released = false;
		for (const [holderId, holder] of this.#holders) {
			if (holder.workflow === workflow && holder.instanceId === instanceId) {
				this.#holders.delete(holderId);
				released = true;
			}
		}
		for (const [holderId, waiter] of this.#waiters) {
			if (waiter.workflow === workflow && waiter.instanceId === instanceId) {
				this.#waiters.delete(holderId);
			}
		}
		if (released) {
			this.#notify(this.#slotListeners);
		}
	}

	listKeys(): ConcurrencyKeyWithUsage[] {
		return this.ctx.storage.sql
			.exec<KeyRow>(
				"SELECT id, name, key_limit, created_on FROM concurrency_keys ORDER BY created_on, name"
			)
			.toArray()
			.map((row) => this.#withUsage(toKey(row)));
	}

	getKey(nameOrId: string): ConcurrencyKeyWithUsage | undefined {
		const key = this.#find(nameOrId);
		return key === undefined ? undefined : this.#withUsage(key);
	}

	createKey(name: unknown, limit: unknown): ConcurrencyKeyWithUsage {
		const keyName = validateName(name);
		const keyLimit = validateLimit(limit);
		if (this.#findByName(keyName) !== undefined) {
			throw createWorkflowError(
				`concurrency key '${keyName}' already exists`,
				"concurrency_key.already_exists"
			);
		}
		const key: ConcurrencyKey = {
			id: crypto.randomUUID(),
			name: keyName,
			limit: keyLimit,
			created_on: new Date().toISOString(),
		};
		this.ctx.storage.sql.exec(
			"INSERT INTO concurrency_keys (id, name, key_limit, created_on) VALUES (?, ?, ?, ?)",
			key.id,
			key.name,
			key.limit,
			key.created_on
		);
		this.#notify(this.#slotListeners);
		return this.#withUsage(key);
	}

	updateKey(nameOrId: string, limit: unknown): ConcurrencyKeyWithUsage {
		const keyLimit = validateLimit(limit);
		const key = this.#find(nameOrId);
		if (key === undefined) {
			throw notFound(nameOrId);
		}
		this.ctx.storage.sql.exec(
			"UPDATE concurrency_keys SET key_limit = ? WHERE id = ?",
			keyLimit,
			key.id
		);
		this.#notify(this.#slotListeners);
		return this.#withUsage({ ...key, limit: keyLimit });
	}

	// Matches production: steps already holding a deleted key keep their slot, and still
	// count against a key re-created with the same name.
	deleteKey(nameOrId: string): ConcurrencyKey {
		const key = this.#find(nameOrId);
		if (key === undefined) {
			throw notFound(nameOrId);
		}
		this.ctx.storage.sql.exec(
			"DELETE FROM concurrency_keys WHERE id = ?",
			key.id
		);
		this.#notify(this.#slotListeners);
		return key;
	}

	listHolders(nameOrId: string): ConcurrencyKeyEntry[] {
		const key = this.#find(nameOrId);
		if (key === undefined) {
			throw notFound(nameOrId);
		}
		return [...this.#holders.values()]
			.filter((holder) => holder.keys.includes(key.name))
			.map(toEntry);
	}

	listWaiters(nameOrId: string): ConcurrencyKeyWaiter[] {
		const key = this.#find(nameOrId);
		if (key === undefined) {
			throw notFound(nameOrId);
		}
		return this.#freshWaiters()
			.filter((waiter) => waiter.blockedOn === key.name)
			.map(toWaiterEntry);
	}

	getInstanceWaits(
		workflow: string,
		instanceId: string
	): ConcurrencyKeyWaiter[] {
		return this.#freshWaiters()
			.filter(
				(waiter) =>
					waiter.workflow === workflow && waiter.instanceId === instanceId
			)
			.map(toWaiterEntry);
	}

	// A test hold always succeeds, even past the limit, so a test can fill a key without
	// first reading how many of its slots are free.
	hold(name: string, count = 1): string[] {
		const keyName = validateName(name);
		const holderIds = Array.from(
			{ length: count },
			() => `test/${crypto.randomUUID()}`
		);
		for (const holderId of holderIds) {
			this.#holders.set(holderId, {
				workflow: null,
				instanceId: null,
				step: null,
				keys: [keyName],
				since: Date.now(),
			});
		}
		return holderIds;
	}

	async waitForWaiters(
		nameOrId: string,
		count: number,
		timeoutMs: number
	): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const key = this.#find(nameOrId);
			const waiting = key === undefined ? 0 : this.#waitingCount(key.name);
			if (waiting >= count) {
				return;
			}
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				throw new Error(
					`Timed out after ${timeoutMs}ms waiting for ${count} step(s) to wait for concurrency key "${nameOrId}" (${waiting} waiting)`
				);
			}
			await this.#waitFor(this.#waiterListeners, Math.min(remaining, 250));
		}
	}

	reset(): void {
		this.ctx.storage.sql.exec("DELETE FROM concurrency_keys");
		this.#holders.clear();
		this.#waiters.clear();
		this.#warnedUnknownKeys.clear();
		this.#notify(this.#slotListeners);
	}

	#find(nameOrId: string): ConcurrencyKey | undefined {
		if (KEY_ID_PATTERN.test(nameOrId)) {
			const row = this.ctx.storage.sql
				.exec<KeyRow>(
					"SELECT id, name, key_limit, created_on FROM concurrency_keys WHERE id = ?",
					nameOrId.toLowerCase()
				)
				.toArray()[0];
			if (row !== undefined) {
				return toKey(row);
			}
		}
		return this.#findByName(nameOrId);
	}

	#findByName(name: string): ConcurrencyKey | undefined {
		const row = this.ctx.storage.sql
			.exec<KeyRow>(
				"SELECT id, name, key_limit, created_on FROM concurrency_keys WHERE name = ?",
				name
			)
			.toArray()[0];
		return row === undefined ? undefined : toKey(row);
	}

	#holdingCount(name: string): number {
		let count = 0;
		for (const holder of this.#holders.values()) {
			if (holder.keys.includes(name)) {
				count++;
			}
		}
		return count;
	}

	#waitingCount(name: string): number {
		return this.#freshWaiters().filter((waiter) => waiter.blockedOn === name)
			.length;
	}

	#freshWaiters(): Waiter[] {
		const now = Date.now();
		for (const [holderId, waiter] of this.#waiters) {
			if (now - waiter.lastSeen > WAITER_TTL_MS) {
				this.#waiters.delete(holderId);
			}
		}
		return [...this.#waiters.values()];
	}

	#withUsage(key: ConcurrencyKey): ConcurrencyKeyWithUsage {
		return {
			...key,
			usage: {
				holding: this.#holdingCount(key.name),
				waiting: this.#waitingCount(key.name),
			},
		};
	}

	#registerWaiter(request: AcquireRequest, blockedOn: string): void {
		const now = Date.now();
		const existing = this.#waiters.get(request.holderId);
		this.#waiters.set(request.holderId, {
			workflow: request.workflow,
			instanceId: request.instanceId,
			step: request.step,
			keys: [...request.keys],
			since: existing?.since ?? now,
			blockedOn,
			lastSeen: now,
		});
		if (existing === undefined || existing.blockedOn !== blockedOn) {
			this.#notify(this.#waiterListeners);
		}
	}

	async #waitFor(listeners: Set<() => void>, timeoutMs: number): Promise<void> {
		const timer = new AbortController();
		const done = () => timer.abort();
		listeners.add(done);
		try {
			await scheduler
				.wait(Math.max(0, timeoutMs), { signal: timer.signal })
				.catch(() => {}); // a listener aborted the timer to wake this wait early
		} finally {
			listeners.delete(done);
		}
	}

	#notify(listeners: Set<() => void>): void {
		for (const listener of [...listeners]) {
			listener();
		}
	}
}

function toEntry(holder: Holder): ConcurrencyKeyEntry {
	return {
		workflow_name: holder.workflow,
		instance_id: holder.instanceId,
		step: holder.step,
		since: new Date(holder.since).toISOString(),
	};
}

function toWaiterEntry(waiter: Waiter): ConcurrencyKeyWaiter {
	return {
		...toEntry(waiter),
		blocked_on: waiter.blockedOn,
		keys: waiter.keys,
	};
}

/** Test API for the local concurrency keys, returned by a Workflow binding's
 * `unsafeGetConcurrencyKeysAdmin()`. Disposing it releases the slots it holds. */
export class ConcurrencyKeysAdmin extends RpcTarget {
	#stub: DurableObjectStub<ConcurrencyKeys>;
	#holds = new Set<string>();

	constructor(stub: DurableObjectStub<ConcurrencyKeys>) {
		super();
		this.#stub = stub;
	}

	async list(): Promise<ConcurrencyKeyWithUsage[]> {
		return await this.#stub.listKeys();
	}

	async get(name: string): Promise<ConcurrencyKeyWithUsage | null> {
		return (await this.#stub.getKey(name)) ?? null;
	}

	async set(name: string, limit: number): Promise<ConcurrencyKeyWithUsage> {
		if ((await this.#stub.getKey(name)) === undefined) {
			return await this.#stub.createKey(name, limit);
		}
		return await this.#stub.updateKey(name, limit);
	}

	async delete(name: string): Promise<void> {
		await this.#stub.deleteKey(name);
	}

	async hold(name: string, count = 1): Promise<string[]> {
		const holderIds = await this.#stub.hold(name, count);
		for (const holderId of holderIds) {
			this.#holds.add(holderId);
		}
		return holderIds;
	}

	async release(holderIds: string[]): Promise<void> {
		for (const holderId of holderIds) {
			this.#holds.delete(holderId);
			await this.#stub.release(holderId);
		}
	}

	async waitForWaiters(
		name: string,
		count = 1,
		timeoutMs = 5_000
	): Promise<void> {
		await this.#stub.waitForWaiters(name, count, timeoutMs);
	}

	async reset(): Promise<void> {
		this.#holds.clear();
		await this.#stub.reset();
	}

	[Symbol.dispose](): void {
		const holds = [...this.#holds];
		this.#holds.clear();
		for (const holderId of holds) {
			void this.#stub.release(holderId).catch(() => {});
		}
	}
}
