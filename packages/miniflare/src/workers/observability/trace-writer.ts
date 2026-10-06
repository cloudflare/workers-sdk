import type { LogInput, SpanInput } from "./trace-types";

export const TRACE_BATCH_CAPACITY = 20_480;
const TRACE_BATCH_CAPACITY_ENV = "X_LOCAL_OBSERVABILITY_BATCH_SIZE";

export function parseTraceBatchCapacity(value: string | null): number {
	if (value === null) {
		return TRACE_BATCH_CAPACITY;
	}
	const capacity = Number(value);
	if (!Number.isSafeInteger(capacity) || capacity <= 0) {
		throw new Error(
			`${TRACE_BATCH_CAPACITY_ENV} must be a positive safe integer; received ${JSON.stringify(value)}`
		);
	}
	return capacity;
}

/** The batched-write subset of the TraceStore used over RPC. */
export interface BatchStore {
	persist(spans: SpanInput[], logs: LogInput[]): void | Promise<void>;
}

export interface ClearableBatchStore extends BatchStore {
	clear(): void | Promise<void>;
}

export type TraceWriterOwner = symbol;

interface QueuedSpan {
	owner: TraceWriterOwner;
	version: number;
	row: SpanInput;
}

interface QueuedLog {
	owner: TraceWriterOwner;
	version: number;
	row: LogInput;
}

interface Batch {
	spans: Map<string, QueuedSpan>;
	logs: QueuedLog[];
	ownerVersions: Map<TraceWriterOwner, number>;
}

interface OwnerState {
	store: BatchStore;
	nextVersion: number;
	completedVersion: number;
	failure: unknown;
	waiters: Array<{
		targetVersion: number;
		resolve: () => void;
		reject: (reason: unknown) => void;
	}>;
}

/**
 * Collector-wide double buffer for the singleton TraceStore. Tail callbacks
 * only mutate the active in-memory batch; at most one store RPC is in flight.
 */
export class TraceWriter {
	#active = emptyBatch();
	#owners = new Map<TraceWriterOwner, OwnerState>();
	#flushRequested = false;
	#inFlight: Promise<void> | undefined;
	#pendingPump = false;
	#pendingClearPumps = new Set<TraceWriterOwner>();
	#clearInFlight: Promise<void> | undefined;

	constructor(private readonly capacity = TRACE_BATCH_CAPACITY) {}

	createOwner(store: BatchStore): TraceWriterOwner {
		const owner = Symbol("trace-writer-owner");
		this.#owners.set(owner, {
			store,
			nextVersion: 0,
			completedVersion: 0,
			failure: undefined,
			waiters: [],
		});
		return owner;
	}

	/** Queue a completed span snapshot if the active batch has capacity. */
	enqueueCompletedSpan(owner: TraceWriterOwner, row: SpanInput): boolean {
		if (row.durationMs === null) {
			throw new Error("TraceWriter only accepts completed spans");
		}
		const key = rowKey(row.traceId, row.spanId);
		const alreadyBuffered = this.#active.spans.has(key);
		if (!alreadyBuffered && this.#activeRows() >= this.capacity) {
			return false;
		}

		const version = this.#nextVersion(owner);
		this.#active.spans.set(key, {
			owner,
			version,
			row: cloneSpan(row),
		});
		this.#recordOwnerVersion(owner, version);
		if (this.#activeRows() >= this.capacity) {
			this.flush(owner);
		}
		return true;
	}

	enqueueLog(owner: TraceWriterOwner, row: LogInput): boolean {
		if (this.#activeRows() >= this.capacity) {
			return false;
		}
		const version = this.#nextVersion(owner);
		this.#active.logs.push({ owner, version, row: { ...row } });
		this.#recordOwnerVersion(owner, version);
		this.flush(owner);
		return true;
	}

	flush(owner: TraceWriterOwner): void {
		if (this.#active.spans.size === 0 && this.#active.logs.length === 0) {
			return;
		}
		this.#flushRequested = true;
		this.#pump(owner);
	}

	/** Flush and wait for all rows accepted for this invocation. */
	async drain(owner: TraceWriterOwner): Promise<void> {
		const state = this.#owner(owner);
		const targetVersion = state.nextVersion;
		this.flush(owner);
		try {
			await this.#waitFor(owner, targetVersion);
		} finally {
			this.#owners.delete(owner);
		}
	}

	/** Serialise a store clear with persistence without deleting newer rows. */
	clear(store: ClearableBatchStore): Promise<void> {
		// Capture this clear's cutoff synchronously. Rows accepted after this call
		// land in a fresh batch, even when another clear is already in progress.
		const batch = this.#active;
		this.#active = emptyBatch();
		this.#flushRequested = false;

		const previous = this.#clearInFlight;
		const operation =
			previous === undefined
				? this.#clear(store, batch)
				: previous.catch(() => {}).then(() => this.#clear(store, batch));
		const tracked = operation.finally(() => {
			if (this.#clearInFlight === tracked) {
				this.#clearInFlight = undefined;
			}
		});
		this.#clearInFlight = tracked;
		return tracked;
	}

	async #clear(store: ClearableBatchStore, batch: Batch): Promise<void> {
		if (this.#inFlight !== undefined) {
			await this.#inFlight;
		}
		if (batch.spans.size > 0 || batch.logs.length > 0) {
			await this.#persistBatch(batch, store);
		}
		await store.clear();
	}

	#pump(owner: TraceWriterOwner): void {
		if (
			!this.#flushRequested ||
			(this.#active.spans.size === 0 && this.#active.logs.length === 0)
		) {
			return;
		}
		if (!this.#active.ownerVersions.has(owner)) {
			return;
		}
		if (this.#clearInFlight !== undefined) {
			if (!this.#pendingClearPumps.has(owner)) {
				this.#pendingClearPumps.add(owner);
				const clearInFlight = this.#clearInFlight;
				const resume = () => {
					this.#pendingClearPumps.delete(owner);
					this.#pump(owner);
				};
				// Register from the invocation's request context so the next store RPC
				// resumes there after the clear request completes.
				void clearInFlight.then(resume, resume);
			}
			return;
		}
		if (this.#inFlight !== undefined) {
			if (!this.#pendingPump && this.#active.ownerVersions.has(owner)) {
				this.#pendingPump = true;
				const inFlight = this.#inFlight;
				const store = this.#owner(owner).store;
				// Register from this invocation's request context. Workerd restores it
				// before this continuation starts the next store RPC.
				void inFlight.then(() => {
					if (this.#inFlight === inFlight) {
						this.#inFlight = undefined;
					}
					this.#pendingPump = false;
					this.#startBatch(store);
				});
			}
			return;
		}

		this.#startBatch(this.#owner(owner).store);
	}

	#startBatch(store: BatchStore): void {
		if (
			this.#clearInFlight !== undefined ||
			!this.#flushRequested ||
			(this.#active.spans.size === 0 && this.#active.logs.length === 0)
		) {
			return;
		}
		const batch = this.#active;
		this.#active = emptyBatch();
		this.#flushRequested = false;
		void this.#persistBatch(batch, store);
	}

	#persistBatch(batch: Batch, store: BatchStore): Promise<void> {
		const spans = Array.from(batch.spans.values(), ({ row }) => row);
		const logs = batch.logs.map(({ row }) => row);
		let operation: void | Promise<void>;
		try {
			operation = store.persist(spans, logs);
		} catch (error) {
			this.#finishBatch(batch, error);
			return Promise.resolve();
		}
		const inFlight = Promise.resolve(operation).then(
			() => this.#finishBatch(batch),
			(error: unknown) => this.#finishBatch(batch, error)
		);
		this.#inFlight = inFlight;
		void inFlight.then(() => {
			if (this.#inFlight === inFlight && !this.#pendingPump) {
				this.#inFlight = undefined;
			}
		});
		return inFlight;
	}

	#finishBatch(batch: Batch, error?: unknown): void {
		for (const [owner, version] of batch.ownerVersions) {
			const state = this.#owners.get(owner);
			if (!state) {
				continue;
			}
			state.completedVersion = Math.max(state.completedVersion, version);
			if (error !== undefined && state.failure === undefined) {
				state.failure = error;
			}
			this.#settleWaiters(state);
		}
	}

	#nextVersion(owner: TraceWriterOwner): number {
		const state = this.#owner(owner);
		state.nextVersion++;
		return state.nextVersion;
	}

	#recordOwnerVersion(owner: TraceWriterOwner, version: number): void {
		this.#active.ownerVersions.set(
			owner,
			Math.max(this.#active.ownerVersions.get(owner) ?? 0, version)
		);
	}

	#waitFor(owner: TraceWriterOwner, targetVersion: number): Promise<void> {
		const state = this.#owner(owner);
		if (state.completedVersion >= targetVersion) {
			return state.failure === undefined
				? Promise.resolve()
				: Promise.reject(state.failure);
		}
		return new Promise((resolve, reject) => {
			state.waiters.push({ targetVersion, resolve, reject });
		});
	}

	#settleWaiters(state: OwnerState): void {
		const pending = [];
		for (const waiter of state.waiters) {
			if (state.completedVersion < waiter.targetVersion) {
				pending.push(waiter);
			} else if (state.failure === undefined) {
				waiter.resolve();
			} else {
				waiter.reject(state.failure);
			}
		}
		state.waiters = pending;
	}

	#owner(owner: TraceWriterOwner): OwnerState {
		const state = this.#owners.get(owner);
		if (!state) {
			throw new Error("Unknown trace writer owner");
		}
		return state;
	}

	#activeRows(): number {
		return this.#active.spans.size + this.#active.logs.length;
	}
}

function emptyBatch(): Batch {
	return {
		spans: new Map(),
		logs: [],
		ownerVersions: new Map(),
	};
}

function cloneSpan(row: SpanInput): SpanInput {
	return {
		...row,
		attributes:
			row.attributes === null
				? null
				: Object.fromEntries(
						Object.entries(row.attributes).map(([name, value]) => [
							name,
							Array.isArray(value) ? [...value] : value,
						])
					),
	};
}

function rowKey(traceId: string, spanId: string): string {
	return `${traceId}\u0000${spanId}`;
}
