import type { EmailResendRoutingResponse, EmailSendRequest } from "../api";

type EmailResendResult = NonNullable<EmailResendRoutingResponse["result"]>;

type AttachmentInput = NonNullable<EmailSendRequest["attachments"]>[number];

export interface SelectedTestEmailAttachment extends AttachmentInput {
	id: string;
	size: number;
}

export interface TestEmailDraft {
	from: string;
	to: string;
	cc: string;
	bcc: string;
	replyTo: string;
	subject: string;
	headers: Array<{ name: string; value: string }>;
	text: string;
	html: string;
	attachments: SelectedTestEmailAttachment[];
}

export interface EmailResendFeedback {
	description?: string;
	title: string;
	variant: "error" | "success";
}

interface InboxRefreshCoordinatorOptions {
	currentGeneration: () => number;
	isDisposed: () => boolean;
	refreshFirstPage: () => Promise<"stale" | "success">;
}

export interface InboxRefreshCoordinator {
	clear: () => void;
	request: (expectedGeneration: number) => void;
}

interface EmailApiError {
	errors?: Array<{ code?: number; message?: string }>;
}

const CAPTURED_PORTION_MESSAGE =
	"Only the captured portion of the original email was available.";

function decodedBase64Size(value: string): number {
	const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
	return Math.floor((value.length * 3) / 4) - padding;
}

/** Converts a server projection to state owned by the existing composer. */
export function toTestEmailDraft(draft: EmailSendRequest): TestEmailDraft {
	return {
		from: draft.from,
		to: draft.to.join(", "),
		cc: draft.cc?.join(", ") ?? "",
		bcc: "",
		replyTo: draft.replyTo ?? "",
		subject: draft.subject,
		headers: Object.entries(draft.headers ?? {}).map(([name, value]) => ({
			name,
			value,
		})),
		text: draft.text ?? "",
		html: draft.html ?? "",
		attachments: (draft.attachments ?? []).map((attachment) => ({
			...attachment,
			id: crypto.randomUUID(),
			size: decodedBase64Size(attachment.content),
		})),
	};
}

/** Maps immediate-resend results to concise, outcome-specific feedback. */
export function getEmailResendFeedback(
	result: EmailResendResult
): EmailResendFeedback {
	const description = result.capturedPortion
		? CAPTURED_PORTION_MESSAGE
		: undefined;
	if (Object.hasOwn(result, "rejectReason")) {
		return {
			description: [
				result.rejectReason || "No rejection reason was provided.",
				description,
			]
				.filter(Boolean)
				.join(" "),
			title: "Email was rejected.",
			variant: "error",
		};
	}
	if (result.outcome === "exception") {
		return {
			description,
			title: "The email handler threw an exception.",
			variant: "error",
		};
	}
	return { description, title: "Email resent.", variant: "success" };
}

/** Maps an API failure without claiming an ambiguous resend was not delivered. */
export function getEmailResendErrorFeedback(
	error: EmailApiError | undefined,
	status: number | undefined,
	sourceCapturedPortion: boolean
): EmailResendFeedback {
	const apiError = error?.errors?.[0];
	const description = sourceCapturedPortion
		? CAPTURED_PORTION_MESSAGE
		: undefined;
	if (status === 502 || apiError?.code === 10603) {
		return {
			description,
			title:
				"The resend result is unknown because the Worker peer became unavailable.",
			variant: "error",
		};
	}
	return {
		description,
		title: apiError?.message ?? "Failed to resend the email.",
		variant: "error",
	};
}

/** Returns network feedback that acknowledges delivery may already have happened. */
export function getEmailResendNetworkFeedback(
	sourceCapturedPortion: boolean
): EmailResendFeedback {
	return {
		description: sourceCapturedPortion ? CAPTURED_PORTION_MESSAGE : undefined,
		title: "The resend result is unknown because the request was interrupted.",
		variant: "error",
	};
}

/**
 * Coalesces send-driven inbox refreshes into one constant-memory dirty loop.
 */
export function createInboxRefreshCoordinator({
	currentGeneration,
	isDisposed,
	refreshFirstPage,
}: InboxRefreshCoordinatorOptions): InboxRefreshCoordinator {
	let dirty = false;
	let running: Promise<void> | undefined;

	async function drain(expectedGeneration: number): Promise<void> {
		while (
			dirty &&
			!isDisposed() &&
			expectedGeneration === currentGeneration()
		) {
			dirty = false;
			try {
				if ((await refreshFirstPage()) === "stale") {
					return;
				}
			} catch {
				return;
			}
		}
	}

	function request(expectedGeneration: number): void {
		if (isDisposed() || expectedGeneration !== currentGeneration()) {
			return;
		}
		dirty = true;
		if (running !== undefined) {
			return;
		}

		const task = Promise.resolve().then(() => drain(expectedGeneration));
		const tracked = task.finally(() => {
			if (running !== tracked) {
				return;
			}
			running = undefined;
			if (!isDisposed() && dirty) {
				request(currentGeneration());
			}
		});
		running = tracked;
	}

	return {
		clear: () => {
			dirty = false;
		},
		request,
	};
}
