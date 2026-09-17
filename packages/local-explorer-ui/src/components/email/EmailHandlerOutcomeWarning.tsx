import { WarningIcon } from "@phosphor-icons/react";
import type { EmailRoutingDetail } from "../../api";
import type { JSX } from "react";

/** Distinguishes a thrown handler from a Worker with no email handler. */
export function hasEmailHandlerException(
	email: Pick<EmailRoutingDetail, "events" | "outcome">
): boolean {
	return (
		email.outcome === "exception" &&
		!email.events.some(({ type }) => type === "unhandled")
	);
}

/** Indicates that delivery reached the handler, but the handler threw. */
export function EmailHandlerOutcomeWarning(): JSX.Element {
	return (
		<div
			className="flex items-start gap-2 rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 px-3 py-2.5 text-sm text-kumo-default"
			role="alert"
		>
			<span className="flex h-lh shrink-0 items-center">
				<WarningIcon className="text-kumo-danger" size={16} />
			</span>
			<p>
				The Worker&rsquo;s email() handler threw an exception while processing
				this message. See the development log for error details.
			</p>
		</div>
	);
}
