export const EXPLORER_REFRESH_HEADER = "X-Miniflare-Explorer-Refresh";

/** Whether this request is an automatic Cron metadata poll. */
export function isAutomaticWorkersRefresh(
	method: string,
	routeName: string,
	headerValue: string | undefined
): boolean {
	return (
		method === "GET" && routeName === "local.workers" && headerValue === "poll"
	);
}
