import { cn } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { fetchTraceLogs, formatLogMessage } from "../../utils/observability";
import type { Log } from "../../utils/observability";
import type { JSX } from "react";

function levelClass(level?: string | null): string {
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

/**
 * All log events for a single trace/invocation, shown inline under its
 * waterfall when the "Show logs" toggle is on. Fetches once when mounted (so
 * it's only queried when the user asks to see logs).
 */
export function InvocationLogs({ traceId }: { traceId: string }): JSX.Element {
	const [logs, setLogs] = useState<Log[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		setLoading(true);
		fetchTraceLogs(traceId)
			.then((rows) => {
				if (active) {
					setLogs(rows);
					setError(null);
					setLoading(false);
				}
			})
			.catch((e) => {
				if (active) {
					setError(e instanceof Error ? e.message : "Failed to load logs");
					setLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [traceId]);

	return (
		<div className="mt-2 overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
			<div className="border-b border-kumo-fill px-4 py-2 text-xs font-medium text-kumo-subtle">
				Logs{logs.length ? ` (${logs.length})` : ""}
			</div>
			{error ? (
				<div className="px-4 py-3 text-xs text-red-500">{error}</div>
			) : loading ? (
				<div className="px-4 py-3 text-xs text-kumo-subtle">Loading logs…</div>
			) : logs.length === 0 ? (
				<div className="px-4 py-3 text-xs text-kumo-subtle italic">
					No logs for this invocation.
				</div>
			) : (
				<ul>
					{logs.map((log) => (
						<li
							key={`${log.span_id ?? "-"}-${log.seq}`}
							className="flex items-start gap-2 border-b border-kumo-fill px-4 py-1.5 last:border-b-0"
						>
							<span
								className={cn(
									"mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
									levelClass(log.level)
								)}
							>
								{log.level ?? "log"}
							</span>
							<span className="font-mono text-xs break-all text-kumo-default">
								{formatLogMessage(log.message ?? undefined) || (
									<span className="text-kumo-subtle italic">(no message)</span>
								)}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
