import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { localExplorerListWorkers } from "../../api";
import { LOCAL_EXPLORER_API_PATH } from "../../constants";
import { filterVisibleWorkers } from "../WorkerSelector";
import {
	cronCustomRowsStorageKey,
	readPersistedCustomCronRows,
	writePersistedCustomCronRows,
} from "./persistence";
import {
	createCronRow,
	duplicateCronRow,
	reconcileConfiguredRows,
} from "./row-state";
import type { LocalExplorerWorker } from "../../api";
import type { CronRow, CronWorkerState, FetcherScheduledResult } from "./types";
import type { PropsWithChildren } from "react";

const REFRESH_HEADER = "X-Miniflare-Explorer-Refresh";
const POLL_INTERVAL_MS = 5_000;

interface ScheduledEnvelope {
	result?: unknown;
	errors?: Array<{ message?: string }>;
}

export interface CronTriggersContextValue {
	addCustom(workerName: string): string;
	duplicateRow(workerName: string, rowId: string): string;
	entry: (workerName: string) => CronWorkerState;
	fallbackWorkerName: string;
	isRefreshing(workerName: string): boolean;
	invoke(
		workerName: string,
		rowId: string,
		scheduledTime: number
	): Promise<void>;
	refresh(workerName: string, automatic?: boolean): Promise<void>;
	removeRow(workerName: string, rowId: string): void;
	updateRow(
		workerName: string,
		rowId: string,
		update: (row: CronRow) => CronRow
	): void;
	visibleWorkerNames: string[];
}

const CronTriggersContext = createContext<CronTriggersContextValue | null>(
	null
);

function visibleCronWorkers(
	metadata: LocalExplorerWorker[]
): LocalExplorerWorker[] {
	return filterVisibleWorkers(metadata);
}

export function selectCronFallbackWorker(
	metadata: LocalExplorerWorker[]
): string {
	const visible = visibleCronWorkers(metadata);
	return (
		visible.find((worker) => worker.isSelf)?.name ?? visible[0]?.name ?? ""
	);
}

export function createCronStateFromSeed(
	seedWorkers: LocalExplorerWorker[],
	authoritative: boolean
): Record<string, CronWorkerState> {
	if (!authoritative) {
		return {};
	}
	return Object.fromEntries(
		seedWorkers.map((worker) => {
			const crons = worker.triggers?.crons ?? [];
			return [
				worker.name,
				{
					authoritative: true,
					crons,
					rows: reconcileConfiguredRows([], crons),
					stale: false,
				} satisfies CronWorkerState,
			];
		})
	);
}

function emptyState(): CronWorkerState {
	return { authoritative: false, rows: [], stale: true };
}

function localStorageIfAvailable(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function persistenceKeysForMetadata(
	metadata: LocalExplorerWorker[]
): Record<string, string> {
	return Object.fromEntries(
		metadata.flatMap((worker) => {
			const key = cronCustomRowsStorageKey(
				worker.persistenceScope,
				worker.name
			);
			return key ? [[worker.name, key]] : [];
		})
	);
}

export function reconcilePersistenceKeysForRefresh(
	previousKeys: Record<string, string>,
	metadata: LocalExplorerWorker[]
): Record<string, string> {
	const nextKeys = { ...previousKeys };
	const returnedKeys = persistenceKeysForMetadata(metadata);
	for (const worker of metadata) {
		const key = returnedKeys[worker.name];
		if (key === undefined) {
			delete nextKeys[worker.name];
		} else {
			nextKeys[worker.name] = key;
		}
	}
	return nextKeys;
}

export function shouldReplaceCustomRowsForPersistenceScope(
	previousKey: string | undefined,
	nextKey: string | undefined
): boolean {
	return (
		previousKey !== undefined &&
		nextKey !== undefined &&
		previousKey !== nextKey
	);
}

function hydrateInitialCustomRows(
	workers: Record<string, CronWorkerState>,
	keys: Record<string, string>,
	storage: Storage | undefined
): Record<string, CronWorkerState> {
	if (!storage) {
		return workers;
	}
	return Object.fromEntries(
		Object.entries(workers).map(([workerName, entry]) => {
			const key = keys[workerName];
			return [
				workerName,
				key
					? {
							...entry,
							rows: [
								...entry.rows,
								...readPersistedCustomCronRows(storage, key),
							],
						}
					: entry,
			];
		})
	);
}

function scheduledResult(value: unknown): FetcherScheduledResult | undefined {
	if (
		typeof value !== "object" ||
		value === null ||
		!("outcome" in value) ||
		!("noRetry" in value)
	) {
		return undefined;
	}
	const outcome = (value as { outcome?: unknown }).outcome;
	const noRetry = (value as { noRetry?: unknown }).noRetry;
	return typeof outcome === "string" && typeof noRetry === "boolean"
		? ({ ...(value as object), outcome, noRetry } as FetcherScheduledResult)
		: undefined;
}

export function CronTriggersProvider({
	active,
	activeWorkerName,
	bootstrapAuthoritative,
	children,
	seedWorkers,
}: PropsWithChildren<{
	activeWorkerName?: string;
	bootstrapAuthoritative: boolean;
	seedWorkers: LocalExplorerWorker[];
	active: boolean;
}>) {
	const storage = useRef<Storage | undefined>(localStorageIfAvailable());
	const [initialPersistence] = useState(() => {
		const metadata = bootstrapAuthoritative ? seedWorkers : [];
		const keys = persistenceKeysForMetadata(metadata);
		return {
			keys,
			workers: hydrateInitialCustomRows(
				createCronStateFromSeed(seedWorkers, bootstrapAuthoritative),
				keys,
				storage.current
			),
		};
	});
	const [workers, setWorkers] = useState<Record<string, CronWorkerState>>(
		initialPersistence.workers
	);
	const [persistenceKeys, setPersistenceKeys] = useState(
		initialPersistence.keys
	);
	const persistenceKeysRef = useRef(initialPersistence.keys);
	const lastScopedPersistenceKeys = useRef(initialPersistence.keys);
	const hydratedPersistenceKeys = useRef(
		new Set(Object.values(initialPersistence.keys))
	);
	const lastPersistedCustomRows = useRef(new Map<string, CronRow[]>());
	const [fallbackWorkerName, setFallbackWorkerName] = useState(() => {
		return selectCronFallbackWorker(seedWorkers);
	});
	const [visibleWorkerNames, setVisibleWorkerNames] = useState(() => {
		if (!bootstrapAuthoritative) {
			return [];
		}
		return visibleCronWorkers(seedWorkers).map((worker) => worker.name);
	});
	const [refreshingWorkers, setRefreshingWorkers] = useState<Set<string>>(
		new Set()
	);
	const generation = useRef(new RefreshGenerationTracker());
	const pendingRows = useRef(new Set<string>());

	useEffect(() => {
		if (!storage.current) {
			return;
		}
		for (const [workerName, key] of Object.entries(persistenceKeys)) {
			if (!hydratedPersistenceKeys.current.has(key)) {
				continue;
			}
			const customRows = (workers[workerName]?.rows ?? []).filter(
				(row) => row.source === "custom"
			);
			const previous = lastPersistedCustomRows.current.get(key);
			if (
				previous &&
				previous.length === customRows.length &&
				previous.every((row, index) => row === customRows[index])
			) {
				continue;
			}
			writePersistedCustomCronRows(storage.current, key, customRows);
			lastPersistedCustomRows.current.set(key, customRows);
		}
	}, [persistenceKeys, workers]);

	const updateRow = useCallback(
		(workerName: string, id: string, update: (row: CronRow) => CronRow) => {
			setWorkers((current) => {
				const entry = current[workerName] ?? emptyState();
				return {
					...current,
					[workerName]: {
						...entry,
						rows: entry.rows.map((row) => (row.id === id ? update(row) : row)),
					},
				};
			});
		},
		[]
	);

	const refresh = useCallback(async (workerName: string, automatic = false) => {
		const requestGeneration = generation.current.start(workerName, automatic);
		if (requestGeneration === undefined) {
			return;
		}
		setRefreshingWorkers((current) => new Set(current).add(workerName));
		try {
			const response = await localExplorerListWorkers({
				headers: automatic ? { [REFRESH_HEADER]: "poll" } : undefined,
			});
			const metadata = response.data?.result;
			if (!metadata) {
				throw new Error("Refresh returned invalid Worker metadata.");
			}
			if (!generation.current.isLatest(requestGeneration)) {
				return;
			}
			const visibleWorkers = visibleCronWorkers(metadata);
			setFallbackWorkerName(selectCronFallbackWorker(metadata));
			setVisibleWorkerNames(visibleWorkers.map((worker) => worker.name));
			const previousScopedPersistenceKeys = lastScopedPersistenceKeys.current;
			const returnedPersistenceKeys = persistenceKeysForMetadata(metadata);
			const nextPersistenceKeys = reconcilePersistenceKeysForRefresh(
				persistenceKeysRef.current,
				metadata
			);
			setWorkers((current) => {
				const next = { ...current };
				for (const worker of metadata) {
					const entry = current[worker.name] ?? emptyState();
					const crons = worker.triggers?.crons ?? [];
					const persistenceKey = returnedPersistenceKeys[worker.name];
					const persistenceScopeChanged =
						shouldReplaceCustomRowsForPersistenceScope(
							previousScopedPersistenceKeys[worker.name],
							persistenceKey
						);
					const existingRows = persistenceScopeChanged
						? entry.rows.filter((row) => row.source !== "custom")
						: entry.rows;
					let rows = reconcileConfiguredRows(existingRows, crons);
					if (
						persistenceKey &&
						(persistenceScopeChanged ||
							!hydratedPersistenceKeys.current.has(persistenceKey))
					) {
						rows = [
							...rows,
							...(storage.current
								? readPersistedCustomCronRows(storage.current, persistenceKey)
								: []),
						];
						hydratedPersistenceKeys.current.add(persistenceKey);
					}
					next[worker.name] = {
						authoritative: true,
						crons,
						rows,
						stale: false,
					};
				}
				if (
					workerName !== "" &&
					!metadata.some((worker) => worker.name === workerName)
				) {
					const entry = current[workerName] ?? emptyState();
					next[workerName] = { ...entry, stale: true };
				}
				return next;
			});
			lastScopedPersistenceKeys.current = {
				...previousScopedPersistenceKeys,
				...nextPersistenceKeys,
			};
			persistenceKeysRef.current = nextPersistenceKeys;
			setPersistenceKeys(nextPersistenceKeys);
		} catch {
			if (!generation.current.isLatest(requestGeneration)) {
				return;
			}
			setWorkers((current) => {
				if (workerName === "") {
					return current;
				}
				const entry = current[workerName] ?? emptyState();
				return { ...current, [workerName]: { ...entry, stale: true } };
			});
		} finally {
			if (generation.current.finish(workerName, requestGeneration)) {
				setRefreshingWorkers((current) => {
					const next = new Set(current);
					next.delete(workerName);
					return next;
				});
			}
		}
	}, []);

	useEffect(() => {
		if (!active) {
			return;
		}
		const refreshWorker = activeWorkerName ?? "";
		void refresh(refreshWorker, true);
		const poll = window.setInterval(() => {
			if (document.visibilityState === "visible") {
				void refresh(refreshWorker, true);
			}
		}, POLL_INTERVAL_MS);
		const refreshWhenVisible = () => {
			if (document.visibilityState === "visible") {
				void refresh(refreshWorker, true);
			}
		};
		window.addEventListener("focus", refreshWhenVisible);
		document.addEventListener("visibilitychange", refreshWhenVisible);
		return () => {
			window.clearInterval(poll);
			window.removeEventListener("focus", refreshWhenVisible);
			document.removeEventListener("visibilitychange", refreshWhenVisible);
		};
	}, [active, activeWorkerName, refresh]);

	const value = useMemo<CronTriggersContextValue>(
		() => ({
			addCustom(workerName) {
				const row = createCronRow("");
				setWorkers((current) => {
					const entry = current[workerName] ?? emptyState();
					return {
						...current,
						[workerName]: { ...entry, rows: [...entry.rows, row] },
					};
				});
				return row.id;
			},
			duplicateRow(workerName, id) {
				const duplicateId = `custom-${crypto.randomUUID()}`;
				setWorkers((current) => {
					const entry = current[workerName] ?? emptyState();
					const row = entry.rows.find((candidate) => candidate.id === id);
					if (!row) {
						return current;
					}
					const duplicate = duplicateCronRow(row, duplicateId);
					return {
						...current,
						[workerName]: { ...entry, rows: [...entry.rows, duplicate] },
					};
				});
				return duplicateId;
			},
			entry: (workerName) => workers[workerName] ?? emptyState(),
			fallbackWorkerName,
			isRefreshing: (workerName) => refreshingWorkers.has(workerName),
			async invoke(workerName, id, scheduledTime) {
				const pendingKey = `${workerName}\u0000${id}`;
				const row = workers[workerName]?.rows.find(
					(candidate) => candidate.id === id
				);
				if (
					!row ||
					pendingRows.current.has(pendingKey) ||
					row.invocation?.status === "pending" ||
					row.cron.trim() === ""
				) {
					return;
				}
				pendingRows.current.add(pendingKey);
				const requestId = crypto.randomUUID();
				const snapshot = { cron: row.cron, requestId, scheduledTime };
				updateRow(workerName, id, (current) => ({
					...current,
					invocation: { ...snapshot, status: "pending" },
				}));
				try {
					const response = await fetch(
						`${LOCAL_EXPLORER_API_PATH}/local/scheduled?worker=${encodeURIComponent(workerName)}`,
						{
							body: JSON.stringify({
								cron: snapshot.cron,
								scheduled_time: snapshot.scheduledTime,
							}),
							headers: { "Content-Type": "application/json" },
							method: "POST",
						}
					);
					const envelope = (await response.json().catch(() => undefined)) as
						| ScheduledEnvelope
						| undefined;
					if (!response.ok) {
						throw new Error(
							envelope?.errors?.[0]?.message ??
								`Invocation failed with status ${response.status}.`
						);
					}
					const result = scheduledResult(envelope?.result);
					if (!result) {
						throw new Error("Invocation returned an invalid result.");
					}
					updateRow(workerName, id, (current) =>
						current.invocation?.requestId === requestId
							? {
									...current,
									invocation: { ...snapshot, result, status: "result" },
								}
							: current
					);
				} catch (error) {
					updateRow(workerName, id, (current) =>
						current.invocation?.requestId === requestId
							? {
									...current,
									invocation: {
										...snapshot,
										error:
											error instanceof Error
												? error.message
												: "Invocation failed.",
										status: "error",
									},
								}
							: current
					);
				} finally {
					pendingRows.current.delete(pendingKey);
				}
			},
			refresh,
			removeRow(workerName, id) {
				setWorkers((current) => {
					const entry = current[workerName] ?? emptyState();
					const row = entry.rows.find((candidate) => candidate.id === id);
					if (!row || row.invocation?.status === "pending") {
						return current;
					}
					return {
						...current,
						[workerName]: {
							...entry,
							rows: entry.rows.filter((candidate) => candidate.id !== id),
						},
					};
				});
			},
			updateRow,
			visibleWorkerNames,
		}),
		[
			fallbackWorkerName,
			refresh,
			refreshingWorkers,
			updateRow,
			visibleWorkerNames,
			workers,
		]
	);

	return (
		<CronTriggersContext.Provider value={value}>
			{children}
		</CronTriggersContext.Provider>
	);
}

export function useCronTriggers(): CronTriggersContextValue {
	const context = useContext(CronTriggersContext);
	if (!context) {
		throw new Error(
			"useCronTriggers must be used inside CronTriggersProvider."
		);
	}
	return context;
}

export { REFRESH_HEADER };

export class RefreshGenerationTracker {
	#latest = 0;
	#pendingByWorker = new Map<string, number>();

	start(workerName: string, automatic = false): number | undefined {
		if (automatic && this.#pendingByWorker.has(workerName)) {
			return undefined;
		}
		this.#latest += 1;
		this.#pendingByWorker.set(workerName, this.#latest);
		return this.#latest;
	}

	finish(workerName: string, generation: number): boolean {
		if (this.#pendingByWorker.get(workerName) !== generation) {
			return false;
		}
		this.#pendingByWorker.delete(workerName);
		return true;
	}

	isLatest(generation: number): boolean {
		return generation === this.#latest;
	}
}
