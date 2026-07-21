import {
	Button,
	cn,
	InputGroup,
	RefreshButton,
	Select,
} from "@cloudflare/kumo";
import {
	CopyIcon,
	MagnifyingGlassIcon,
	PulseIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ResourceError } from "../../components/ResourceError";
import { listEvents } from "../../utils/observability";
import { parseEventQuery } from "../../utils/observability-query";
import type { LogEvent } from "../../utils/observability";
import type { JSX } from "react";

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
	const [expanded, setExpanded] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [level, setLevel] = useState("all");

	useEffect(() => {
		const id = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(id);
	}, [search]);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const parsed = parseEventQuery(debouncedSearch);
			setEvents(
				await listEvents({
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
	}, [debouncedSearch, level]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<span className="pl-1 text-sm leading-tight font-semibold text-kumo-default">
						Events
					</span>
					<span className="pl-1 text-[11px] leading-tight text-kumo-subtle">
						{events.length} event{events.length === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex-1" />
				<RefreshButton
					size="sm"
					aria-label="Refresh events"
					loading={loading}
					onClick={() => void refresh()}
				/>
			</header>

			<div className="flex items-center gap-2 border-b border-kumo-fill px-4 py-2">
				<InputGroup size="sm" className="flex-1">
					<div className="flex items-center justify-center pl-2 text-kumo-subtle">
						<MagnifyingGlassIcon size={14} />
					</div>
					<input
						aria-label="Search events"
						value={search}
						onChange={(e) => setSearch(e.currentTarget.value)}
						placeholder="Search, or query e.g. level:error op:/checkout timeout"
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
				{/*
				 * Note: capture folds console.log's "log" level into "info"
				 * (OTel severity), so there's no distinct "Log" level to filter on.
				 */}
				<Select
					aria-label="Filter by level"
					value={level}
					onValueChange={(v) => setLevel(String(v))}
				>
					<Select.Option value="all">All levels</Select.Option>
					<Select.Option value="error">Error</Select.Option>
					<Select.Option value="warn">Warn</Select.Option>
					<Select.Option value="info">Info</Select.Option>
					<Select.Option value="debug">Debug</Select.Option>
				</Select>
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
							<tr className="border-y border-kumo-fill text-left text-xs text-kumo-subtle">
								<th className="w-52 py-2 pr-3 pl-4 font-medium">Timestamp</th>
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
					{event.operation ?? "-"}
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
								onClick={() => void navigator.clipboard.writeText(blob)}
							/>
							<pre className="overflow-x-auto font-mono text-xs leading-relaxed text-kumo-default">
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
			<PulseIcon size={28} className="mb-2 text-kumo-subtle" />
			<h3 className="text-sm font-semibold text-kumo-default">{title}</h3>
			<p className="mt-1 max-w-md text-xs text-kumo-subtle">{body}</p>
		</div>
	);
}
