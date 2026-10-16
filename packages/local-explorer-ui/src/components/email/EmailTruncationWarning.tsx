import { WarningIcon } from "@phosphor-icons/react";
import type { WorkersMessages } from "../../api";
import type { JSX } from "react";

const TRUNCATION_MESSAGES = {
	received:
		"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
	reply:
		"Displayed reply content was truncated during local capture. The complete reply is available in the local filesystem; see the development log for its path.",
	sent: "Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
} as const;

const TRUNCATION_DISPLAY_MESSAGES = {
	received:
		"This content was truncated during local capture. The complete email was delivered to the Worker, but cannot be inspected in Local Explorer.",
	reply:
		"Reply content was truncated during local capture. The complete reply is available in temporary local storage; see the development log for its path.",
	sent: "This content was truncated during local capture. The complete email is available in temporary local storage; see the development log for its path.",
} as const;

export function hasEmailTruncationWarning(
	messages: WorkersMessages,
	kind: keyof typeof TRUNCATION_MESSAGES
): boolean {
	return messages.some(({ message }) => message === TRUNCATION_MESSAGES[kind]);
}

export function EmailTruncationWarning({
	kind,
}: {
	kind: keyof typeof TRUNCATION_MESSAGES;
}): JSX.Element {
	return (
		<div
			className="flex items-start gap-2 rounded-lg border border-kumo-warning/30 bg-kumo-warning/10 px-3 py-2.5 text-sm text-kumo-default"
			role="status"
		>
			<span className="flex h-lh shrink-0 items-center">
				<WarningIcon className="text-kumo-warning" size={16} />
			</span>
			<p>{TRUNCATION_DISPLAY_MESSAGES[kind]}</p>
		</div>
	);
}
