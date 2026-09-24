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
	cronTimePresetsStorageKey,
	readPersistedCronTimePresets,
	readPersistedCustomCronRows,
	writePersistedCronTimePresets,
	writePersistedCustomCronRows,
} from "./persistence";
import { createCronRow, reconcileConfiguredRows } from "./row-state";
import { MAX_DATE_EPOCH_MS, MIN_DATE_EPOCH_MS } from "./scheduled-time";
import type { LocalExplorerWorker } from "../../api";
import type {
	CronRow,
	CronWorkerState,
	CustomCronRow,
	FetcherScheduledResult,
} from "./types";
import type { PropsWithChildren } from "react";

const REFRESH_HEADER = "X-Miniflare-Explorer-Refresh";
const POLL_INTERVAL_MS = 5_000;

interface ScheduledEnvelope {
	result?: unknown;
	errors?: Array<{ message?: string }>;
}

export interface CronTriggersContextValue {
	activeWorkerName?: string;
	addCustom(workerName: string): string;
	addTimePreset(workerName: string, epochMs: number): void;
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
	removeTimePreset(workerName: string, epochMs: number): void;
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
					configuredRows: reconcileConfiguredRows([], crons),
					crons,
					customRows: [],
					stale: false,
					timePresets: [],
				} satisfies CronWorkerState,
			];
		})
	);
}

function emptyState(): CronWorkerState {
	return {
		authoritative: false,
		configuredRows: [],
		customRows: [],
		stale: true,
		timePresets: [],
	};
}

function localStorageIfAvailable(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function persistenceKeysForMetadata(
	metadata: LocalExplorerWorker[],
	keyForWorker: (
		persistenceScope: string | undefined,
		workerName: string
	) => string | undefined = cronCustomRowsStorageKey
): Record<string, string> {
	return Object.fromEntries(
		metadata.flatMap((worker) => {
			const key = keyForWorker(worker.persistenceScope, worker.name);
			return key ? [[worker.name, key]] : [];
		})
	);
}

export function reconcilePersistenceKeysForRefresh(
	previousKeys: Record<string, string>,
	metadata: LocalExplorerWorker[],
	keyForWorker: (
		persistenceScope: string | undefined,
		workerName: string
	) => string | undefined = cronCustomRowsStorageKey
): Record<string, string> {
	const nextKeys = { ...previousKeys };
	const returnedKeys = persistenceKeysForMetadata(metadata, keyForWorker);
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

export function didPersistenceScopeChange(
	previousKey: string | undefined,
	nextKey: string | undefined
): boolean {
	return (
		previousKey !== undefined &&
		nextKey !== undefined &&
		previousKey !== nextKey
	);
}

function hydrateInitialPersistence(
	workers: Record<string, CronWorkerState>,
	customRowKeys: Record<string, string>,
	timePresetKeys: Record<string, string>,
	storage: Storage | undefined
): Record<string, CronWorkerState> {
	if (!storage) {
		return workers;
	}
	return Object.fromEntries(
		Object.entries(workers).map(([workerName, entry]) => {
			const customRowKey = customRowKeys[workerName];
			const timePresetKey = timePresetKeys[workerName];
			return [
				workerName,
				{
					...entry,
					customRows: customRowKey
						? readPersistedCustomCronRows(storage, customRowKey)
						: entry.customRows,
					timePresets: timePresetKey
						? readPersistedCronTimePresets(storage, timePresetKey)
						: [],
				},
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
	activeWorkerName,
	bootstrapAuthoritative,
	children,
	onWorkerMetadata,
	seedWorkers,
}: PropsWithChildren<{
	activeWorkerName?: string;
	bootstrapAuthoritative: boolean;
	onWorkerMetadata: (metadata: LocalExplorerWorker[]) => void;
	seedWorkers: LocalExplorerWorker[];
}>) {
	const storage = useRef<Storage | undefined>(localStorageIfAvailable());
	const [initialPersistence] = useState(() => {
		const metadata = bootstrapAuthoritative ? seedWorkers : [];
		const keys = persistenceKeysForMetadata(metadata);
		const timePresetKeys = persistenceKeysForMetadata(
			metadata,
			cronTimePresetsStorageKey
		);
		return {
			keys,
			timePresetKeys,
			workers: hydrateInitialPersistence(
				createCronStateFromSeed(seedWorkers, bootstrapAuthoritative),
				keys,
				timePresetKeys,
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
	const [timePresetPersistenceKeys, setTimePresetPersistenceKeys] = useState(
		initialPersistence.timePresetKeys
	);
	const persistenceKeysRef = useRef(initialPersistence.keys);
	const timePresetPersistenceKeysRef = useRef(
		initialPersistence.timePresetKeys
	);
	// Unlike the active persistence map, this retains a Worker's last known scope
	// while a refresh temporarily reports no scope, so a later change is detected.
	const lastKnownScopedPersistenceKeys = useRef(initialPersistence.keys);
	const hydratedPersistenceKeys = useRef(
		new Set(Object.values(initialPersistence.keys))
	);
	const lastPersistedCustomRows = useRef(new Map<string, CustomCronRow[]>());
	const hydratedTimePresetPersistenceKeys = useRef(
		new Set(Object.values(initialPersistence.timePresetKeys))
	);
	const lastPersistedTimePresets = useRef(new Map<string, number[]>());
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
	const onWorkerMetadataRef = useRef(onWorkerMetadata);
	const pendingRows = useRef(new Set<string>());
	useEffect(() => {
		onWorkerMetadataRef.current = onWorkerMetadata;
	}, [onWorkerMetadata]);

	useEffect(() => {
		if (!storage.current) {
			return;
		}
		for (const [workerName, key] of Object.entries(persistenceKeys)) {
			if (!hydratedPersistenceKeys.current.has(key)) {
				continue;
			}
			const customRows = workers[workerName]?.customRows ?? [];
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

	useEffect(() => {
		if (!storage.current) {
			return;
		}
		for (const [workerName, key] of Object.entries(timePresetPersistenceKeys)) {
			if (!hydratedTimePresetPersistenceKeys.current.has(key)) {
				continue;
			}
			const timePresets = workers[workerName]?.timePresets ?? [];
			const previous = lastPersistedTimePresets.current.get(key);
			if (
				previous &&
				previous.length === timePresets.length &&
				previous.every((preset, index) => preset === timePresets[index])
			) {
				continue;
			}
			writePersistedCronTimePresets(storage.current, key, timePresets);
			lastPersistedTimePresets.current.set(key, timePresets);
		}
	}, [timePresetPersistenceKeys, workers]);

	const updateRow = useCallback(
		(workerName: string, id: string, update: (row: CronRow) => CronRow) => {
			setWorkers((current) => {
				const entry = current[workerName] ?? emptyState();
				const configuredRows = entry.configuredRows.map((row) => {
					if (row.id !== id) {
						return row;
					}
					const updated = update(row);
					return updated.source === "custom" ? row : updated;
				});
				const customRows = entry.customRows.map((row) => {
					if (row.id !== id) {
						return row;
					}
					const updated = update(row);
					return updated.source === "custom" ? updated : row;
				});
				return {
					...current,
					[workerName]: {
						...entry,
						configuredRows,
						customRows,
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
			onWorkerMetadataRef.current(metadata);
			const visibleWorkers = visibleCronWorkers(metadata);
			setFallbackWorkerName(selectCronFallbackWorker(metadata));
			setVisibleWorkerNames(visibleWorkers.map((worker) => worker.name));
			const previousScopedPersistenceKeys =
				lastKnownScopedPersistenceKeys.current;
			const returnedPersistenceKeys = persistenceKeysForMetadata(metadata);
			const returnedTimePresetPersistenceKeys = persistenceKeysForMetadata(
				metadata,
				cronTimePresetsStorageKey
			);
			const nextPersistenceKeys = reconcilePersistenceKeysForRefresh(
				persistenceKeysRef.current,
				metadata
			);
			const nextTimePresetPersistenceKeys = reconcilePersistenceKeysForRefresh(
				timePresetPersistenceKeysRef.current,
				metadata,
				cronTimePresetsStorageKey
			);
			const persistenceScopeChanged = new Map<string, boolean>();
			const hydratedCustomRows = new Map<string, CustomCronRow[]>();
			const hydratedTimePresets = new Map<string, number[]>();
			for (const worker of metadata) {
				const persistenceKey = returnedPersistenceKeys[worker.name];
				const timePresetPersistenceKey =
					returnedTimePresetPersistenceKeys[worker.name];
				const scopeChanged = didPersistenceScopeChange(
					previousScopedPersistenceKeys[worker.name],
					persistenceKey
				);
				persistenceScopeChanged.set(worker.name, scopeChanged);
				if (
					persistenceKey &&
					(scopeChanged || !hydratedPersistenceKeys.current.has(persistenceKey))
				) {
					hydratedCustomRows.set(
						worker.name,
						storage.current
							? readPersistedCustomCronRows(storage.current, persistenceKey)
							: []
					);
					hydratedPersistenceKeys.current.add(persistenceKey);
				}
				if (
					timePresetPersistenceKey &&
					(scopeChanged ||
						!hydratedTimePresetPersistenceKeys.current.has(
							timePresetPersistenceKey
						))
				) {
					hydratedTimePresets.set(
						worker.name,
						storage.current
							? readPersistedCronTimePresets(
									storage.current,
									timePresetPersistenceKey
								)
							: []
					);
					hydratedTimePresetPersistenceKeys.current.add(
						timePresetPersistenceKey
					);
				}
			}
			setWorkers((current) => {
				const next = { ...current };
				for (const worker of metadata) {
					const entry = current[worker.name] ?? emptyState();
					const crons = worker.triggers?.crons ?? [];
					const scopeChanged =
						persistenceScopeChanged.get(worker.name) ?? false;
					const restoredCustomRows = hydratedCustomRows.get(worker.name);
					const customRows = restoredCustomRows
						? scopeChanged
							? restoredCustomRows
							: [...entry.customRows, ...restoredCustomRows]
						: scopeChanged
							? []
							: entry.customRows;
					const restoredTimePresets = hydratedTimePresets.get(worker.name);
					const timePresets =
						restoredTimePresets ?? (scopeChanged ? [] : entry.timePresets);
					next[worker.name] = {
						authoritative: true,
						configuredRows: reconcileConfiguredRows(
							scopeChanged ? [] : entry.configuredRows,
							crons
						),
						crons,
						customRows,
						stale: false,
						timePresets,
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
			lastKnownScopedPersistenceKeys.current = {
				...previousScopedPersistenceKeys,
				...nextPersistenceKeys,
			};
			persistenceKeysRef.current = nextPersistenceKeys;
			setPersistenceKeys(nextPersistenceKeys);
			timePresetPersistenceKeysRef.current = nextTimePresetPersistenceKeys;
			setTimePresetPersistenceKeys(nextTimePresetPersistenceKeys);
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
	}, [activeWorkerName, refresh]);

	const value = useMemo<CronTriggersContextValue>(
		() => ({
			activeWorkerName,
			addCustom(workerName) {
				const row = createCronRow("");
				setWorkers((current) => {
					const entry = current[workerName] ?? emptyState();
					return {
						...current,
						[workerName]: {
							...entry,
							customRows: [...entry.customRows, row],
						},
					};
				});
				return row.id;
			},
			addTimePreset(workerName, epochMs) {
				if (
					!Number.isSafeInteger(epochMs) ||
					epochMs < MIN_DATE_EPOCH_MS ||
					epochMs > MAX_DATE_EPOCH_MS
				) {
					return;
				}
				setWorkers((current) => {
					const entry = current[workerName] ?? emptyState();
					if (entry.timePresets.includes(epochMs)) {
						return current;
					}
					return {
						...current,
						[workerName]: {
							...entry,
							timePresets: [...entry.timePresets, epochMs],
						},
					};
				});
			},
			entry: (workerName) => workers[workerName] ?? emptyState(),
			fallbackWorkerName,
			isRefreshing: (workerName) => refreshingWorkers.has(workerName),
			async invoke(workerName, id, scheduledTime) {
				const pendingKey = `${workerName}\u0000${id}`;
				const entry = workers[workerName];
				const row = [
					...(entry?.configuredRows ?? []),
					...(entry?.customRows ?? []),
				].find((candidate) => candidate.id === id);
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
					const row = [...entry.configuredRows, ...entry.customRows].find(
						(candidate) => candidate.id === id
					);
					if (!row || row.invocation?.status === "pending") {
						return current;
					}
					return {
						...current,
						[workerName]: {
							...entry,
							configuredRows: entry.configuredRows.filter(
								(candidate) => candidate.id !== id
							),
							customRows: entry.customRows.filter(
								(candidate) => candidate.id !== id
							),
						},
					};
				});
			},
			removeTimePreset(workerName, epochMs) {
				setWorkers((current) => {
					const entry = current[workerName] ?? emptyState();
					return {
						...current,
						[workerName]: {
							...entry,
							timePresets: entry.timePresets.filter(
								(preset) => preset !== epochMs
							),
						},
					};
				});
			},
			updateRow,
			visibleWorkerNames,
		}),
		[
			activeWorkerName,
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
