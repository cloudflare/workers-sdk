import { getPublicUrl } from "miniflare:shared";
import { decodeWords } from "postal-mime";
import { z } from "zod";
import { CoreBindings, CorePaths } from "../../core";
import { handleEmail } from "../../core/email";
import { MAX_LOCAL_EMAIL_BYTES } from "../../email/constants";
import {
	getHeader,
	messageIdToStorageId,
	synthesizeMessageId,
} from "../../email/message-id";
import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import {
	zEmailHandlerEvent,
	zEmailHandlerForward,
	zEmailHandlerReply,
	zEmailRoutingDetail,
	zEmailRoutingItem,
	zEmailSendingDetail,
	zEmailSendingItem,
} from "../generated/zod.gen";
import type { EmailStoreService } from "../../email/storage";
import type { AppContext } from "../common";
import type { EmailSendRequest, LocalExplorerWorker } from "../generated";

const EMAIL_ERROR_NOT_FOUND = 10601;
const EMAIL_ERROR_SEND_FAILED = 10602;
/** Occurs when the email store binding is missing (should not happen when the explorer is
 * enabled, since the store is registered alongside it). */
const EMAIL_ERROR_STORE_UNAVAILABLE = 10603;

const zEmailHandlerResult = z.object({
	outcome: z.enum(["ok", "exception"]),
	rejectReason: z.string().optional(),
	forwards: z.array(zEmailHandlerForward),
	replies: z.array(zEmailHandlerReply.extend({ raw: z.string() })),
	events: z.array(zEmailHandlerEvent),
});

function getEmailStore(c: AppContext): EmailStoreService | undefined {
	return c.env[CoreBindings.SERVICE_EMAIL_STORE];
}

function isFetcher(value: unknown): value is Fetcher {
	return (
		typeof value === "object" &&
		value !== null &&
		"fetch" in value &&
		typeof value.fetch === "function"
	);
}

/** Whether the given worker is served by this Miniflare instance. */
function isLocalWorker(c: AppContext, worker: string): boolean {
	return c.env[CoreBindings.JSON_LOCAL_EXPLORER_WORKER_NAMES].includes(worker);
}

/**
 * Resolves a direct service binding to a user worker in this instance, used to
 * invoke that worker's `email()` handler for "Send Test Email". These bindings
 * are registered per worker by `getExplorerServices` (see the
 * `SERVICE_EXPLORER_USER_WORKER_PREFIX` bindings).
 */
function getUserWorkerService(
	c: AppContext,
	worker: string
): Fetcher | undefined {
	const service =
		c.env[`${CoreBindings.SERVICE_EXPLORER_USER_WORKER_PREFIX}${worker}`];
	return isFetcher(service) ? service : undefined;
}

/**
 * Keeps only the emails belonging to `worker`. When no worker is requested (e.g.
 * a single-worker dev session) the list is returned unchanged, preserving the
 * previous behaviour.
 */
function filterByWorker<T extends { worker?: string }>(
	emails: T[],
	worker: string | undefined
): T[] {
	if (worker === undefined) {
		return emails;
	}
	return emails.filter((email) => email.worker === worker);
}

/**
 * Finds the peer instance that serves `worker` by asking each peer which workers
 * it hosts. Returns the peer's debug port address, or null when no peer owns it.
 */
async function findWorkerOwner(
	c: AppContext,
	peerUrls: string[],
	worker: string
): Promise<string | null> {
	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, "/local/workers");
			if (!response?.ok) {
				return null;
			}
			try {
				const data = (await response.json()) as {
					result?: LocalExplorerWorker[];
				};
				const owns = data.result?.some((w) => w.name === worker) ?? false;
				return owns ? url : null;
			} catch {
				return null;
			}
		})
	);
	return responses.find((url) => url !== null) ?? null;
}

function extractAddress(value: string): string {
	const match = value.match(/<([^>]+)>/);
	return (match ? match[1] : value).trim();
}

function hasUnsafeHeaderCharacters(value: string): boolean {
	return /[\u0000-\u001f\u007f]/u.test(value);
}

function isHeaderName(value: string): boolean {
	return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(value);
}

function isMimeType(value: string): boolean {
	return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+\/[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(
		value
	);
}

function isBase64(value: string): boolean {
	const normalized = value.replace(/\s/gu, "");
	if (
		normalized.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)
	) {
		return false;
	}
	try {
		atob(normalized);
		return true;
	} catch {
		return false;
	}
}

function validateEmailRequest(body: EmailSendRequest): string | undefined {
	const headerValues = [
		body.from,
		...body.to,
		...(body.cc ?? []),
		...(body.bcc ?? []),
		body.replyTo,
		body.subject,
	].filter((value): value is string => value !== undefined);
	if (headerValues.some(hasUnsafeHeaderCharacters)) {
		return "Email fields must not contain control characters.";
	}

	for (const [name, value] of Object.entries(body.headers ?? {})) {
		if (!isHeaderName(name) || hasUnsafeHeaderCharacters(value)) {
			return "Custom headers must use valid names and values.";
		}
	}

	for (const attachment of body.attachments ?? []) {
		if (
			hasUnsafeHeaderCharacters(attachment.filename) ||
			(attachment.contentId !== undefined &&
				hasUnsafeHeaderCharacters(attachment.contentId)) ||
			!isMimeType(attachment.type) ||
			!isBase64(attachment.content)
		) {
			return "Attachments must have valid filenames, MIME types, and base64 content.";
		}
	}

	return undefined;
}

function buildMimeMessage(body: EmailSendRequest, messageId: string): string {
	const headers: string[] = [`From: ${body.from}`, `To: ${body.to.join(", ")}`];
	if (body.cc?.length) {
		headers.push(`Cc: ${body.cc.join(", ")}`);
	}
	if (body.replyTo) {
		headers.push(`Reply-To: ${body.replyTo}`);
	}
	headers.push(`Subject: ${body.subject}`);
	headers.push(`Message-ID: ${messageId}`);
	headers.push(`Date: ${new Date().toUTCString()}`);
	headers.push("MIME-Version: 1.0");

	// Custom headers last so they can override defaults if intentionally set. A
	// caller-supplied Message-ID is skipped because it is already emitted above,
	// as `messageId`.
	for (const [key, value] of Object.entries(body.headers ?? {})) {
		if (key.toLowerCase() === "message-id") {
			continue;
		}
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
			...(attachment.disposition === "inline" && attachment.contentId
				? [
						`Content-ID: ${attachment.contentId.startsWith("<") ? attachment.contentId : `<${attachment.contentId}>`}`,
					]
				: []),
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

export async function listReceivedEmails(
	c: AppContext,
	worker?: string
): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const local = z.array(zEmailRoutingItem).parse(await store.listReceived());
	// Merge in emails captured by workers running in other Miniflare instances so
	// the inbox reflects the whole dev session, then narrow to the selected worker.
	const emails = await aggregateListResults(c, local, "/email/routing");
	return c.json(wrapResponse(filterByWorker(emails, worker)));
}

export async function getReceivedEmail(
	c: AppContext,
	emailId: string,
	worker?: string
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
		// The email may have been captured by a worker in another Miniflare
		// instance; look it up there before giving up.
		return getReceivedEmailFromPeers(c, emailId, worker);
	}
	// When a worker is requested, only return the email if it belongs to it so
	// selecting a worker never leaks another worker's messages.
	if (worker !== undefined && email.worker !== worker) {
		return getReceivedEmailFromPeers(c, emailId, worker);
	}
	// Decode MIME "encoded-word" headers (e.g. `=?utf-8?B?...?=`) in each reply's
	// display text so the explorer shows readable subjects. The lossless bytes
	// remain available through rawBase64.
	const decoded = {
		...email,
		replies: email.replies.map((reply) => ({
			...reply,
			raw: decodeWords(reply.raw),
		})),
	};
	return c.json(wrapResponse(zEmailRoutingDetail.parse(decoded)));
}

/**
 * Looks up an email by id on peer instances. When a `worker` is selected we ask
 * the peer that owns it; otherwise (the unfiltered view) we broadcast the lookup
 * to every peer and return the first hit, so a peer-owned email can still be
 * opened when no worker is selected.
 *
 * @param basePath - The peer API path for the detail endpoint, e.g.
 *   `/email/routing` or `/email/sending`.
 */
async function findEmailOnPeers(
	c: AppContext,
	basePath: string,
	emailId: string,
	worker: string | undefined
): Promise<Response> {
	const encodedId = encodeURIComponent(emailId);

	if (worker !== undefined) {
		// A specific worker is selected: only the owning peer can hold it.
		if (!isLocalWorker(c, worker)) {
			const owner = await findWorkerOwner(
				c,
				await getPeerUrlsIfAggregating(c),
				worker
			);
			if (owner) {
				const response = await fetchFromPeer(
					owner,
					`${basePath}/${encodedId}?worker=${encodeURIComponent(worker)}`
				);
				if (response?.ok) {
					return response;
				}
			}
		}
	} else {
		// Unfiltered view: the email could live on any peer, so ask them all and
		// return the first that has it.
		const peerUrls = await getPeerUrlsIfAggregating(c);
		const responses = await Promise.all(
			peerUrls.map((url) => fetchFromPeer(url, `${basePath}/${encodedId}`))
		);
		const found = responses.find((response) => response?.ok);
		if (found) {
			return found;
		}
	}

	return errorResponse(
		404,
		EMAIL_ERROR_NOT_FOUND,
		`Email '${emailId}' not found.`
	);
}

/**
 * Proxies a received-email lookup to a peer. Used when the email is not held by
 * this instance's store.
 */
async function getReceivedEmailFromPeers(
	c: AppContext,
	emailId: string,
	worker: string | undefined
): Promise<Response> {
	return findEmailOnPeers(c, "/email/routing", emailId, worker);
}

/**
 * Delivers a built test email to the selected worker's `email()` handler.
 *
 * When a `worker` is selected we resolve a direct service binding to it and
 * invoke `handleEmail` ourselves — mirroring how the D1/R2/KV tabs operate on
 * their resource bindings directly. This avoids routing the delivery back
 * through the entry worker: under `wrangler dev` the user workers run inside an
 * inner Miniflare instance behind wrangler's outer ProxyWorker, so neither the
 * public URL nor a `MF-Route-Override` can name a user worker at that outer
 * entry (it only knows wrangler's own proxy workers), which previously failed
 * with "No entrypoint worker found".
 *
 * When no worker is selected (single-worker sessions) we deliver via the entry
 * worker's public URL so address-based routing to the fallback worker still
 * applies, preserving the previous behaviour.
 *
 * Returns the delivery `Response`, or `undefined` when the selected worker has
 * no direct binding on this instance.
 */
async function deliverTestEmail(
	c: AppContext,
	email: {
		from: string;
		to: string;
		id: string;
		mime: string;
		worker: string | undefined;
	}
): Promise<Response | undefined> {
	const { from, to, id, mime, worker } = email;

	const deliverUrl = new URL(CorePaths.EMAIL, "http://localhost");
	deliverUrl.searchParams.set("from", from);
	deliverUrl.searchParams.set("to", to);
	deliverUrl.searchParams.set("id", id);
	// Request the JSON result so we can surface the handler outcome (including a
	// `setReject()` reason) instead of just a text status.
	deliverUrl.searchParams.set("format", "json");

	if (worker === undefined) {
		// No specific worker: let the entry worker route by address.
		const entryUrl = await getPublicUrl(c.env.MINIFLARE_LOOPBACK);
		const publicDeliverUrl = new URL(deliverUrl.pathname, entryUrl);
		publicDeliverUrl.search = deliverUrl.search;
		return fetch(publicDeliverUrl, { method: "POST", body: mime });
	}

	const targetService = getUserWorkerService(c, worker);
	if (targetService === undefined) {
		return undefined;
	}
	const deliverRequest = new Request(deliverUrl, {
		method: "POST",
		body: mime,
	});
	return handleEmail(
		deliverUrl.searchParams,
		deliverRequest,
		targetService,
		worker,
		c.env,
		// Hono's `executionCtx` and workerd's `ExecutionContext` differ only by
		// the `@cloudflare/workers-types` version in scope; `handleEmail` uses
		// only `waitUntil`, which both provide.
		c.executionCtx as unknown as ExecutionContext
	);
}

/**
 * Sends a test email to trigger the worker's email() handler.
 */
export async function sendTestEmail(
	c: AppContext,
	body: EmailSendRequest,
	worker?: string
): Promise<Response> {
	const invalidRequest = validateEmailRequest(body);
	if (invalidRequest !== undefined) {
		return errorResponse(400, 10000, invalidRequest);
	}

	// When the selected worker lives in another Miniflare instance, forward the
	// whole send to the instance that owns it so it reaches the right handler.
	if (worker !== undefined && !isLocalWorker(c, worker)) {
		const owner = await findWorkerOwner(
			c,
			await getPeerUrlsIfAggregating(c),
			worker
		);
		if (owner) {
			const response = await fetchFromPeer(
				owner,
				`/email/routing/send?worker=${encodeURIComponent(worker)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			);
			if (response) {
				return response;
			}
		}
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			`Worker '${worker}' is not available in this dev session.`
		);
	}

	const from = extractAddress(body.from);
	const to = extractAddress(body.to[0] ?? "");

	if (!to) {
		return errorResponse(400, 10000, "At least one recipient is required.");
	}

	// Derive the Message-ID exactly as the `send_email` binding does, so a
	// received and a sent email agree on it. Honour one the caller set
	// explicitly, since the send dialog allows custom headers.
	const messageId =
		getHeader(body.headers, "Message-ID") ?? synthesizeMessageId(from);
	// TODO(miniflare v5): switch on-disk file naming to a mimetext-style id
	// to unify the file name with the Message-ID seen in local explorer.
	const id = messageIdToStorageId(messageId);
	const mime = buildMimeMessage(body, messageId);
	if (new TextEncoder().encode(mime).byteLength > MAX_LOCAL_EMAIL_BYTES) {
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			"Email message exceeds the 1 MiB local development limit."
		);
	}

	const response = await deliverTestEmail(c, { from, to, id, mime, worker });
	if (response === undefined) {
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			`Worker '${worker}' is not available in this dev session.`
		);
	}

	// A 4xx means the message itself was invalid (bad envelope, unparseable, or
	// too large) and never reached the handler — that's a send failure. Anything
	// else (including a handler that rejected or threw) counts as delivered.
	if (response.status >= 400 && response.status < 500) {
		const message = await response.text();
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			message || "Failed to deliver test email."
		);
	}

	const result = zEmailHandlerResult.parse(await response.json());
	return c.json(
		wrapResponse({
			messageId,
			outcome: result.outcome,
			...(result.rejectReason !== undefined
				? { rejectReason: result.rejectReason }
				: {}),
		})
	);
}

export async function listSentEmails(
	c: AppContext,
	worker?: string
): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const local = z.array(zEmailSendingItem).parse(await store.listSent());
	// Merge in emails sent by workers running in other Miniflare instances so the
	// list reflects the whole dev session, then narrow to the selected worker.
	const emails = await aggregateListResults(c, local, "/email/sending");
	return c.json(wrapResponse(filterByWorker(emails, worker)));
}

export async function getSentEmail(
	c: AppContext,
	emailId: string,
	worker?: string
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
	if (!email || (worker !== undefined && email.worker !== worker)) {
		// The email may have been sent by a worker in another Miniflare instance;
		// look it up there before giving up.
		return getSentEmailFromPeers(c, emailId, worker);
	}
	return c.json(wrapResponse(zEmailSendingDetail.parse(email)));
}

/**
 * Proxies a sent-email lookup to a peer. Used when the email is not held by this
 * instance's store.
 */
async function getSentEmailFromPeers(
	c: AppContext,
	emailId: string,
	worker: string | undefined
): Promise<Response> {
	return findEmailOnPeers(c, "/email/sending", emailId, worker);
}
