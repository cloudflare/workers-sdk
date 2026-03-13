import { Tooltip } from "@cloudflare/kumo";

function timeAgo(dateString: string): string {
	const now = Date.now();
	const then = new Date(dateString).getTime();
	if (isNaN(then)) {
		return "";
	}
	const seconds = Math.floor((now - then) / 1000);
	if (seconds < 5) {
		return "just now";
	}
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

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
