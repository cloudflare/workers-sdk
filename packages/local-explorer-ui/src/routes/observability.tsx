import { cn } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	MagnifyingGlassIcon,
	PulseIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FilterSelect } from "../components/observability/FilterSelect";
import { ObservabilityViewSwitcher } from "../components/observability/ObservabilityViewSwitcher";
import { TraceWaterfall } from "../components/observability/TraceWaterfall";
import { parseTraceQuery } from "../lib/query";
import {
	clearTraces,
	findTraceDatabaseId,
	getInvocationRootIds,
	getTagKeys,
	getTraceSpans,
	listTraces,
	type SpanRow,
	type TraceRow,
} from "../lib/traces";

const SKIP_CLEAR_CONFIRM_KEY = "wobs-skip-clear-confirm";

export const Route = createFileRoute("/observability")({
	component: ObservabilityView,
	validateSearch: (search): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

function splitDuration(ms: number): { value: string; unit: string } {
	if (ms >= 1000) {
		return { value: (ms / 1000).toFixed(2), unit: "s" };
	}
	return { value: String(Math.round(ms)), unit: "ms" };
}

function isError(t: TraceRow): boolean {
	return (!!t.outcome && t.outcome !== "ok") || (t.status_code ?? 0) >= 400;
}

/**
 * A single distributed trace can span multiple invocations (e.g. a
 * subrequest/self-fetch) that share a trace_id but have different root spans, so
 * a row's identity is the (trace_id, root_span_id) pair.
 */
function traceKey(t: Pick<TraceRow, "trace_id" | "root_span_id">): string {
	return `${t.trace_id}:${t.root_span_id}`;
}

function ObservabilityView(): JSX.Element {
	const rootData = rootRoute.useLoaderData();
	const { worker } = Route.useSearch();

	const databaseId = useMemo(() => {
		for (const w of rootData.workers) {
			const id = findTraceDatabaseId(w.bindings);
			if (id) {
				return id;
			}
		}
		return undefined;
	}, [rootData.workers]);

	const [traces, setTraces] = useState<TraceRow[]>([]);
	// Traces can be expanded independently — multiple waterfalls open at once.
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [spansByTrace, setSpansByTrace] = useState<Record<string, SpanRow[]>>(
		{}
	);
	// Invocation root span ids per trace, used to delineate worker boundaries.
	const [invocationRootsByTrace, setInvocationRootsByTrace] = useState<
		Record<string, string[]>
	>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmingClear, setConfirmingClear] = useState(false);
	const [skipClearConfirm, setSkipClearConfirm] = useState(false);

	// filters (simpler version of the dashboard query builder)
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [status, setStatus] = useState<"all" | "success" | "error">("all");
	const [kind, setKind] = useState("all");
	const [tagKey, setTagKey] = useState("all");
	const [tagValue, setTagValue] = useState("");
	const [debouncedTagValue, setDebouncedTagValue] = useState("");
	const [tagKeys, setTagKeys] = useState<string[]>([]);

	useEffect(() => {
		const id = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(id);
	}, [search]);

	useEffect(() => {
		const id = setTimeout(() => setDebouncedTagValue(tagValue), 300);
		return () => clearTimeout(id);
	}, [tagValue]);

	useEffect(() => {
		if (!databaseId) {
			return;
		}
		void getTagKeys(databaseId)
			.then(setTagKeys)
			.catch(() => setTagKeys([]));
	}, [databaseId]);

	const refresh = useCallback(async () => {
		if (!databaseId) {
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const parsed = parseTraceQuery(debouncedSearch);
			setTraces(
				await listTraces(databaseId, {
					search: parsed.text,
					status: parsed.status ?? status,
					kind: parsed.kind ?? kind,
					tagKey,
					tagValue: debouncedTagValue,
					clauses: parsed.clauses,
				})
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load traces");
		} finally {
			setLoading(false);
		}
	}, [databaseId, debouncedSearch, status, kind, tagKey, debouncedTagValue]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// auto-refresh the trace list so new traces appear without clicking Refresh
	useEffect(() => {
		const id = setInterval(() => void refresh(), 3000);
		return () => clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		try {
			setSkipClearConfirm(localStorage.getItem(SKIP_CLEAR_CONFIRM_KEY) === "1");
		} catch {
			// localStorage unavailable — ignore
		}
	}, []);

	// Wipe all captured traces/spans/logs from the store, then refresh.
	const doClear = useCallback(async () => {
		if (!databaseId) {
			return;
		}
		setExpanded(new Set());
		setSpansByTrace({});
		try {
			await clearTraces(databaseId);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to clear traces");
		}
		await refresh();
	}, [databaseId, refresh]);

	// "Clear" button: skip the dialog if the user opted out previously.
	const requestClear = useCallback(() => {
		if (skipClearConfirm) {
			void doClear();
		} else {
			setConfirmingClear(true);
		}
	}, [skipClearConfirm, doClear]);

	// Toggle a trace's waterfall open/closed. Multiple can be open at once and
	// each stays open until clicked again.
	const toggleTrace = useCallback(
		async (trace: TraceRow) => {
			const key = traceKey(trace);
			const isOpen = expanded.has(key);
			setExpanded((prev) => {
				const next = new Set(prev);
				if (isOpen) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			});
			// Only fetch spans when opening, and only once per trace.
			if (isOpen || !databaseId || spansByTrace[key]) {
				return;
			}
			try {
				const [rows, roots] = await Promise.all([
					getTraceSpans(databaseId, trace.trace_id),
					getInvocationRootIds(databaseId, trace.trace_id),
				]);
				setSpansByTrace((prev) => ({ ...prev, [key]: rows }));
				setInvocationRootsByTrace((prev) => ({ ...prev, [key]: roots }));
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to load spans");
			}
		},
		[databaseId, expanded, spansByTrace]
	);

	const maxDuration = useMemo(
		() => Math.max(1, ...traces.map((t) => t.duration_ms ?? 0)),
		[traces]
	);

	if (!databaseId) {
		return (
			<EmptyState
				title="No trace store found"
				body="Run a Worker with the local trace collector attached (a D1 binding whose name contains “trace”). Once requests are traced, they'll appear here."
			/>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<ObservabilityViewSwitcher current="traces" worker={worker} />
					<span className="pl-1 text-[11px] leading-tight text-kumo-subtle">
						{traces.length} trace{traces.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<button
					type="button"
					onClick={() => void refresh()}
					className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
				>
					<ArrowsCounterClockwiseIcon
						size={13}
						className={loading ? "animate-spin" : undefined}
					/>
					Refresh
				</button>
				<button
					type="button"
					onClick={requestClear}
					disabled={traces.length === 0}
					className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-kumo-subtle hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-kumo-subtle"
				>
					<TrashIcon size={13} />
					Clear
				</button>
			</header>

			{/* filter bar — a simpler version of the dashboard query builder */}
			<div className="flex items-center gap-2 border-b border-kumo-fill px-4 py-2">
				<div className="flex flex-1 items-center gap-2 rounded-md border border-kumo-fill bg-kumo-base px-2.5 py-1.5">
					<MagnifyingGlassIcon
						size={14}
						className="shrink-0 text-kumo-subtle"
					/>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search, or query e.g. status:error kind:d1 dur:>100 db.query.text:orders"
						className="w-full bg-transparent text-xs text-kumo-default outline-none placeholder:text-kumo-subtle"
					/>
					{search ? (
						<button
							type="button"
							onClick={() => setSearch("")}
							className="text-xs text-kumo-subtle hover:text-kumo-default"
						>
							✕
						</button>
					) : null}
				</div>
				<FilterSelect
					value={status}
					onChange={(v) => setStatus(v as typeof status)}
					options={[
						["all", "All statuses"],
						["success", "Success"],
						["error", "Errors"],
					]}
				/>
				<FilterSelect
					value={kind}
					onChange={setKind}
					options={[
						["all", "All types"],
						["http", "HTTP"],
						["fetch", "Fetch"],
						["d1", "D1"],
						["kv", "KV"],
						["r2", "R2"],
						["do", "Durable Object"],
					]}
				/>
				<FilterSelect
					value={tagKey}
					onChange={(v) => {
						setTagKey(v);
						if (v === "all") {
							setTagValue("");
						}
					}}
					options={[
						["all", "All tags"],
						...tagKeys.map((k) => [k, k] as [string, string]),
					]}
				/>
				{tagKey !== "all" ? (
					<input
						value={tagValue}
						onChange={(e) => setTagValue(e.target.value)}
						placeholder={`${tagKey} value…`}
						className="w-40 rounded-md border border-kumo-fill bg-kumo-base px-2 py-1.5 text-xs text-kumo-default outline-none placeholder:text-kumo-subtle"
					/>
				) : null}
			</div>

			<div className="flex-1 overflow-y-auto">
				{error ? (
					<div className="mx-4 mt-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-500">
						{error}
					</div>
				) : null}

				{traces.length === 0 && !loading ? (
					<EmptyState
						title="No traces yet"
						body="Send some requests to your Worker (with observability traces enabled) and they'll show up here."
						inline
					/>
				) : (
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-y border-kumo-fill text-left text-xs text-kumo-subtle">
								<th className="py-2 pr-3 pl-4 font-medium">
									<span className="inline-flex items-center gap-1">
										Timestamp <span className="text-blue-500">↓</span>
									</span>
								</th>
								<th className="py-2 pr-3 font-medium">Operation</th>
								<th className="w-48 py-2 pr-3 font-medium">Duration (ms)</th>
								<th className="w-20 py-2 pr-3 font-medium">Spans</th>
								<th className="w-24 py-2 pr-3 font-medium">Errors</th>
							</tr>
						</thead>
						<tbody>
							{traces.map((t) => {
								const key = traceKey(t);
								const isSel = expanded.has(key);
								const spans = spansByTrace[key] ?? [];
								const err = isError(t);
								const dur = t.duration_ms ?? 0;
								const { value, unit } = splitDuration(dur);
								return (
									<Fragment key={key}>
										<tr
											onClick={() => void toggleTrace(t)}
											className={cn(
												"cursor-pointer border-b border-kumo-fill hover:bg-black/[0.03] dark:hover:bg-white/5",
												isSel && "bg-blue-100 dark:bg-blue-900/30"
											)}
										>
											{/* Timestamp + left accent bar */}
											<td className="py-2.5 pr-3 pl-4">
												<div className="flex items-center gap-2.5">
													<span
														className={cn(
															"h-4 w-[3px] shrink-0 rounded-full",
															err ? "bg-red-500" : "bg-blue-500"
														)}
													/>
													<span className="font-mono text-xs text-kumo-default underline decoration-kumo-line decoration-dotted underline-offset-2">
														{t.created_at ?? ""}
														<span className="text-kumo-subtle"> UTC</span>
													</span>
												</div>
											</td>
											{/* Operation */}
											<td className="py-2.5 pr-3 font-mono text-xs text-kumo-default">
												{t.name ?? t.trace_id.slice(0, 16)}
											</td>
											{/* Duration: number + faded unit, gauge below */}
											<td className="py-2.5 pr-3">
												<div className="flex flex-col gap-1">
													<div className="text-sm tabular-nums">
														<span className="text-kumo-default">{value}</span>
														<span className="text-kumo-subtle">{unit}</span>
													</div>
													<div className="h-1 w-24 overflow-hidden rounded-full bg-kumo-fill">
														<div
															className="h-full rounded-full bg-blue-500"
															style={{
																width: `${Math.max((dur / maxDuration) * 100, 2)}%`,
															}}
														/>
													</div>
												</div>
											</td>
											{/* Spans */}
											<td className="py-2.5 pr-3 text-xs text-kumo-default tabular-nums">
												{t.span_count ?? "-"}
											</td>
											{/* Errors */}
											<td className="py-2.5 pr-3 text-xs tabular-nums">
												{err ? (
													<span className="text-red-500">1</span>
												) : (
													<span className="text-kumo-subtle">-</span>
												)}
											</td>
										</tr>
										{isSel && spans.length > 0 ? (
											<tr className="bg-black/[0.02] dark:bg-white/[0.02]">
												<td
													colSpan={5}
													className="border-b border-kumo-fill p-4"
												>
													<div className="mb-2 flex items-baseline gap-2">
														<span className="font-mono text-sm font-semibold text-kumo-default">
															{t.name ?? t.trace_id}
														</span>
														<span className="font-mono text-[11px] text-kumo-subtle">
															{t.trace_id.slice(0, 16)}
														</span>
														<span className="text-[11px] text-kumo-subtle">
															· {Math.round(t.duration_ms ?? 0)}ms ·{" "}
															{t.span_count ?? spans.length} spans
														</span>
													</div>
													<TraceWaterfall
														key={key}
														spans={spans}
														rootSpanId={t.root_span_id}
														traceDurationMs={t.duration_ms ?? 0}
														invocationRootIds={invocationRootsByTrace[key]}
													/>
												</td>
											</tr>
										) : null}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				)}
			</div>

			{confirmingClear ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
					onClick={() => setConfirmingClear(false)}
				>
					<div
						className="w-[90%] max-w-md rounded-xl border border-kumo-fill bg-kumo-base p-5 shadow-lg"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 className="text-sm font-semibold text-kumo-default">
							Clear all captured requests?
						</h3>
						<p className="mt-2 text-xs text-kumo-subtle">
							This permanently deletes every trace, span, and log from the local
							observability store. This cannot be undone.
						</p>
						<label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-kumo-subtle select-none">
							<input
								type="checkbox"
								checked={skipClearConfirm}
								onChange={(e) => setSkipClearConfirm(e.target.checked)}
							/>
							Don't show this message again
						</label>
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirmingClear(false)}
								className="rounded-md border border-kumo-fill px-3 py-1.5 text-xs text-kumo-default hover:bg-kumo-tint"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => {
									try {
										if (skipClearConfirm) {
											localStorage.setItem(SKIP_CLEAR_CONFIRM_KEY, "1");
										} else {
											localStorage.removeItem(SKIP_CLEAR_CONFIRM_KEY);
										}
									} catch {
										// ignore
									}
									setConfirmingClear(false);
									void doClear();
								}}
								className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
							>
								Clear everything
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

function EmptyState({
	title,
	body,
	inline,
}: {
	title: string;
	body: string;
	inline?: boolean;
}): JSX.Element {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center",
				inline ? "py-16" : "h-full"
			)}
		>
			<PulseIcon size={28} className="mb-2 text-kumo-subtle" />
			<h3 className="text-sm font-semibold text-kumo-default">{title}</h3>
			<p className="mt-1 max-w-md text-xs text-kumo-subtle">{body}</p>
		</div>
	);
}
