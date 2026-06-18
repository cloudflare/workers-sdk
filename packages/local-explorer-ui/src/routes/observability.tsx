import { cn } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	PulseIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TraceWaterfall } from "../components/observability/TraceWaterfall";
import {
	findTraceDatabaseId,
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

	const refresh = useCallback(async () => {
		if (!databaseId) {
			return;
		}
		setLoading(true);
		setError(null);
		try {
			setTraces(await listTraces(databaseId));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load traces");
		} finally {
			setLoading(false);
		}
	}, [databaseId]);

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
			<header className="flex min-h-14 items-center gap-2.5 border-b px-4">
				<PulseIcon size={18} className="text-text-secondary" />
				<div className="flex flex-col">
					<h2 className="text-text text-sm leading-tight font-semibold">
						Traces
					</h2>
					<span className="text-text-secondary text-[11px] leading-tight">
						{traces.length} trace{traces.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<button
					type="button"
					onClick={() => void refresh()}
					className="text-text-secondary hover:bg-kumo-tint hover:text-text flex items-center gap-1.5 rounded px-2 py-1 text-xs"
				>
					<ArrowsCounterClockwiseIcon
						size={13}
						className={loading ? "animate-spin" : undefined}
					/>
					Refresh
				</button>
			</header>

			<div className="flex-1 overflow-y-auto p-4">
				{error ? (
					<div className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-500">
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
					<div className="bg-kumo-elevated overflow-hidden rounded-lg border">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-text-secondary border-b text-left text-[11px] uppercase tracking-wide">
									<th className="px-3 py-2 font-medium">Operation</th>
									<th className="w-56 px-3 py-2 font-medium">Duration</th>
									<th className="w-24 px-3 py-2 font-medium">Status</th>
									<th className="w-20 px-3 py-2 font-medium">Spans</th>
									<th className="w-44 px-3 py-2 font-medium">Time</th>
								</tr>
							</thead>
							<tbody>
								{traces.map((t) => {
									const isSel = selected?.trace_id === t.trace_id;
									const dur = t.duration_ms ?? 0;
									return (
										<tr
											key={t.trace_id}
											onClick={() => void selectTrace(t)}
											className={cn(
												"hover:bg-kumo-tint cursor-pointer border-b last:border-0",
												isSel && "bg-blue-100 dark:bg-blue-900/30"
											)}
										>
											<td className="text-text px-3 py-2 font-mono text-xs">
												{t.name ?? t.trace_id.slice(0, 16)}
											</td>
											<td className="px-3 py-2">
												<div className="flex items-center gap-2">
													<span className="text-text w-14 shrink-0 text-right text-xs tabular-nums">
														{Math.round(dur)}ms
													</span>
													<div className="bg-kumo-fill h-1.5 flex-1 overflow-hidden rounded-full">
														<div
															className="bg-indigo-500 h-full rounded-full"
															style={{
																width: `${Math.max((dur / maxDuration) * 100, 2)}%`,
															}}
														/>
													</div>
												</div>
											</td>
											<td className="px-3 py-2">
												<StatusBadge
													statusCode={t.status_code}
													outcome={t.outcome}
												/>
											</td>
											<td className="text-text-secondary px-3 py-2 text-xs tabular-nums">
												{t.span_count ?? "-"}
											</td>
											<td className="text-text-secondary px-3 py-2 text-xs">
												{t.created_at ?? ""}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}

				{selected && spans.length > 0 ? (
					<div className="mt-6">
						<div className="mb-2 flex items-baseline gap-2">
							<span className="text-text font-mono text-sm font-semibold">
								{selected.name ?? selected.trace_id}
							</span>
							<span className="text-text-secondary font-mono text-[11px]">
								{selected.trace_id.slice(0, 16)}
							</span>
							<span className="text-text-secondary text-[11px]">
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

function StatusBadge({
	statusCode,
	outcome,
}: {
	statusCode: number | null;
	outcome: string | null;
}): JSX.Element {
	const code = statusCode ?? 0;
	const label = statusCode ? String(statusCode) : (outcome ?? "?");
	let cls = "bg-gray-500/15 text-text-secondary";
	if (code >= 500) {
		cls = "bg-red-500/15 text-red-500";
	} else if (code >= 400) {
		cls = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
	} else if (code >= 200) {
		cls = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
	}
	return (
		<span
			className={cn(
				"inline-block rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
				cls
			)}
		>
			{label}
		</span>
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
			<PulseIcon size={28} className="text-text-secondary mb-2" />
			<h3 className="text-text text-sm font-semibold">{title}</h3>
			<p className="text-text-secondary mt-1 max-w-md text-xs">{body}</p>
		</div>
	);
}
