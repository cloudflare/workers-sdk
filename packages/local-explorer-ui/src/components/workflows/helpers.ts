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

export function formatJson(value: unknown): string {
	if (value === null || value === undefined) {
		return "N/A";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value, null, 2);
}
