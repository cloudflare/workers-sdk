import { cn } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	CopyIcon,
	MagnifyingGlassIcon,
	PulseIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterSelect } from "../components/observability/FilterSelect";
import { ObservabilityViewSwitcher } from "../components/observability/ObservabilityViewSwitcher";
import { parseEventQuery } from "../lib/query";
import {
	findTraceDatabaseId,
	listEvents,
	type LogEvent,
} from "../lib/traces";

export const Route = createFileRoute("/events")({
	component: EventsView,
	validateSearch: (search): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

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
	const rootData = rootRoute.useLoaderData();
	const { worker } = Route.useSearch();

	const databaseId = useMemo(() => {
		for (const worker of rootData.workers) {
			const id = findTraceDatabaseId(worker.bindings);
			if (id) {
				return id;
			}
		}
		return undefined;
	}, [rootData.workers]);

	const [events, setEvents] = useState<LogEvent[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [level, setLevel] = useState("all");

	useEffect(() => {
		const id = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(id);
	}, [search]);

	const refresh = useCallback(async () => {
		if (!databaseId) {
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const parsed = parseEventQuery(debouncedSearch);
			setEvents(
				await listEvents(databaseId, {
					search: parsed.text,
					level: parsed.level ?? level,
					operation: parsed.operation,
				})
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load events");
		} finally {
			setLoading(false);
		}
	}, [databaseId, debouncedSearch, level]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (!databaseId) {
		return (
			<EmptyState
				title="No event store found"
				body="Run a Worker with the local trace collector attached. console.log output will appear here once requests are traced."
			/>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<header className="border-kumo-fill flex min-h-14 items-center gap-2.5 border-b px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<ObservabilityViewSwitcher current="events" worker={worker} />
					<span className="text-kumo-subtle pl-1 text-[11px] leading-tight">
						{events.length} log{events.length === 1 ? "" : "s"}
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

			<div className="border-kumo-fill flex items-center gap-2 border-b px-4 py-2">
				<div className="border-kumo-fill bg-kumo-base flex flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5">
					<MagnifyingGlassIcon size={14} className="text-kumo-subtle shrink-0" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search, or query e.g. level:error op:/checkout timeout"
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
					value={level}
					onChange={setLevel}
					options={[
						["all", "All levels"],
						["error", "Error"],
						["warn", "Warn"],
						["info", "Info"],
						["log", "Log"],
						["debug", "Debug"],
					]}
				/>
			</div>

			<div className="flex-1 overflow-y-auto">
				{error ? (
					<div className="mx-4 mt-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-500">
						{error}
					</div>
				) : null}

				{events.length === 0 && !loading ? (
					<EmptyState
						title="No events yet"
						body="Send some requests to your Worker; any console.log output will show up here."
						inline
					/>
				) : (
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="text-kumo-subtle border-kumo-fill border-y text-left text-xs">
								<th className="w-52 py-2 pl-4 pr-3 font-medium">Timestamp</th>
								<th className="w-20 py-2 pr-3 font-medium">Level</th>
								<th className="py-2 pr-3 font-medium">Message</th>
								<th className="w-48 py-2 pr-3 font-medium">Operation</th>
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
	const blob = useMemo(() => {
		const obj = {
			timestamp: event.created_at,
			level: event.level,
			operation: event.operation,
			trace_id: event.trace_id,
			span_id: event.span_id,
			offset_ms: event.ts_ms,
			message: parseMessage(event.message),
		};
		return JSON.stringify(obj, null, 2);
	}, [event]);

	return (
		<>
			<tr
				onClick={onToggle}
				className={cn(
					"border-kumo-fill hover:bg-black/[0.03] dark:hover:bg-white/5 cursor-pointer border-b",
					isOpen && "bg-blue-100 dark:bg-blue-900/30"
				)}
			>
				<td className="text-kumo-default py-2 pl-4 pr-3 font-mono text-xs">
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
				<td className="text-kumo-default truncate py-2 pr-3 font-mono text-xs">
					{previewMessage(event.message)}
				</td>
				<td className="text-kumo-subtle py-2 pr-3 font-mono text-xs">
					{event.operation ?? "-"}
				</td>
			</tr>
			{isOpen ? (
				<tr className="bg-kumo-base">
					<td colSpan={4} className="px-4 py-3">
						<div className="border-kumo-fill bg-kumo-elevated relative rounded-lg border p-3">
							<button
								type="button"
								onClick={() => void navigator.clipboard.writeText(blob)}
								className="text-kumo-subtle hover:text-kumo-default absolute right-2 top-2"
								aria-label="Copy JSON"
							>
								<CopyIcon size={14} />
							</button>
							<pre className="text-kumo-default overflow-x-auto font-mono text-xs leading-relaxed">
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
			<PulseIcon size={28} className="text-kumo-subtle mb-2" />
			<h3 className="text-kumo-default text-sm font-semibold">{title}</h3>
			<p className="text-kumo-subtle mt-1 max-w-md text-xs">{body}</p>
		</div>
	);
}
