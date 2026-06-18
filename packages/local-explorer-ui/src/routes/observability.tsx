import { cn } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	MagnifyingGlassIcon,
	PulseIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterSelect } from "../components/observability/FilterSelect";
import { TraceWaterfall } from "../components/observability/TraceWaterfall";
import {
	findTraceDatabaseId,
	getTagKeys,
	getTraceSpans,
	listTraces,
	type SpanRow,
	type TraceRow,
} from "../lib/traces";

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

function ObservabilityView(): JSX.Element {
	const rootData = rootRoute.useLoaderData();

	const databaseId = useMemo(() => {
		for (const worker of rootData.workers) {
			const id = findTraceDatabaseId(worker.bindings);
			if (id) {
				return id;
			}
		}
		return undefined;
	}, [rootData.workers]);

	const [traces, setTraces] = useState<TraceRow[]>([]);
	const [selected, setSelected] = useState<TraceRow | null>(null);
	const [spans, setSpans] = useState<SpanRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			setTraces(
				await listTraces(databaseId, {
					search: debouncedSearch,
					status,
					kind,
					tagKey,
					tagValue: debouncedTagValue,
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

	const selectTrace = useCallback(
		async (trace: TraceRow) => {
			setSelected(trace);
			setSpans([]);
			if (!databaseId) {
				return;
			}
			try {
				setSpans(await getTraceSpans(databaseId, trace.trace_id));
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to load spans");
			}
		},
		[databaseId]
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
			<header className="border-kumo-fill flex min-h-14 items-center gap-2.5 border-b px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<h2 className="text-kumo-default text-sm font-semibold leading-tight">
						Traces
					</h2>
					<span className="text-kumo-subtle text-[11px] leading-tight">
						{traces.length} trace{traces.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<button
					type="button"
					onClick={() => void refresh()}
					className="text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default flex items-center gap-1.5 rounded px-2 py-1 text-xs"
				>
					<ArrowsCounterClockwiseIcon
						size={13}
						className={loading ? "animate-spin" : undefined}
					/>
					Refresh
				</button>
			</header>

			{/* filter bar — a simpler version of the dashboard query builder */}
			<div className="border-kumo-fill flex items-center gap-2 border-b px-4 py-2">
				<div className="border-kumo-fill bg-kumo-base flex flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5">
					<MagnifyingGlassIcon size={14} className="text-kumo-subtle shrink-0" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search operation, span name, or attributes (e.g. a D1 query, a URL)…"
						className="text-kumo-default placeholder:text-kumo-subtle w-full bg-transparent text-xs outline-none"
					/>
					{search ? (
						<button
							type="button"
							onClick={() => setSearch("")}
							className="text-kumo-subtle hover:text-kumo-default text-xs"
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
						className="border-kumo-fill bg-kumo-base text-kumo-default placeholder:text-kumo-subtle w-40 rounded-md border px-2 py-1.5 text-xs outline-none"
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
							<tr className="text-kumo-subtle border-kumo-fill border-y text-left text-xs">
								<th className="py-2 pl-4 pr-3 font-medium">
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
								const isSel = selected?.trace_id === t.trace_id;
								const err = isError(t);
								const dur = t.duration_ms ?? 0;
								const { value, unit } = splitDuration(dur);
								return (
									<tr
										key={t.trace_id}
										onClick={() => void selectTrace(t)}
										className={cn(
											"border-kumo-fill hover:bg-black/[0.03] dark:hover:bg-white/5 cursor-pointer border-b",
											isSel && "bg-blue-100 dark:bg-blue-900/30"
										)}
									>
										{/* Timestamp + left accent bar */}
										<td className="py-2.5 pl-4 pr-3">
											<div className="flex items-center gap-2.5">
												<span
													className={cn(
														"h-4 w-[3px] shrink-0 rounded-full",
														err ? "bg-red-500" : "bg-blue-500"
													)}
												/>
												<span className="text-kumo-default decoration-kumo-line font-mono text-xs underline decoration-dotted underline-offset-2">
													{t.created_at ?? ""}
													<span className="text-kumo-subtle"> UTC</span>
												</span>
											</div>
										</td>
										{/* Operation */}
										<td className="text-kumo-default py-2.5 pr-3 font-mono text-xs">
											{t.name ?? t.trace_id.slice(0, 16)}
										</td>
										{/* Duration: number + faded unit, gauge below */}
										<td className="py-2.5 pr-3">
											<div className="flex flex-col gap-1">
												<div className="text-sm tabular-nums">
													<span className="text-kumo-default">{value}</span>
													<span className="text-kumo-subtle">{unit}</span>
												</div>
												<div className="bg-kumo-fill h-1 w-24 overflow-hidden rounded-full">
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
										<td className="text-kumo-default py-2.5 pr-3 text-xs tabular-nums">
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
								);
							})}
						</tbody>
					</table>
				)}

				{selected && spans.length > 0 ? (
					<div className="border-kumo-fill mt-2 border-t p-4">
						<div className="mb-2 flex items-baseline gap-2">
							<span className="text-kumo-default font-mono text-sm font-semibold">
								{selected.name ?? selected.trace_id}
							</span>
							<span className="text-kumo-subtle font-mono text-[11px]">
								{selected.trace_id.slice(0, 16)}
							</span>
							<span className="text-kumo-subtle text-[11px]">
								· {Math.round(selected.duration_ms ?? 0)}ms ·{" "}
								{selected.span_count ?? spans.length} spans
							</span>
						</div>
						<TraceWaterfall
							spans={spans}
							rootSpanId={selected.root_span_id}
							traceDurationMs={selected.duration_ms ?? 0}
						/>
					</div>
				) : null}
			</div>
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
			<PulseIcon size={28} className="text-kumo-subtle mb-2" />
			<h3 className="text-kumo-default text-sm font-semibold">{title}</h3>
			<p className="text-kumo-subtle mt-1 max-w-md text-xs">{body}</p>
		</div>
	);
}
