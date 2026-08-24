import { WarningIcon } from "@phosphor-icons/react";
import type { WorkersMessages } from "../../api";
import type { JSX } from "react";

const TRUNCATION_MESSAGES = {
	received:
		"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
	sent: "Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
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
	kind: "received" | "sent";
}): JSX.Element {
	return (
		<div
			className="mb-2 flex gap-2 rounded-lg border border-kumo-warning/30 bg-kumo-warning/10 p-3 text-sm text-kumo-default"
			role="status"
		>
			<WarningIcon className="mt-0.5 shrink-0 text-kumo-warning" size={16} />
			<p>
				{kind === "sent"
					? "This content was truncated during local capture. The complete email is available in temporary local storage; see the development log for its path."
					: "This content was truncated during local capture. The complete email was delivered to the Worker, but cannot be inspected in Local Explorer."}
			</p>
		</div>
	);
}
