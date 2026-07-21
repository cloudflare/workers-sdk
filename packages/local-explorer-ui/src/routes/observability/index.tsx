import {
	Button,
	cn,
	InputGroup,
	Popover,
	RefreshButton,
} from "@cloudflare/kumo";
import {
	EyeIcon,
	EyeSlashIcon,
	InfoIcon,
	MagnifyingGlassIcon,
	PulseIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { FilterSelect } from "../../components/observability/FilterSelect";
import { ObservabilityViewSwitcher } from "../../components/observability/ObservabilityViewSwitcher";
import { TraceWaterfall } from "../../components/observability/TraceWaterfall";
import { ResourceError } from "../../components/ResourceError";
import {
	clearTraces,
	fetchTraceSpans,
	formatDuration,
	getInvocationRootIds,
	getTagKeys,
	isObservabilityDisabledError,
	isRunning,
	isViteWrapperSpan,
	listTraces,
	operationLabel,
	spanIsError,
	traceExtentMs,
	visibleTraceSpans,
} from "../../utils/observability";
import { parseTraceQuery } from "../../utils/observability-query";
import type { Span, TraceRow } from "../../utils/observability";
import type { JSX } from "react";

const HIDE_DEV_RUNNER_KEY = "wobs-hide-dev-runner";

export const Route = createFileRoute("/observability/")({
	component: ObservabilityView,
	errorComponent: ResourceError,
});

function isError(t: TraceRow): boolean {
	// The root row itself may be an error (including a 4xx/5xx response the
	// handler returned without throwing), or any span in the trace may have
	// failed (`error_count`, computed by the same rule in the trace-list query).
	return spanIsError(t) || (t.error_count ?? 0) > 0;
}

/** Duration split into its number and unit, so the unit can be rendered faded. */
function splitDuration(ms: number): { value: string; unit: string } {
	if (ms >= 1000) {
		return { value: (ms / 1000).toFixed(2), unit: "s" };
	}
	return { value: String(Math.round(ms)), unit: "ms" };
}

/**
 * A distributed trace can span multiple invocations (e.g. a subrequest/self
 * fetch) that share a trace_id but have different root spans, so a row's
 * identity is the (trace_id, root_span_id) pair.
 */
function traceKey(t: Pick<TraceRow, "trace_id" | "root_span_id">): string {
	return `${t.trace_id}:${t.root_span_id}`;
}

/**
 * Whether a trace is done changing, so its cached spans don't need re-fetching.
 * A trace is settled once its root span has a final outcome, the list row's
 * span_count matches the spans we've cached (nothing new was written), and no
 * cached span is still running. Anything else is still being written by
 * write-through capture and its open waterfall should keep refreshing.
 */
function traceSettled(row: TraceRow, cachedSpans: Span[]): boolean {
	if (!row.outcome) {
		return false;
	}
	if ((row.span_count ?? cachedSpans.length) !== cachedSpans.length) {
		return false;
	}
	return !cachedSpans.some(isRunning);
}

function ObservabilityView(): JSX.Element {
	const [traces, setTraces] = useState<TraceRow[]>([]);
	// Traces can be expanded independently — multiple waterfalls open at once.
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [spansByTrace, setSpansByTrace] = useState<Record<string, Span[]>>({});
	const [invocationRootsByTrace, setInvocationRootsByTrace] = useState<
		Record<string, string[]>
	>({});
	// The auto-refresh effect below reads the current spans cache without taking
	// it as a dependency — otherwise each re-fetch would immediately re-trigger
	// the effect into a tight loop. Mirror it into a ref (kept current every
	// render) so the effect can consult the latest cache on the list cadence.
	const spansByTraceRef = useRef(spansByTrace);
	spansByTraceRef.current = spansByTrace;
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Capture is off (no collector bound). We show an "off" panel instead of the
	// trace list, and pause polling so we don't hammer a disabled endpoint.
	const [disabled, setDisabled] = useState(false);
	const [clearing, setClearing] = useState(false);
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
	// Session-only dismissal of the "running under Vite dev" notice.
	const [viteNoticeDismissed, setViteNoticeDismissed] = useState(false);

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
			setDisabled(false);
		} catch (e) {
			if (isObservabilityDisabledError(e)) {
				// Capture is off — show the "off" panel, not a scary error.
				setDisabled(true);
				setError(null);
			} else {
				setError(e instanceof Error ? e.message : "Failed to load traces");
			}
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, status, kind, tagKey, debouncedTagValue]);

	const handleClear = useCallback(async () => {
		setClearing(true);
		try {
			await clearTraces();
			// Drop cached spans/waterfalls too, then reload the (now empty) list.
			setExpanded(new Set());
			setSpansByTrace({});
			setInvocationRootsByTrace({});
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to clear traces");
		} finally {
			setClearing(false);
		}
	}, [refresh]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Auto-refresh the trace list so new traces appear without clicking Refresh.
	// Paused while capture is disabled to avoid polling a dead endpoint.
	useEffect(() => {
		if (disabled) {
			return;
		}
		const id = setInterval(() => void refresh(), 3000);
		return () => clearInterval(id);
	}, [refresh, disabled]);

	// Fetch (or re-fetch) a trace's spans + invocation roots and cache them.
	const loadSpans = useCallback(async (trace: TraceRow) => {
		const key = traceKey(trace);
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
	}, []);

	// Toggle a trace's waterfall open/closed. Multiple can be open at once and
	// each stays open until clicked again.
	const toggleTrace = useCallback(
		async (trace: TraceRow) => {
			const key = traceKey(trace);
			// Toggle from the updater's `prev` (not a captured snapshot) so a rapid
			// double-click toggles closed correctly. Keep the updater pure — under
			// StrictMode it runs twice, so it must not touch outer state.
			setExpanded((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			});
			// Load a trace's spans lazily on first open. Later refreshes (while it
			// stays open and is still being written) are driven by the effect below,
			// so a click that's closing an already-loaded trace does nothing here.
			if (spansByTrace[key]) {
				return;
			}
			await loadSpans(trace);
		},
		[spansByTrace, loadSpans]
	);

	// Keep expanded waterfalls live. The 3s auto-refresh only reloads the trace
	// list, but a trace opened while it's still running keeps gaining/updating
	// spans in the store (write-through capture). On each list refresh, re-fetch
	// spans for any expanded trace that isn't settled yet; settled traces are
	// left alone so completed waterfalls aren't refetched needlessly.
	useEffect(() => {
		for (const trace of traces) {
			const key = traceKey(trace);
			if (!expanded.has(key)) {
				continue;
			}
			const cached = spansByTraceRef.current[key];
			// Not loaded yet — the initial lazy load in toggleTrace handles it.
			if (!cached) {
				continue;
			}
			if (traceSettled(trace, cached)) {
				continue;
			}
			void loadSpans(trace);
		}
	}, [traces, expanded, loadSpans]);

	const maxDuration = useMemo(
		() => Math.max(1, ...traces.map((t) => t.duration_ms ?? 0)),
		[traces]
	);

	// Detect a Vite dev session from the data: Vite routes every request through
	// its router/asset workers, so any HTTP trace is rooted in an infra worker.
	// (Internally-triggered traces — alarm/queue/cron — are rooted in the user
	// worker, but a real session always has at least one request too.)
	const isViteDev = useMemo(
		() => traces.some((t) => isViteWrapperSpan(t)),
		[traces]
	);
	const showViteNotice = isViteDev && !viteNoticeDismissed;

	if (disabled) {
		return <ObservabilityDisabled />;
	}

	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<ObservabilityViewSwitcher current="traces" />
					<span className="pl-1 text-[11px] leading-tight text-kumo-subtle">
						{traces.length} trace{traces.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<Button
					size="sm"
					variant={hideDevRunner ? "secondary" : "ghost"}
					icon={hideDevRunner ? EyeIcon : EyeSlashIcon}
					title={
						hideDevRunner
							? "Show Vite dev module-runner plumbing spans (vite dev only)"
							: "Hide Vite dev module-runner plumbing spans (vite dev only)"
					}
					aria-pressed={hideDevRunner}
					onClick={toggleHideDevRunner}
				>
					{hideDevRunner ? "Show Vite runner spans" : "Hide Vite runner spans"}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					icon={TrashIcon}
					title="Clear all captured traces and logs"
					loading={clearing}
					disabled={clearing || traces.length === 0}
					onClick={() => void handleClear()}
				>
					Clear
				</Button>
				<RefreshButton
					size="sm"
					aria-label="Refresh traces"
					loading={loading}
					onClick={() => void refresh()}
				/>
			</header>

			{showViteNotice ? (
				<div className="flex items-center gap-2 border-b border-kumo-fill bg-blue-500/10 px-4 py-2 text-xs text-kumo-default">
					<InfoIcon size={14} className="shrink-0 text-blue-500" />
					<span className="flex-1">
						{hideDevRunner
							? "Running under Vite dev — some spans come from Vite's module runner (module loading, RPC dispatch) rather than your code. They're hidden by “Hide Vite runner spans”."
							: "Running under Vite dev — Vite module-runner spans (module loading, RPC dispatch) are shown and may add noise to your traces."}
					</span>
					<Button size="sm" variant="secondary" onClick={toggleHideDevRunner}>
						{hideDevRunner
							? "Show Vite runner spans"
							: "Hide Vite runner spans"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						icon={XIcon}
						aria-label="Dismiss notice"
						onClick={() => setViteNoticeDismissed(true)}
					/>
				</div>
			) : null}

			{/* filter bar — a simpler version of the dashboard query builder */}
			<div className="flex items-center gap-2 border-b border-kumo-fill px-4 py-2">
				<InputGroup size="sm" className="flex-1">
					<div className="flex items-center justify-center pl-2 text-kumo-subtle">
						<MagnifyingGlassIcon size={14} />
					</div>
					<input
						aria-label="Search traces"
						value={search}
						onChange={(e) => setSearch(e.currentTarget.value)}
						placeholder="Search, or query e.g. status:error kind:d1 dur:>100 db.query.text:orders"
						className="w-full bg-transparent px-2 text-xs text-kumo-default outline-none placeholder:text-kumo-subtle"
					/>
					{search ? (
						<InputGroup.Button
							shape="square"
							variant="ghost"
							aria-label="Clear search"
							onClick={() => setSearch("")}
						>
							<XIcon size={12} />
						</InputGroup.Button>
					) : null}
				</InputGroup>
				<QuerySyntaxHint />
				<FilterSelect
					label="Filter by status"
					value={status}
					onChange={(v) => setStatus(v as typeof status)}
					options={[
						["all", "All statuses"],
						["success", "Success"],
						["error", "Errors"],
					]}
				/>
				<FilterSelect
					label="Filter by type"
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
					label="Filter by tag"
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
					<InputGroup size="sm" className="w-40">
						<input
							aria-label={`${tagKey} value`}
							value={tagValue}
							onChange={(e) => setTagValue(e.currentTarget.value)}
							placeholder={`${tagKey} value…`}
							className="w-full bg-transparent px-2 text-xs text-kumo-default outline-none placeholder:text-kumo-subtle"
						/>
					</InputGroup>
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
								<th className="w-48 py-2 pr-3 font-medium">
									<span
										className="inline-flex cursor-help items-center gap-1"
										title="Local durations are approximate — they reflect this machine and the local simulator, not production, and are not a basis for cost or billing estimates."
									>
										Duration (ms)
										<InfoIcon size={12} className="text-kumo-subtle" />
									</span>
								</th>
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
								// For the expanded detail, count/time only the spans actually
								// shown (runner plumbing hidden), so the header doesn't report
								// e.g. an alarm's ~15s runner-dispatch span as its duration.
								const shownSpans =
									isSel && spans.length
										? visibleTraceSpans(spans, hideDevRunner)
										: spans;
								const shownDur =
									isSel && spans.length ? traceExtentMs(shownSpans) : dur;
								const shownCount =
									isSel && spans.length
										? shownSpans.length
										: (t.span_count ?? spans.length);
								return (
									<Fragment key={key}>
										<tr
											onClick={() => void toggleTrace(t)}
											className={cn(
												"cursor-pointer border-b border-kumo-fill hover:bg-black/[0.03] dark:hover:bg-white/5",
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
													<span className="font-mono text-xs text-kumo-default underline decoration-kumo-line decoration-dotted underline-offset-2">
														{t.created_at ?? ""}
														<span className="text-kumo-subtle"> UTC</span>
													</span>
												</div>
											</td>
											<td className="py-2.5 pr-3 font-mono text-xs text-kumo-default">
												{t.name ? operationLabel(t) : t.trace_id.slice(0, 16)}
											</td>
											<td className="py-2.5 pr-3">
												<div className="flex flex-col gap-1">
													<div className="text-sm tabular-nums">
														<span className="text-kumo-default">
															{splitDuration(dur).value}
														</span>
														<span className="text-kumo-subtle">
															{splitDuration(dur).unit}
														</span>
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
											<td className="py-2.5 pr-3 text-xs text-kumo-default tabular-nums">
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
												<td
													colSpan={5}
													className="border-b border-kumo-fill p-4"
												>
													<div className="mb-2 flex items-baseline gap-2">
														<span className="font-mono text-sm font-semibold text-kumo-default">
															{t.name ? operationLabel(t) : t.trace_id}
														</span>
														<span className="font-mono text-[11px] text-kumo-subtle">
															{t.trace_id.slice(0, 16)}
														</span>
														<span className="text-[11px] text-kumo-subtle">
															· {formatDuration(shownDur)} · {shownCount} spans
														</span>
													</div>
													<TraceWaterfall
														key={key}
														spans={spans}
														rootSpanId={t.root_span_id}
														traceDurationMs={shownDur}
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

/**
 * A small "?" popover explaining the search bar's `key:value` query language.
 * The syntax mirrors (a subset of) the Workers Observability dashboard's query
 * builder — see utils/observability-query.ts for the parser.
 */
function QuerySyntaxHint(): JSX.Element {
	return (
		<Popover>
			<Popover.Trigger
				render={
					<Button
						size="sm"
						shape="square"
						variant="ghost"
						icon={InfoIcon}
						aria-label="Query syntax help"
					/>
				}
			/>
			<Popover.Content side="bottom" align="end" className="max-w-xs">
				<div className="text-xs font-semibold text-kumo-default">
					Query syntax
				</div>
				<p className="mt-1 text-xs text-kumo-subtle">
					Combine <code>key:value</code> terms (matched with AND). This is a
					subset of the Workers Observability dashboard syntax.
				</p>
				<ul className="mt-2 space-y-1 text-xs text-kumo-default">
					<li>
						<code>status:error</code> or <code>status:success</code>
					</li>
					<li>
						<code>kind:</code>
						{" http | fetch | d1 | kv | r2 | do"}
					</li>
					<li>
						<code>dur:&gt;100</code> — duration in ms (
						<code>&gt; &gt;= &lt; &lt;=</code>)
					</li>
					<li>
						<code>db.query.text:orders</code> — any attribute key
					</li>
					<li>Bare words become free-text search.</li>
				</ul>
			</Popover.Content>
		</Popover>
	);
}

/**
 * Shown when observability capture is off (opt-in). Capture is enabled by
 * setting the `X_LOCAL_OBSERVABILITY=true` environment variable and restarting
 * the dev server; there is no in-UI toggle while the feature is opt-in.
 */
function ObservabilityDisabled(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<span className="text-sm font-semibold text-kumo-default">
					Observability
				</span>
			</header>
			<div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
				<PulseIcon size={28} className="mb-2 text-kumo-subtle" />
				<h3 className="text-sm font-semibold text-kumo-default">
					Observability capture is off
				</h3>
				<p className="mt-1 max-w-md text-xs text-kumo-subtle">
					Local observability is opt-in for now. To record traces, spans, and
					logs from your Worker, restart your dev server with the{" "}
					<code className="font-mono">X_LOCAL_OBSERVABILITY</code> environment
					variable set:
				</p>
				<pre className="mt-3 max-w-md overflow-x-auto rounded bg-kumo-tint px-3 py-2 text-left font-mono text-xs text-kumo-default">
					X_LOCAL_OBSERVABILITY=true wrangler dev
				</pre>
				<p className="mt-2 max-w-md text-xs text-kumo-subtle">
					(or <code className="font-mono">X_LOCAL_OBSERVABILITY=true</code>{" "}
					before <code className="font-mono">vite dev</code>)
				</p>
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
			<PulseIcon size={28} className="mb-2 text-kumo-subtle" />
			<h3 className="text-sm font-semibold text-kumo-default">{title}</h3>
			<p className="mt-1 max-w-md text-xs text-kumo-subtle">{body}</p>
		</div>
	);
}
