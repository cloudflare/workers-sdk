/**
 * Formats a timestamp as a compact relative label, for example "5m ago".
 *
 * @returns A relative label, or an empty string when the value is missing or unparseable
 */
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
