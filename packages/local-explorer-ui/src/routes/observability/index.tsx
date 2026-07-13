import { cn } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	EyeSlashIcon,
	MagnifyingGlassIcon,
	PulseIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FilterSelect } from "../../components/observability/FilterSelect";
import { TraceWaterfall } from "../../components/observability/TraceWaterfall";
import { ResourceError } from "../../components/ResourceError";
import {
	fetchTraceSpans,
	formatDuration,
	getInvocationRootIds,
	getTagKeys,
	listTraces,
} from "../../utils/observability";
import type { Span, TraceRow } from "../../utils/observability";
import { parseTraceQuery } from "../../utils/observability-query";

const HIDE_DEV_RUNNER_KEY = "wobs-hide-dev-runner";

export const Route = createFileRoute("/observability/")({
	component: ObservabilityView,
	errorComponent: ResourceError,
});

function isError(t: TraceRow): boolean {
	return !!t.error || (!!t.outcome && t.outcome !== "ok") || (t.error_count ?? 0) > 0;
}

/**
 * A distributed trace can span multiple invocations (e.g. a subrequest/self
 * fetch) that share a trace_id but have different root spans, so a row's
 * identity is the (trace_id, root_span_id) pair.
 */
function traceKey(t: Pick<TraceRow, "trace_id" | "root_span_id">): string {
	return `${t.trace_id}:${t.root_span_id}`;
}

function ObservabilityView(): JSX.Element {
	const [traces, setTraces] = useState<TraceRow[]>([]);
	// Traces can be expanded independently — multiple waterfalls open at once.
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [spansByTrace, setSpansByTrace] = useState<Record<string, Span[]>>({});
	const [invocationRootsByTrace, setInvocationRootsByTrace] = useState<
		Record<string, string[]>
	>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Hide Vite dev module-runner plumbing spans (default on; persisted).
	const [hideDevRunner, setHideDevRunner] = useState(() => {
		try {
			return localStorage.getItem(HIDE_DEV_RUNNER_KEY) !== "false";
		} catch {
			return true;
		}
	});
	const toggleHideDevRunner = useCallback(() => {
		setHideDevRunner((prev) => {
			const next = !prev;
			try {
				localStorage.setItem(HIDE_DEV_RUNNER_KEY, String(next));
			} catch {
				// ignore
			}
			return next;
		});
	}, []);

	// filters (a simpler version of the dashboard query builder)
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
		void getTagKeys()
			.then(setTagKeys)
			.catch(() => setTagKeys([]));
	}, []);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const parsed = parseTraceQuery(debouncedSearch);
			setTraces(
				await listTraces({
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
	}, [debouncedSearch, status, kind, tagKey, debouncedTagValue]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Auto-refresh the trace list so new traces appear without clicking Refresh.
	useEffect(() => {
		const id = setInterval(() => void refresh(), 3000);
		return () => clearInterval(id);
	}, [refresh]);

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
			if (isOpen || spansByTrace[key]) {
				return;
			}
			try {
				const [rows, roots] = await Promise.all([
					fetchTraceSpans(trace.trace_id),
					getInvocationRootIds(trace.trace_id),
				]);
				setSpansByTrace((prev) => ({ ...prev, [key]: rows }));
				setInvocationRootsByTrace((prev) => ({ ...prev, [key]: roots }));
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to load spans");
			}
		},
		[expanded, spansByTrace]
	);

	const maxDuration = useMemo(
		() => Math.max(1, ...traces.map((t) => t.duration_ms ?? 0)),
		[traces]
	);

	return (
		<div className="flex h-full flex-col">
			<header className="border-kumo-fill flex min-h-14 items-center gap-2.5 border-b px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<span className="text-kumo-default pl-1 text-sm leading-tight font-semibold">
						Traces
					</span>
					<span className="text-kumo-subtle pl-1 text-[11px] leading-tight">
						{traces.length} trace{traces.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<button
					type="button"
					onClick={toggleHideDevRunner}
					title="Hide Vite dev module-runner plumbing spans (vite dev only)"
					className={cn(
						"flex items-center gap-1.5 rounded px-2 py-1 text-xs",
						hideDevRunner
							? "bg-kumo-tint text-kumo-default"
							: "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
					)}
				>
					<EyeSlashIcon size={13} />
					Hide runner spans
				</button>
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
						placeholder="Search, or query e.g. status:error kind:d1 dur:>100 db.query.text:orders"
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
								return (
									<Fragment key={key}>
										<tr
											onClick={() => void toggleTrace(t)}
											className={cn(
												"border-kumo-fill cursor-pointer border-b hover:bg-black/[0.03] dark:hover:bg-white/5",
												isSel && "bg-blue-100 dark:bg-blue-900/30"
											)}
										>
											<td className="py-2.5 pr-3 pl-4">
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
											<td className="text-kumo-default py-2.5 pr-3 font-mono text-xs">
												{t.name ?? t.trace_id.slice(0, 16)}
											</td>
											<td className="py-2.5 pr-3">
												<div className="flex flex-col gap-1">
													<div className="text-sm tabular-nums">
														{formatDuration(dur)}
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
											<td className="text-kumo-default py-2.5 pr-3 text-xs tabular-nums">
												{t.span_count ?? "-"}
											</td>
											<td className="py-2.5 pr-3 text-xs tabular-nums">
												{(t.error_count ?? 0) > 0 ? (
													<span className="text-red-500">{t.error_count}</span>
												) : (
													<span className="text-kumo-subtle">-</span>
												)}
											</td>
										</tr>
										{isSel && spans.length > 0 ? (
											<tr className="bg-black/[0.02] dark:bg-white/[0.02]">
												<td colSpan={5} className="border-kumo-fill border-b p-4">
													<div className="mb-2 flex items-baseline gap-2">
														<span className="text-kumo-default font-mono text-sm font-semibold">
															{t.name ?? t.trace_id}
														</span>
														<span className="text-kumo-subtle font-mono text-[11px]">
															{t.trace_id.slice(0, 16)}
														</span>
														<span className="text-kumo-subtle text-[11px]">
															· {formatDuration(dur)} ·{" "}
															{t.span_count ?? spans.length} spans
														</span>
													</div>
													<TraceWaterfall
														key={key}
														spans={spans}
														rootSpanId={t.root_span_id}
														traceDurationMs={dur}
														invocationRootIds={invocationRootsByTrace[key]}
														hideDevRunner={hideDevRunner}
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
