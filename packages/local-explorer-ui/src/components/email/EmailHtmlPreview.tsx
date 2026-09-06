import {
	createSafeEmailPreview,
	EMAIL_PREVIEW_CSP,
} from "../../utils/email-html";
import type { JSX } from "react";

/**
 * Renders untrusted email HTML with the sandbox and resource policy shared by
 * every email detail view.
 *
 * @param html - Captured HTML email content.
 * @param title - Accessible description of the preview.
 * @returns A constrained iframe containing the email HTML.
 */
export function EmailHtmlPreview({
	html,
	title,
}: {
	html: string;
	title: string;
}): JSX.Element {
	const embeddedCsp = { csp: EMAIL_PREVIEW_CSP };
	return (
		<iframe
			{...embeddedCsp}
			className="h-96 w-full rounded-lg border border-kumo-fill bg-white"
			referrerPolicy="no-referrer"
			sandbox=""
			srcDoc={createSafeEmailPreview(html)}
			title={title}
		/>
	);
}
