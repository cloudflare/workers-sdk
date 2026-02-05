import CodeBlock from "@cloudflare/component-code-block";
import { useEffect, useState } from "react";
import StudioQueryResultStats from "./QueryResultStats";
import type { StudioResultStat } from "../../types/studio";
import type { StudioMultipleQueryProgress } from "../../utils/studio";

export function StudioQueryResultSummary({
	progress,
}: {
	progress: StudioMultipleQueryProgress;
}) {
	const [, setCurrentTime] = useState(() => Date.now());

	useEffect(() => {
		if (progress.progress < progress.total) {
			const intervalId = setInterval(() => setCurrentTime(Date.now()), 200);
			return () => clearInterval(intervalId);
		}
	}, [progress]);

	const last3 = progress.logs.slice(-3).reverse();
	const value = progress.progress;
	const total = progress.total;
	const isEnded = total === value || !!progress.error;

	return (
		<div className="p-4 w-full h-full overflow-hidden overflow-y-auto">
			<div>
				{isEnded ? (
					<strong>
						Executed {value}/{total}
					</strong>
				) : (
					<strong>
						Executing {value}/{total}
					</strong>
				)}
			</div>

			<div className="flex flex-col gap-4 mt-4">
				{last3.map((detail) => {
					return (
						<div key={detail.order}>
							{!detail.end && (
								<div className="text-xs">
									Executing this query&nbsp;
									<strong>
										{formatTimeAgo(Date.now() - detail.start)}
									</strong>{" "}
									ago.
								</div>
							)}

							<div className="mt-3" />
							<CodeBlock language="sql" code={detail.sql} />

							{!!detail.error && (
								<div
									className="mt-2 mb-2 text-red-500 font-mono text-xs"
									style={{ marginLeft: 8 }}
								>
									{detail.error}
								</div>
							)}

							{detail.end &&
								!detail.error &&
								detail.stats &&
								!isEmptyResultStats(detail.stats) && (
									<div style={{ marginLeft: -5 }}>
										<StudioQueryResultStats stats={detail.stats} />
									</div>
								)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function formatTimeAgo(ms: number) {
	if (ms < 1000) {
		return `${ms}ms`;
	} else {
		return `${(ms / 1000).toLocaleString(undefined, {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2,
		})}s`;
	}
}

function isEmptyResultStats(stats: StudioResultStat) {
	return (
		!stats.queryDurationMs &&
		!stats.rowsAffected &&
		!stats.rowsRead &&
		!stats.rowsWritten
	);
}
