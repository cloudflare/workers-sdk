export function formatDuration(
	startStr?: string | null,
	endStr?: string | null
): string {
	if (!startStr || !endStr) {
		return "—";
	}
	const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
	if (isNaN(ms) || ms < 0) {
		return "—";
	}
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const secs = Math.floor(ms / 1000);
	const remainMs = ms % 1000;
	if (ms < 60_000) {
		return remainMs > 0 ? `${secs}s ${remainMs}ms` : `${secs}s`;
	}
	const mins = Math.floor(ms / 60_000);
	const remainSecs = Math.floor((ms % 60_000) / 1000);
	if (mins < 60) {
		return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`;
	}
	const hours = Math.floor(mins / 60);
	const remainMins = mins % 60;
	return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

export function timeAgo(dateString: string | undefined): string {
	if (!dateString) {
		return "";
	}
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

export function formatJson(value: unknown): string {
	if (value === null || value === undefined) {
		return "N/A";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value, null, 2);
}
