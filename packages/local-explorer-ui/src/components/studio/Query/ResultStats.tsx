import { Tooltip } from "@cloudflare/kumo";
import { QuestionIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { StudioResultStat } from "../../../types/studio";
import type { ReactElement } from "react";

function formatDuration(duration: number): string {
	if (duration < 1000) {
		return `${duration.toFixed(1)}ms`;
	}

	if (duration < 60_000) {
		return `${(duration / 1000).toFixed(2)}s`;
	}

	return `${(duration / 60_000).toFixed(2)}m`;
}

interface StudioQueryResultStatsProps {
	stats: StudioResultStat;
}

export function StudioQueryResultStats({
	stats,
}: StudioQueryResultStatsProps): JSX.Element {
	const statsComponents = useMemo((): ReactElement[] => {
		const content = new Array<ReactElement>();

		if (stats.queryDurationMs !== null) {
			content.push(
				<div className="px-2 flex gap-1 items-center" key="query-duration">
					<span className="font-semibold">Query Time</span>
					<Tooltip content="Time taken by the server to execute the SQL query (excludes network delay and request overhead).">
						<QuestionIcon />
					</Tooltip>

					<span>: {formatDuration(stats.queryDurationMs)}</span>
				</div>
			);
		}

		if (stats.requestDurationMs) {
			content.push(
				<div className="px-2 flex gap-1 items-center" key="request-duration">
					<span className="font-semibold">Response Time</span>
					<Tooltip content="Total time from request sent to response received (includes query time, network latency, and server processing).">
						<QuestionIcon />
					</Tooltip>

					<span>: {formatDuration(stats.requestDurationMs)}</span>
				</div>
			);
		}

		if (stats.rowCount) {
			content.push(
				<div className="px-2" key="rows-read">
					<span className="font-semibold">Rows Read</span>: {stats.rowCount}
				</div>
			);
		}

		if (stats.rowsWritten) {
			content.push(
				<div className="px-2" key="rows-written">
					<span className="font-semibold">Rows Written</span>:{" "}
					{stats.rowsWritten}
				</div>
			);
		}

		if (stats.rowsAffected) {
			content.push(
				<div className="px-2" key="affected-rows">
					<span className="font-semibold">Affected Rows</span>:{" "}
					{stats.rowsAffected}
				</div>
			);
		}

		return content;
	}, [stats]);

	return <div className="text-xs p-2 flex">{statsComponents}</div>;
}
