import { getPublicUrl } from "miniflare:shared";
import { CorePaths } from "../../core";
import { errorResponse, wrapResponse } from "../common";
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

	if (html && body.text) {
		const boundary = `----=_Part_${crypto.randomUUID()}`;
		headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
		const parts = [
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
		];
		return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
	}

	if (html) {
		headers.push("Content-Type: text/html; charset=utf-8");
		return `${headers.join("\r\n")}\r\n\r\n${html}`;
	}

	headers.push("Content-Type: text/plain; charset=utf-8");
	return `${headers.join("\r\n")}\r\n\r\n${text}`;
}

export async function listReceivedEmails(c: AppContext): Promise<Response> {
	const response = await c.env.MINIFLARE_LOOPBACK.fetch(
		"http://localhost/core/email-routing"
	);
	const emails = (await response.json()) as EmailRoutingItem[];
	return c.json(wrapResponse(emails));
}

export async function getReceivedEmail(
	c: AppContext,
	emailId: string
): Promise<Response> {
	const response = await c.env.MINIFLARE_LOOPBACK.fetch(
		`http://localhost/core/email-routing/${encodeURIComponent(emailId)}`
	);
	if (response.status === 404) {
		return errorResponse(
			404,
			EMAIL_ERROR_NOT_FOUND,
			`Email '${emailId}' not found.`
		);
	}
	const email = (await response.json()) as EmailRoutingDetail;
	return c.json(wrapResponse(email));
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
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			"At least one recipient is required."
		);
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
	const response = await c.env.MINIFLARE_LOOPBACK.fetch(
		"http://localhost/core/email-sending"
	);
	const emails = (await response.json()) as EmailSendingItem[];
	return c.json(wrapResponse(emails));
}

export async function getSentEmail(
	c: AppContext,
	emailId: string
): Promise<Response> {
	const response = await c.env.MINIFLARE_LOOPBACK.fetch(
		`http://localhost/core/email-sending/${encodeURIComponent(emailId)}`
	);
	if (response.status === 404) {
		return errorResponse(
			404,
			EMAIL_ERROR_NOT_FOUND,
			`Email '${emailId}' not found.`
		);
	}
	const email = (await response.json()) as EmailSendingDetail;
	return c.json(wrapResponse(email));
}
