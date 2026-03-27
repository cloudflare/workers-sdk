import { Tooltip } from "@cloudflare/kumo";
import { timeAgo } from "./helpers";

function formatShort(ts: string): string {
	try {
		const d = new Date(ts);
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	} catch {
		return ts;
	}
}

function formatFull(ts: string): string {
	try {
		const d = new Date(ts);
		return d.toLocaleString("en-US", {
			weekday: "short",
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: true,
			timeZoneName: "short",
		});
	} catch {
		return ts;
	}
}

export function Timestamp({
	value,
}: {
	value: string | undefined | null;
}): JSX.Element {
	if (!value) {
		return <span className="text-sm text-text-secondary">—</span>;
	}

	const short = formatShort(value);
	const full = formatFull(value);
	const relative = timeAgo(value);

	return (
		<Tooltip
			content={
				<div className="space-y-1 text-xs">
					<div>{full}</div>
					<div className="text-text-secondary">{relative}</div>
				</div>
			}
		>
			<span className="text-sm whitespace-nowrap text-text-secondary">
				{short}
			</span>
		</Tooltip>
	);
}
