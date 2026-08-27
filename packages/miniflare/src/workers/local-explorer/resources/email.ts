import { decodeWords } from "postal-mime";
import { z } from "zod";
import { EMAIL_STORE_SERVICE_NAME } from "../../../plugins/core/constants";
import { CoreBindings, CorePaths } from "../../core";
import { handleEmail } from "../../core/email";
import { base64ToBytes, bytesToBase64 } from "../../email/capture";
import {
	zEmailHandlerResult,
	zEmailRoutingDetail,
	zEmailRoutingItem,
	zEmailSendingDetail,
	zEmailSendingItem,
} from "../../email/contracts";
import {
	hasControlCharacters,
	isMimeType,
	normalizeBase64,
} from "../../email/input-validation";
import {
	extractAddressFromString,
	messageIdToStorageId,
	synthesizeMessageId,
} from "../../email/message-id";
import { buildMimeMessage } from "../../email/mime";
import {
	fetchFromPeer,
	getPeerEntrypoint,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import { zLocalExplorerListWorkersResponse } from "../generated/zod.gen";
import type {
	EmailRoutingItem,
	EmailSendingItem,
	EmailSendRequest,
} from "../../email/contracts";
import type {
	EmailListPage,
	EmailStoreService,
	StoredRoutingEmail,
} from "../../email/storage";
import type { AppContext } from "../common";
import type { zEmailListRoutingData } from "../generated/zod.gen";

const EMAIL_ERROR_NOT_FOUND = 10601;
const EMAIL_ERROR_SEND_FAILED = 10602;
const EMAIL_ERROR_PEER_UNAVAILABLE = 10603;
const EMAIL_WARNING_CAPTURE_TRUNCATED = 10604;

function getEmailStore(c: AppContext): EmailStoreService {
	return c.env[CoreBindings.SERVICE_EMAIL_STORE];
}

type EmailPeerSource = { id: string; url: string };
type EmailSourceService = Fetcher & Pick<EmailStoreService, "getSourceId">;

async function getEmailPeerSourcesIfAggregating(
	c: AppContext
): Promise<EmailPeerSource[]> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	const discovered = await Promise.all(
		peerUrls.map(async (url): Promise<EmailPeerSource | undefined> => {
			try {
				const store = getPeerEntrypoint(
					url,
					EMAIL_STORE_SERVICE_NAME
				) as EmailSourceService;
				const sourceId = await store.getSourceId();
				return sourceId === "" ? undefined : { id: `peer:${sourceId}`, url };
			} catch {
				return;
			}
		})
	);
	return [
		...new Map(
			discovered
				.filter((source) => source !== undefined)
				.map((source) => [source.id, source])
		).values(),
	].sort((a, b) => a.id.localeCompare(b.id));
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
 * Keeps only the emails belonging to `worker`. Returns all with no 'worker'
 */
type EmailListQuery = z.output<
	ReturnType<typeof zEmailListRoutingData.shape.query.unwrap>
>;

type EmailListItem = EmailRoutingItem | EmailSendingItem;
type EmailCursorState = Record<string, string | null | undefined>;
type EmailCursorResource = "routing" | "sending";
type EmailCursorEnvelope = {
	resource: EmailCursorResource;
	worker?: string;
	sources: EmailCursorState;
};
const EMAIL_CURSOR_START = "";
type EmailCandidate<T> = {
	item: T;
	nextCursor?: string;
	hasMore: boolean;
};
type PeerEmailPage<T> = {
	result: T[];
	result_info: { cursor?: string; has_more: boolean };
};

function parsePeerEmailList<T>(
	value: unknown,
	itemSchema: z.ZodType<T>
): PeerEmailPage<T> {
	return z
		.object({
			result: z.array(itemSchema),
			result_info: z.object({
				cursor: z.string().optional(),
				has_more: z.boolean(),
			}),
		})
		.parse(value);
}

function buildEmailListResponse<T>(
	c: AppContext,
	query: EmailListQuery,
	items: T[],
	hasMore: boolean,
	cursor?: string
): Response {
	return c.json({
		...wrapResponse(items),
		result_info: {
			count: items.length,
			per_page: query.per_page,
			has_more: hasMore,
			...(cursor === undefined ? {} : { cursor }),
		},
	});
}

function encodeAggregateCursor(
	resource: EmailCursorResource,
	worker: string | undefined,
	sources: EmailCursorState
): string {
	const json = JSON.stringify({ resource, worker, sources });
	return `a.${bytesToBase64(new TextEncoder().encode(json))}`;
}

function isEmailCursorState(value: unknown): value is EmailCursorState {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every(
			(cursor) => cursor === null || typeof cursor === "string"
		)
	);
}

function isEmailCursorEnvelope(value: unknown): value is EmailCursorEnvelope {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		"resource" in value &&
		(value.resource === "routing" || value.resource === "sending") &&
		(!("worker" in value) || typeof value.worker === "string") &&
		"sources" in value &&
		isEmailCursorState(value.sources)
	);
}

function isInvalidEmailCursor(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		error.message === "Invalid email pagination cursor"
	);
}

/**
 * Decodes an aggregate pagination cursor into per-source state.
 *
 * State for sources not currently in `sources` (e.g. a peer that dropped out of
 * the dev session mid-pagination) is preserved verbatim rather than discarded:
 * we simply don't fetch from those sources, but carrying their position forward
 * in the cursor means that if the peer rejoins within the same pagination
 * sequence it resumes where it left off instead of replaying from its newest
 * item, which would surface duplicates.
 */
function decodeAggregateCursor(
	cursor: string | undefined,
	resource: EmailCursorResource,
	worker: string | undefined
): EmailCursorState {
	if (cursor === undefined) {
		return {};
	}
	try {
		if (!cursor.startsWith("a.")) {
			throw new Error("Invalid cursor");
		}
		const envelope = JSON.parse(
			new TextDecoder().decode(base64ToBytes(cursor.slice(2)))
		) as unknown;
		if (
			!isEmailCursorEnvelope(envelope) ||
			envelope.resource !== resource ||
			envelope.worker !== worker
		) {
			throw new Error("Invalid cursor");
		}
		return envelope.sources;
	} catch {
		throw new TypeError("Invalid email pagination cursor");
	}
}

async function listLocalEmails<T>(
	query: EmailListQuery,
	resource: EmailCursorResource,
	list: (cursor: string | undefined, limit: number) => Promise<EmailListPage<T>>
): Promise<EmailListPage<T>> {
	const state = decodeAggregateCursor(query.cursor, resource, query.worker);
	const localCursor =
		state.local === EMAIL_CURSOR_START ? undefined : state.local;
	if (localCursor === null) {
		return { items: [], hasMore: false };
	}
	const { cursor, ...page } = await list(localCursor, query.per_page);
	return {
		...page,
		...(cursor === undefined
			? {}
			: {
					cursor: encodeAggregateCursor(resource, query.worker, {
						...state,
						local: cursor,
					}),
				}),
	};
}

function getEmailTimestamp(email: EmailListItem): string {
	return "receivedAt" in email ? email.receivedAt : email.sentAt;
}

function compareEmailCandidates<T extends EmailListItem>(
	[sourceA, candidateA]: [string, EmailCandidate<T>],
	[sourceB, candidateB]: [string, EmailCandidate<T>]
): number {
	const timestampOrder = getEmailTimestamp(candidateB.item).localeCompare(
		getEmailTimestamp(candidateA.item)
	);
	return timestampOrder || sourceA.localeCompare(sourceB);
}

async function getNextLocalEmail<T extends EmailListItem>(
	list: (cursor?: string) => Promise<EmailListPage<T>>,
	cursor: string | undefined,
	worker: string | undefined
): Promise<EmailCandidate<T> | undefined> {
	let currentCursor = cursor;
	for (;;) {
		const page = await list(currentCursor);
		const item = page.items[0];
		if (item === undefined) {
			return undefined;
		}
		if (worker === undefined || item.worker === worker) {
			return {
				item,
				nextCursor: page.cursor,
				hasMore: page.hasMore,
			};
		}
		if (!page.hasMore || page.cursor === undefined) {
			return undefined;
		}
		currentCursor = page.cursor;
	}
}

async function getNextPeerEmail<T extends EmailListItem>(
	peerUrl: string,
	basePath: string,
	cursor: string | undefined,
	worker: string | undefined,
	itemSchema: z.ZodType<T>
): Promise<{
	candidate?: EmailCandidate<T>;
} | null> {
	const params = new URLSearchParams({ per_page: "1" });
	if (cursor !== undefined) {
		params.set("cursor", cursor);
	}
	if (worker !== undefined) {
		params.set("worker", worker);
	}
	const response = await fetchFromPeer(peerUrl, `${basePath}?${params}`);
	if (response?.status === 400) {
		throw new TypeError("Invalid email pagination cursor");
	}
	if (!response?.ok) {
		return null;
	}
	try {
		const data = parsePeerEmailList(await response.json(), itemSchema);
		const item = data.result[0];
		if (item === undefined) {
			return {};
		}
		const nextCursor = data.result_info.cursor;
		const hasMore = data.result_info.has_more;
		if (hasMore && (!nextCursor || nextCursor === cursor)) {
			return null;
		}
		return {
			candidate: { item, nextCursor, hasMore },
		};
	} catch {
		return null;
	}
}

async function listAggregatedEmails<T extends EmailListItem>(options: {
	c: AppContext;
	query: EmailListQuery;
	basePath: string;
	resource: EmailCursorResource;
	peerSources: EmailPeerSource[];
	localList: (cursor?: string) => Promise<EmailListPage<T>>;
	itemSchema: z.ZodType<T>;
}): Promise<{
	items: T[];
	cursor?: string;
	hasMore: boolean;
}> {
	const state = decodeAggregateCursor(
		options.query.cursor,
		options.resource,
		options.query.worker
	);
	const peers = new Map(
		(options.query.cursor === undefined
			? options.peerSources
			: options.peerSources.filter(({ id }) => Object.hasOwn(state, id))
		).map((peer) => [peer.id, peer])
	);
	const sourceIds = ["local", ...peers.keys()];
	for (const source of sourceIds) {
		if (!Object.hasOwn(state, source)) {
			state[source] = EMAIL_CURSOR_START;
		}
	}
	const candidates = new Map<string, EmailCandidate<T>>();
	const unavailableSources = new Set<string>();

	async function getCandidate(source: string) {
		if (state[source] === null) {
			return;
		}
		let candidate: EmailCandidate<T> | null | undefined;
		if (source === "local") {
			candidate = await getNextLocalEmail<T>(
				options.localList,
				state[source] === EMAIL_CURSOR_START ? undefined : state[source],
				options.query.worker
			);
		} else {
			const peer = peers.get(source);
			if (peer === undefined) {
				return;
			}
			const result = await getNextPeerEmail<T>(
				peer.url,
				options.basePath,
				state[source] === EMAIL_CURSOR_START ? undefined : state[source],
				options.query.worker,
				options.itemSchema
			);
			if (result === null) {
				candidate = null;
			} else {
				candidate = result.candidate;
			}
		}
		if (candidate === null) {
			unavailableSources.add(source);
			return;
		}
		if (candidate === undefined) {
			state[source] = null;
			return;
		}
		candidates.set(source, candidate);
	}

	await Promise.all(sourceIds.map((source) => getCandidate(source)));
	const items: T[] = [];
	while (items.length < options.query.per_page && candidates.size > 0) {
		const source = [...candidates.entries()].sort(
			compareEmailCandidates
		)[0]?.[0];
		if (source === undefined) {
			break;
		}
		const candidate = candidates.get(source);
		if (candidate === undefined) {
			break;
		}
		candidates.delete(source);
		items.push(candidate.item);
		const canContinue = candidate.hasMore && candidate.nextCursor !== undefined;
		state[source] = canContinue ? candidate.nextCursor : null;
		if (items.length < options.query.per_page && canContinue) {
			await getCandidate(source);
		}
	}

	// Only the sources consulted this page can advance pagination. Absent
	// sources (e.g. a peer that shut down mid-pagination) keep a preserved
	// cursor in `state` but are never fetched here, so their cursor never gets
	// cleared to null. Counting them towards `hasMore` would keep it true
	// forever and hand the client an endless run of empty pages once the live
	// sources are exhausted. Temporarily unavailable sources have the same
	// treatment for this page, so `hasMore` only counts reachable `sourceIds`.
	//
	// While `hasMore` is true the full `state` is encoded, so a preserved
	// absent-source cursor round-trips through the client and lets that peer
	// resume where it left off if it rejoins during the same run. Once
	// `hasMore` is false the run is over and the client discards the cursor, so
	// there is nothing to preserve — dropping it is correct.
	const hasMore =
		candidates.size > 0 ||
		sourceIds.some((source) => {
			if (unavailableSources.has(source)) {
				return false;
			}
			const cursor = state[source];
			return cursor !== null && cursor !== undefined;
		});
	return {
		items,
		hasMore,
		...(hasMore
			? {
					cursor: encodeAggregateCursor(
						options.resource,
						options.query.worker,
						state
					),
				}
			: {}),
	};
}

/**
 * Finds the peer instance that serves `worker` by asking each peer which workers
 * it hosts. Tracks unavailable peers separately so callers can distinguish
 * "worker does not exist" from "ownership could not be determined".
 */
async function findWorkerOwner(
	c: AppContext,
	peerUrls: string[],
	worker: string
): Promise<{ owner: string | null; unavailable: boolean }> {
	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, "/local/workers");
			if (!response?.ok) {
				return { owner: null, unavailable: true };
			}
			try {
				const data = zLocalExplorerListWorkersResponse.parse(
					await response.json()
				);
				const owns =
					data.result?.some((w) => w.isSelf === true && w.name === worker) ??
					false;
				return { owner: owns ? url : null, unavailable: false };
			} catch {
				return { owner: null, unavailable: true };
			}
		})
	);
	return {
		owner: responses.find(({ owner }) => owner !== null)?.owner ?? null,
		unavailable: responses.some(({ unavailable }) => unavailable),
	};
}

async function fetchWorkerScopedListFromOwner(
	ownerUrl: string,
	basePath: string,
	query: EmailListQuery
): Promise<Response | null> {
	if (query.worker === undefined) {
		return null;
	}
	const params = new URLSearchParams({
		per_page: String(query.per_page),
		worker: query.worker,
	});
	if (query.cursor !== undefined) {
		params.set("cursor", query.cursor);
	}
	return (await fetchFromPeer(ownerUrl, `${basePath}?${params}`)) ?? null;
}

function peerUnavailableResponse(worker?: string): Response {
	return errorResponse(
		502,
		EMAIL_ERROR_PEER_UNAVAILABLE,
		worker === undefined
			? "One or more workers are temporarily unavailable in this dev session."
			: `Worker '${worker}' is temporarily unavailable in this dev session.`
	);
}

/**
 * Decodes MIME "encoded-word" sequences (e.g. `=?utf-8?B?...?=`) in a message's
 * header block for display, leaving the body untouched.
 *
 * The header block ends at the first blank line (`\r\n\r\n`). When that
 * separator is absent the input is not a well-formed message — most commonly a
 * body that was truncated during capture (see `captureRawForBodyRow` in
 * ../../email/capture), whose bytes may be arbitrary and must not be fed to
 * `decodeWords`. In that case we decode only the leading run of lines that look
 * like header fields (`Name:` or a folded continuation) and pass everything from
 * the first non-header line through verbatim, so a truncated body is never
 * mangled.
 */
function decodeEmailHeaders(raw: string): string {
	const separator = /\r?\n\r?\n/u.exec(raw);
	if (separator?.index !== undefined) {
		return `${decodeWords(raw.slice(0, separator.index))}${raw.slice(separator.index)}`;
	}

	// No header/body separator: decode only the leading header-shaped lines.
	const lines = raw.split(/(\r?\n)/u);
	let headerEnd = 0;
	for (let index = 0; index < lines.length; index += 2) {
		const line = lines[index];
		const isFieldStart = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+:/u.test(line);
		const isFoldedContinuation = index > 0 && /^[ \t]/u.test(line);
		if (line === "" || (!isFieldStart && !isFoldedContinuation)) {
			break;
		}
		// Include this content line and its following newline separator.
		headerEnd = index + 2;
	}
	const headerPart = lines.slice(0, headerEnd).join("");
	const rest = lines.slice(headerEnd).join("");
	return `${decodeWords(headerPart)}${rest}`;
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
	if (headerValues.some(hasControlCharacters)) {
		return "Email fields must not contain control characters.";
	}

	if (Object.values(body.headers ?? {}).some(hasControlCharacters)) {
		return "Custom headers must use valid names and values.";
	}
	try {
		new Headers(body.headers);
	} catch {
		return "Custom headers must use valid names and values.";
	}

	for (const attachment of body.attachments ?? []) {
		if (
			hasControlCharacters(attachment.filename) ||
			(attachment.contentId !== undefined &&
				hasControlCharacters(attachment.contentId)) ||
			!isMimeType(attachment.type) ||
			normalizeBase64(attachment.content) === undefined
		) {
			return "Attachments must have valid filenames, MIME types, and base64 content.";
		}
	}

	return undefined;
}

type EmailListDescriptor<T extends EmailListItem> = {
	resource: EmailCursorResource;
	basePath: string;
	itemSchema: z.ZodType<T>;
	listStorePage: (
		store: EmailStoreService,
		cursor: string | undefined,
		limit: number,
		worker?: string
	) => Promise<EmailListPage<unknown>>;
};

const receivedEmailListDescriptor: EmailListDescriptor<EmailRoutingItem> = {
	resource: "routing",
	basePath: "/local/email/routing",
	itemSchema: zEmailRoutingItem,
	async listStorePage(store, cursor, limit, worker) {
		using result = (await store.listReceived(cursor, limit, worker)) as Awaited<
			ReturnType<EmailStoreService["listReceived"]>
		> &
			Disposable;
		return structuredClone(result);
	},
};

const sentEmailListDescriptor: EmailListDescriptor<EmailSendingItem> = {
	resource: "sending",
	basePath: "/local/email/sending",
	itemSchema: zEmailSendingItem,
	async listStorePage(store, cursor, limit, worker) {
		using result = (await store.listSent(cursor, limit, worker)) as Awaited<
			ReturnType<EmailStoreService["listSent"]>
		> &
			Disposable;
		return structuredClone(result);
	},
};

function parseEmailListPage<T extends EmailListItem>(
	page: EmailListPage<unknown>,
	itemSchema: z.ZodType<T>
): EmailListPage<T> {
	return {
		...page,
		items: z.array(itemSchema).parse(page.items),
	};
}

async function listEmails<T extends EmailListItem>(
	c: AppContext,
	query: EmailListQuery,
	descriptor: EmailListDescriptor<T>
): Promise<Response> {
	const store = getEmailStore(c);
	try {
		if (query.worker !== undefined) {
			decodeAggregateCursor(query.cursor, descriptor.resource, query.worker);
			if (isLocalWorker(c, query.worker)) {
				const page = await listLocalEmails(
					query,
					descriptor.resource,
					async (cursor, limit) =>
						parseEmailListPage(
							await descriptor.listStorePage(
								store,
								cursor,
								limit,
								query.worker
							),
							descriptor.itemSchema
						)
				);
				return buildEmailListResponse(
					c,
					query,
					page.items,
					page.hasMore,
					page.cursor
				);
			}
			const ownerLookup = await findWorkerOwner(
				c,
				await getPeerUrlsIfAggregating(c),
				query.worker
			);
			const owner = ownerLookup.owner;
			if (owner !== null) {
				const response = await fetchWorkerScopedListFromOwner(
					owner,
					descriptor.basePath,
					query
				);
				if (response !== null) {
					return response;
				}
				return peerUnavailableResponse(query.worker);
			}
			if (ownerLookup.unavailable) {
				return peerUnavailableResponse(query.worker);
			}
			return buildEmailListResponse(c, query, [], false);
		}

		const peerSources = await getEmailPeerSourcesIfAggregating(c);
		if (peerSources.length === 0) {
			const page = await listLocalEmails(
				query,
				descriptor.resource,
				async (cursor, limit) =>
					parseEmailListPage(
						await descriptor.listStorePage(store, cursor, limit),
						descriptor.itemSchema
					)
			);
			return buildEmailListResponse(
				c,
				query,
				page.items,
				page.hasMore,
				page.cursor
			);
		}
		const page = await listAggregatedEmails({
			c,
			query,
			basePath: descriptor.basePath,
			resource: descriptor.resource,
			peerSources,
			itemSchema: descriptor.itemSchema,
			localList: async (cursor) =>
				parseEmailListPage(
					await descriptor.listStorePage(store, cursor, 1, query.worker),
					descriptor.itemSchema
				),
		});
		return buildEmailListResponse(
			c,
			query,
			page.items,
			page.hasMore,
			page.cursor
		);
	} catch (error) {
		if (!isInvalidEmailCursor(error)) {
			throw error;
		}
		return errorResponse(400, 10000, "Invalid email pagination cursor");
	}
}

export async function listReceivedEmails(
	c: AppContext,
	query: EmailListQuery
): Promise<Response> {
	return listEmails(c, query, receivedEmailListDescriptor);
}

export async function getReceivedEmail(
	c: AppContext,
	emailId: string,
	worker?: string
): Promise<Response> {
	const store = getEmailStore(c);
	using email = (await store.findReceived(
		messageIdToStorageId(emailId),
		worker
	)) as (StoredRoutingEmail & Disposable) | undefined;
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
	// display text so the explorer shows readable subjects.
	const { captureTruncated, replies: storedReplies, ...storedEmail } = email;
	const replyCaptureTruncated = storedReplies.some(
		(reply) => reply.captureTruncated
	);
	const decoded = {
		...storedEmail,
		replies: storedReplies.map(
			({ captureTruncated: _captureTruncated, ...reply }) => ({
				...reply,
				raw: decodeEmailHeaders(reply.raw),
			})
		),
	};
	const messages = [];
	if (captureTruncated) {
		messages.push({
			code: EMAIL_WARNING_CAPTURE_TRUNCATED,
			message:
				"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
		});
	}
	if (replyCaptureTruncated) {
		messages.push({
			code: EMAIL_WARNING_CAPTURE_TRUNCATED,
			message:
				"Displayed reply content was truncated during local capture. The complete reply is available in the local filesystem; see the development log for its path.",
		});
	}
	return c.json({
		...wrapResponse(zEmailRoutingDetail.parse(decoded)),
		messages,
	});
}

/**
 * Looks up an email by id on peer instances. When a `worker` is selected we ask
 * the peer that owns it; otherwise (the unfiltered view) we broadcast the lookup
 * to every peer and return the first hit, so a peer-owned email can still be
 * opened when no worker is selected.
 *
 * @param basePath - The peer API path for the email endpoint, e.g.
 *   `/local/email/routing` or `/local/email/sending`.
 */
async function findEmailOnPeers(
	c: AppContext,
	basePath: string,
	emailId: string,
	worker: string | undefined
): Promise<Response> {
	const params = new URLSearchParams({ email_id: emailId });
	if (worker !== undefined) {
		params.set("worker", worker);
	}
	const query = `?${params}`;

	if (worker !== undefined) {
		// A specific worker is selected: only the owning peer can hold it.
		if (!isLocalWorker(c, worker)) {
			const ownerLookup = await findWorkerOwner(
				c,
				await getPeerUrlsIfAggregating(c),
				worker
			);
			const owner = ownerLookup.owner;
			if (owner) {
				const response = await fetchFromPeer(owner, `${basePath}${query}`);
				if (response !== null) {
					return response;
				}
				return peerUnavailableResponse(worker);
			}
			if (ownerLookup.unavailable) {
				return peerUnavailableResponse(worker);
			}
		}
	} else {
		// Unfiltered view: the email could live on any peer, so ask them all and
		// return the first that has it.
		const peerUrls = await getPeerUrlsIfAggregating(c);
		const responses = await Promise.all(
			peerUrls.map((url) => fetchFromPeer(url, `${basePath}${query}`))
		);
		const found = responses.find((response) => response?.ok);
		if (found) {
			return found;
		}
		const peerError = responses.find(
			(response): response is Response =>
				response !== null && response.status !== 404
		);
		if (peerError !== undefined) {
			return peerError;
		}
		if (responses.some((response) => response === null)) {
			return peerUnavailableResponse();
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
	return findEmailOnPeers(c, "/local/email/routing", emailId, worker);
}

/**
 * Delivers a built test email to the selected worker's `email()` handler.
 *
 * Resolves a direct service binding to the target worker and invokes
 * `handleEmail`, which avoids routing the delivery back through the entry
 * worker. A worker is always required: a single dev port can serve multiple
 * workers, so the target cannot be inferred from the recipient address.
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
		worker: string;
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

	// A target worker is required: a single dev port can serve multiple workers,
	// so the recipient address alone cannot identify which email() handler to
	// invoke.
	if (worker === undefined) {
		return errorResponse(400, 10000, "A target worker is required.");
	}

	// When the selected worker lives in another Miniflare instance, forward the
	// whole send to the instance that owns it.
	if (!isLocalWorker(c, worker)) {
		const owner = (
			await findWorkerOwner(c, await getPeerUrlsIfAggregating(c), worker)
		).owner;
		if (owner) {
			const response = await fetchFromPeer(
				owner,
				`/local/email/routing/send?worker=${encodeURIComponent(worker)}`,
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

	const from = extractAddressFromString(body.from);
	const to = extractAddressFromString(body.to[0] ?? "");

	if (!to) {
		return errorResponse(400, 10000, "At least one recipient is required.");
	}

	// Locally composed messages use the same Message-ID shape as production.
	// buildMimeMessage() ignores any caller-supplied Message-ID header.
	const messageId = synthesizeMessageId(from);
	const id = messageIdToStorageId(messageId);
	const mime = buildMimeMessage(body, messageId);

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

	// Depending on whether the missing RPC method throws synchronously or when
	// awaited, `handleEmail` returns either plain text or a JSON result containing
	// one `unhandled` event. Surface the same descriptive send failure for both.
	const contentType = response.headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/json")) {
		// Drain the (plain-text) body so the underlying stream is consumed.
		await response.text();
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			`Worker '${worker}' does not export an email() handler.`
		);
	}

	const result = zEmailHandlerResult.parse(await response.json());
	if (result.events.length === 1 && result.events[0]?.type === "unhandled") {
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			`Worker '${worker}' does not export an email() handler.`
		);
	}
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
	query: EmailListQuery
): Promise<Response> {
	return listEmails(c, query, sentEmailListDescriptor);
}

export async function getSentEmail(
	c: AppContext,
	emailId: string,
	worker?: string
): Promise<Response> {
	const store = getEmailStore(c);
	using email = (await store.findSent(messageIdToStorageId(emailId), worker)) as
		| (NonNullable<Awaited<ReturnType<EmailStoreService["findSent"]>>> &
				Disposable)
		| undefined;
	if (!email || (worker !== undefined && email.worker !== worker)) {
		// The email may have been sent by a worker in another Miniflare instance;
		// look it up there before giving up.
		return getSentEmailFromPeers(c, emailId, worker);
	}
	const { captureTruncated, ...storedEmail } = email;
	return c.json({
		...wrapResponse(zEmailSendingDetail.parse(storedEmail)),
		messages: captureTruncated
			? [
					{
						code: EMAIL_WARNING_CAPTURE_TRUNCATED,
						message:
							"Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
					},
				]
			: [],
	});
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
	return findEmailOnPeers(c, "/local/email/sending", emailId, worker);
}
