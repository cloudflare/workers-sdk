// Email detail views (e.g. "/email/routing/<id>") are scoped to a single
// worker's data. The parent list pages that own these detail views: switching
// the active worker while viewing a specific email would leave the user on a
// detail page for an email that does not exist under the newly selected worker.
const EMAIL_DETAIL_PARENTS = ["/email/routing", "/email/sending"] as const;

/**
 * Maps the current (browser) pathname to the pathname the user should land on
 * after switching workers.
 *
 * Email detail views are scoped to a single worker's data, so switching workers
 * returns to the interface's parent list page ("Routing" or "Sending"). All
 * other paths are preserved as-is.
 *
 * The `pathname` includes the router basepath (e.g. "/cdn-cgi/local/explorer"),
 * so the email segments are matched anywhere in the path rather than at the
 * start.
 */
export function getWorkerChangeDestination(pathname: string): string {
	for (const parent of EMAIL_DETAIL_PARENTS) {
		const detailMatch = pathname.match(new RegExp(`^(.*${parent})/.+$`));
		if (detailMatch?.[1]) {
			return detailMatch[1];
		}
	}
	return pathname;
}
