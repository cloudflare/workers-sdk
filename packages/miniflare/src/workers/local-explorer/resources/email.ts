import { getPublicUrl } from "miniflare:shared";
import { CoreBindings, CorePaths } from "../../core";
import { errorResponse, wrapResponse } from "../common";
import type { EmailStoreService } from "../../email/storage";
import type { AppContext } from "../common";
import type {
	EmailRoutingDetail,
	EmailRoutingItem,
	EmailSendingDetail,
	EmailSendingItem,
	EmailSendRequest,
} from "../generated";

const EMAIL_ERROR_NOT_FOUND = 10601;
const EMAIL_ERROR_SEND_FAILED = 10602;
/** Occurs when the email store binding is missing (should not happen when the explorer is
 * enabled, since the store is registered alongside it). */
const EMAIL_ERROR_STORE_UNAVAILABLE = 10603;

function getEmailStore(c: AppContext): EmailStoreService | undefined {
	return c.env[CoreBindings.SERVICE_EMAIL_STORE];
}

function extractAddress(value: string): string {
	const match = value.match(/<([^>]+)>/);
	return (match ? match[1] : value).trim();
}

function buildMimeMessage(body: EmailSendRequest, messageId: string): string {
	const headers: string[] = [`From: ${body.from}`, `To: ${body.to.join(", ")}`];
	if (body.cc?.length) {
		headers.push(`Cc: ${body.cc.join(", ")}`);
	}
	if (body.bcc?.length) {
		headers.push(`Bcc: ${body.bcc.join(", ")}`);
	}
	if (body.replyTo) {
		headers.push(`Reply-To: ${body.replyTo}`);
	}
	headers.push(`Subject: ${body.subject}`);
	headers.push(`Message-ID: ${messageId}`);
	headers.push(`Date: ${new Date().toUTCString()}`);
	headers.push("MIME-Version: 1.0");

	// Custom headers last so they can override defaults if intentionally set.
	for (const [key, value] of Object.entries(body.headers ?? {})) {
		headers.push(`${key}: ${value}`);
	}

	const text = body.text ?? "";
	const html = body.html;

	let contentHeaders: string[];
	let content: string;

	if (html && body.text) {
		const boundary = `----=_Part_${crypto.randomUUID()}`;
		contentHeaders = [
			`Content-Type: multipart/alternative; boundary="${boundary}"`,
		];
		content = [
			`--${boundary}`,
			"Content-Type: text/plain; charset=utf-8",
			"",
			text,
			`--${boundary}`,
			"Content-Type: text/html; charset=utf-8",
			"",
			html,
			`--${boundary}--`,
			"",
		].join("\r\n");
	} else if (html) {
		contentHeaders = ["Content-Type: text/html; charset=utf-8"];
		content = html;
	} else {
		contentHeaders = ["Content-Type: text/plain; charset=utf-8"];
		content = text;
	}

	const attachments = body.attachments ?? [];
	if (attachments.length === 0) {
		headers.push(...contentHeaders);
		return `${headers.join("\r\n")}\r\n\r\n${content}`;
	}

	const boundary = `----=_Mixed_${crypto.randomUUID()}`;
	headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

	const parts: string[] = [`--${boundary}`, ...contentHeaders, "", content];
	for (const attachment of attachments) {
		const filename = attachment.filename
			.replace(/[\r\n]/g, " ")
			.replace(/(["\\])/g, "\\$1");
		parts.push(
			`--${boundary}`,
			`Content-Type: ${attachment.type}; name="${filename}"`,
			`Content-Disposition: ${attachment.disposition ?? "attachment"}; filename="${filename}"`,
			"Content-Transfer-Encoding: base64",
			"",
			// RFC 2045 caps base64 body lines at 76 characters.
			attachment.content
				.replace(/\s/g, "")
				.replace(/(.{76})/g, "$1\r\n")
				.trimEnd()
		);
	}
	parts.push(`--${boundary}--`, "");

	return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export async function listReceivedEmails(c: AppContext): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const emails = (await store.listReceived()).map(
		({ raw: _raw, handlingPath, ...rest }) => ({
			...rest,
			handlingPath: handlingPath.map((action) => {
				if (action.details && "raw" in action.details) {
					const { raw: _actionRaw, ...details } = action.details;
					return { ...action, details };
				}
				return action;
			}),
		})
	);
	return c.json(wrapResponse(emails as EmailRoutingItem[]));
}

export async function getReceivedEmail(
	c: AppContext,
	emailId: string
): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const email = await store.findReceived(emailId);
	if (!email) {
		return errorResponse(
			404,
			EMAIL_ERROR_NOT_FOUND,
			`Email '${emailId}' not found.`
		);
	}
	return c.json(wrapResponse(email as EmailRoutingDetail));
}

/**
 * Sends a test email to trigger the worker's email() handler.
 */
export async function sendTestEmail(
	c: AppContext,
	body: EmailSendRequest
): Promise<Response> {
	const from = extractAddress(body.from);
	const to = extractAddress(body.to[0] ?? "");

	if (!to) {
		return errorResponse(400, 10000, "At least one recipient is required.");
	}

	// Message-ID header keeps the full domain.
	const domain = from.split("@")[1] ?? "example.com";
	const localPart = Math.random().toString(36).slice(2);
	const lastDot = domain.lastIndexOf(".");
	const domainWithoutExt = lastDot === -1 ? domain : domain.slice(0, lastDot);
	const id = `${localPart}@${domainWithoutExt}`;
	const mime = buildMimeMessage(body, `<${localPart}@${domain}>`);

	const entryUrl = await getPublicUrl(c.env.MINIFLARE_LOOPBACK);
	const deliverUrl = new URL(CorePaths.EMAIL, entryUrl);
	deliverUrl.searchParams.set("from", from);
	deliverUrl.searchParams.set("to", to);

	deliverUrl.searchParams.set("id", id);
	const response = await fetch(deliverUrl, { method: "POST", body: mime });

	if (!response.ok) {
		const message = await response.text();
		return errorResponse(
			response.status === 400 ? 400 : 500,
			EMAIL_ERROR_SEND_FAILED,
			message || "Failed to deliver test email."
		);
	}

	return c.json(wrapResponse({ id }));
}

export async function listSentEmails(c: AppContext): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const emails = (await store.listSent()).map(
		({ text: _text, html: _html, raw: _raw, ...rest }) => rest
	);
	return c.json(wrapResponse(emails as EmailSendingItem[]));
}

export async function getSentEmail(
	c: AppContext,
	emailId: string
): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const email = await store.findSent(emailId);
	if (!email) {
		return errorResponse(
			404,
			EMAIL_ERROR_NOT_FOUND,
			`Email '${emailId}' not found.`
		);
	}
	return c.json(wrapResponse(email as EmailSendingDetail));
}
