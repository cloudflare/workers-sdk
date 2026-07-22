import {
	Button,
	cn,
	InputGroup,
	RefreshButton,
	Select,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	CopyIcon,
	MagnifyingGlassIcon,
	PulseIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClearButton } from "../../components/observability/ClearButton";
import { FilterBuilder } from "../../components/observability/FilterBuilder";
import { ObservabilityDisabled } from "../../components/observability/ObservabilityDisabled";
import { ObservabilityViewSwitcher } from "../../components/observability/ObservabilityViewSwitcher";
import { QuerySyntaxHint } from "../../components/observability/QuerySyntaxHint";
import { ResourceError } from "../../components/ResourceError";
import { copyTextToClipboard } from "../../utils/agent-prompt";
import {
	clearTraces,
	isObservabilityDisabledError,
	listEvents,
} from "../../utils/observability";
import { parseEventQuery } from "../../utils/observability-query";
import type { FilterField } from "../../components/observability/FilterBuilder";
import type { LogEvent } from "../../utils/observability";
import type { QueryClause } from "../../utils/observability-query";
import type { JSX } from "react";

// Fields offered by the Events filter modal. Logs don't carry arbitrary
// attributes like traces do, so these map to the concrete log columns
// (operation/message/level) or the emitting span (service).
const EVENT_FILTER_FIELDS: FilterField[] = [
	{ key: "service", label: "Service", type: "string" },
	{ key: "operation", label: "Operation", type: "string" },
	{ key: "message", label: "Message", type: "string" },
	{ key: "level", label: "Level", type: "string" },
];

/** Display labels for the level filter dropdown (excluding the "all" state). */
const LEVEL_LABELS: Record<string, string> = {
	error: "Error",
	warn: "Warn",
	info: "Info",
	debug: "Debug",
};

export const Route = createFileRoute("/observability/events")({
	component: EventsView,
	errorComponent: ResourceError,
});

function parseMessage(message: string | null): unknown {
	if (!message) {
		return null;
	}
	try {
		return JSON.parse(message);
	} catch {
		return message;
	}
}

function previewMessage(message: string | null): string {
	const parsed = parseMessage(message);
	if (parsed == null) {
		return "";
	}
	if (typeof parsed === "string") {
		return parsed;
	}
	return JSON.stringify(parsed);
}

function levelClass(level: string | null): string {
	switch (level) {
		case "error":
			return "bg-red-500/15 text-red-500";
		case "warn":
			return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
		case "debug":
			return "bg-gray-500/15 text-kumo-subtle";
		default:
			return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
	}
}

function EventsView(): JSX.Element {
	const [events, setEvents] = useState<LogEvent[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Capture is off (no collector bound). Show the shared "off" panel instead
	// of an empty list, matching the Traces view.
	const [disabled, setDisabled] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [expanded, setExpanded] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	// The query actually applied to the list. Only updated when the user submits
	// the search bar (Enter) or clears it — so typing doesn't filter live.
	const [appliedSearch, setAppliedSearch] = useState("");
	const [level, setLevel] = useState("all");
	// Structured filters built in the filter modal (AND'd when querying).
	const [filterClauses, setFilterClauses] = useState<QueryClause[]>([]);
	// True while the user has edited the search bar but not yet submitted it. We
	// keep the current rows visible so an unsubmitted edit doesn't flash the list.
	const queryPending = search !== appliedSearch;

	// Submit the search bar: apply the typed query to the list.
	const submitSearch = useCallback(() => setAppliedSearch(search), [search]);
	const clearSearch = useCallback(() => {
		setSearch("");
		setAppliedSearch("");
	}, []);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const parsed = parseEventQuery(appliedSearch);
			setEvents(
				await listEvents({
					search: parsed.text,
					level: parsed.level ?? level,
					operation: parsed.operation,
					clauses: filterClauses,
				})
			);
			setDisabled(false);
		} catch (e) {
			if (isObservabilityDisabledError(e)) {
				// Capture is off — show the "off" panel, not a scary error.
				setDisabled(true);
				setError(null);
			} else {
				setError(e instanceof Error ? e.message : "Failed to load events");
			}
		} finally {
			setLoading(false);
		}
	}, [appliedSearch, level, filterClauses]);

	const handleClear = useCallback(async () => {
		setClearing(true);
		try {
			// Clears the whole trace store (spans + logs), matching the Traces view.
			await clearTraces();
			setExpanded(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to clear data");
		} finally {
			setClearing(false);
		}
	}, [refresh]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Auto-refresh so new events appear without clicking Refresh, matching the
	// Traces view. Paused while capture is disabled to avoid polling a dead
	// endpoint.
	useEffect(() => {
		if (disabled) {
			return;
		}
		const id = setInterval(() => void refresh(), 3000);
		return () => clearInterval(id);
	}, [refresh, disabled]);

	if (disabled) {
		return <ObservabilityDisabled />;
	}

	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-6">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<ObservabilityViewSwitcher current="events" />
					<span className="pl-1 text-[11px] leading-tight text-kumo-subtle">
						{events.length} event{events.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<ClearButton
					onConfirm={handleClear}
					loading={clearing}
					disabled={events.length === 0}
				/>
				<RefreshButton
					size="sm"
					aria-label="Refresh events"
					loading={loading}
					onClick={() => void refresh()}
				/>
			</header>

			<div className="flex items-center gap-2 border-b border-kumo-fill px-6 py-3">
				<InputGroup size="sm" className="flex-1">
					<div className="flex items-center justify-center pl-2 text-kumo-subtle">
						<MagnifyingGlassIcon size={14} />
					</div>
					<input
						aria-label="Search events"
						value={search}
						onChange={(e) => setSearch(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								submitSearch();
							}
						}}
						placeholder="Search, or query e.g. level:error op:/checkout timeout — press Enter"
						className="w-full bg-transparent px-2 text-xs text-kumo-default outline-none placeholder:text-kumo-subtle"
					/>
					{search ? (
						<InputGroup.Button
							shape="square"
							variant="ghost"
							aria-label="Clear search"
							onClick={clearSearch}
						>
							<XIcon size={12} />
						</InputGroup.Button>
					) : null}
				</InputGroup>
				<QuerySyntaxHint variant="events" />
				{/*
				 * Note: capture folds console.log's "log" level into "info"
				 * (OTel severity), so there's no distinct "Log" level to filter on.
				 */}
				<label className="flex items-center gap-1.5 text-xs text-kumo-subtle">
					Level
					<Select
						aria-label="Filter by level"
						value={level}
						onValueChange={(v) => setLevel(String(v))}
						renderValue={(v) =>
							v === "all" ? (
								<span className="text-kumo-subtle">Any</span>
							) : (
								LEVEL_LABELS[String(v)]
							)
						}
					>
						<Select.Option value="all">Any level</Select.Option>
						<Select.Option value="error">Error</Select.Option>
						<Select.Option value="warn">Warn</Select.Option>
						<Select.Option value="info">Info</Select.Option>
						<Select.Option value="debug">Debug</Select.Option>
					</Select>
				</label>
				<FilterBuilder
					fields={EVENT_FILTER_FIELDS}
					clauses={filterClauses}
					onApply={setFilterClauses}
					itemNoun="events"
				/>
			</div>

			<div className="flex-1 overflow-y-auto px-6 py-5">
				{error ? (
					<div className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-500">
						{error}
					</div>
				) : null}

				<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
					{events.length === 0 && !loading && !queryPending ? (
						search || level !== "all" || filterClauses.length > 0 ? (
							<EmptyState
								title="No matching events"
								body="No events match your current search or filters. Try clearing them."
								inline
							/>
						) : (
							<EmptyState
								title="No events yet"
								body="Send some requests to your Worker; any console.log output will show up here."
								inline
							/>
						)
					) : (
						<table className="w-full border-collapse text-sm">
							<thead>
								<tr className="border-b border-kumo-fill text-left text-xs text-kumo-subtle">
									<th className="w-52 py-2 pr-3 pl-4 font-medium">Timestamp</th>
									<th className="w-20 py-2 pr-3 font-medium">Level</th>
									<th className="py-2 pr-3 font-medium">Message</th>
									<th className="w-48 py-2 pr-3 font-medium">Service</th>
								</tr>
							</thead>
							<tbody>
								{events.map((ev) => {
									const key = `${ev.trace_id}-${ev.seq}`;
									const isOpen = expanded === key;
									return (
										<EventRow
											key={key}
											event={ev}
											isOpen={isOpen}
											onToggle={() => setExpanded(isOpen ? null : key)}
										/>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	);
}

function EventRow({
	event,
	isOpen,
	onToggle,
}: {
	event: LogEvent;
	isOpen: boolean;
	onToggle: () => void;
}): JSX.Element {
	const toast = useKumoToastManager();
	const blob = useMemo(() => {
		const obj = {
			timestamp: event.created_at,
			level: event.level,
			service: event.service,
			operation: event.operation,
			trace_id: event.trace_id,
			span_id: event.span_id,
			offset_ms: event.ts_ms,
			message: parseMessage(event.message),
		};
		return JSON.stringify(obj, null, 2);
	}, [event]);

	const copyBlob = useCallback(async () => {
		try {
			await copyTextToClipboard(blob);
			toast.add({ title: "Copied to clipboard", variant: "success" });
		} catch {
			toast.add({
				title: "Failed to copy to clipboard",
				description: "Something went wrong when trying to copy the event JSON.",
				variant: "default",
			});
		}
	}, [blob, toast]);

	return (
		<>
			<tr
				onClick={onToggle}
				className={cn(
					"cursor-pointer border-b border-kumo-fill hover:bg-black/[0.03] dark:hover:bg-white/5",
					isOpen && "bg-blue-100 dark:bg-blue-900/30"
				)}
			>
				<td className="py-2 pr-3 pl-4 font-mono text-xs text-kumo-default">
					{event.created_at ?? ""}
					<span className="text-kumo-subtle"> UTC</span>
				</td>
				<td className="py-2 pr-3">
					<span
						className={cn(
							"rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
							levelClass(event.level)
						)}
					>
						{event.level ?? "log"}
					</span>
				</td>
				<td className="truncate py-2 pr-3 font-mono text-xs text-kumo-default">
					{previewMessage(event.message)}
				</td>
				<td className="py-2 pr-3 font-mono text-xs text-kumo-subtle">
					{event.service ?? "-"}
				</td>
			</tr>
			{isOpen ? (
				<tr className="bg-kumo-base">
					<td colSpan={4} className="px-4 py-3">
						<div className="relative rounded-lg border border-kumo-fill bg-kumo-elevated p-3">
							<Button
								size="sm"
								shape="square"
								variant="ghost"
								icon={CopyIcon}
								aria-label="Copy JSON"
								className="absolute top-2 right-2"
								onClick={() => void copyBlob()}
							/>
							<pre className="overflow-x-auto font-mono text-sm leading-relaxed text-kumo-default">
								{blob}
							</pre>
						</div>
					</td>
				</tr>
			) : null}
		</>
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
			<PulseIcon size={32} className="mb-3 text-kumo-subtle" />
			<h3 className="text-base font-semibold text-kumo-default">{title}</h3>
			<p className="mt-2 max-w-md text-sm text-kumo-subtle">{body}</p>
		</div>
	);
}
