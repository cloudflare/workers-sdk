/**
 * The local email store: a SQLite-backed Durable Object holding the emails
 * captured during a dev session. The `send_email` binding and the `email()`
 * receiving path write to it, and the Local Explorer's Email API reads from it,
 * all over workerd-internal RPC. Because every hop stays inside workerd, capture
 * never depends on the Node host loopback server — so it works even when a
 * binding method is invoked through the synchronous platform proxy
 * (`getPlatformProxy()` / `getBindings()`), which blocks the Node main thread.
 *
 * Metadata records are stored as JSON blobs, discriminated by kind and ordered
 * by capture time. Received and reply MIME bodies are stored through separate
 * direct RPCs into separate rows, then the metadata row is published last.
 * Lists derive compact summaries from bounded cursor pages. This data is local
 * only: it is never exposed to the user's app or sent anywhere, and it does not
 * persist across dev-server restarts (the store is backed by the instance temp
 * directory).
 */
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
	base64ToBytes,
	bytesToBase64,
	MAX_EMAIL_ROW_VALUE_BYTES,
} from "./capture";
import {
	zEmailBase,
	zEmailHandlerForward,
	zEmailHandlerReplyApi,
	zEmailSendingDetail,
} from "./contracts";
import { messageIdToStorageId } from "./message-id";
import type {
	EmailListPage,
	StoredRoutingEmail,
	StoredRoutingEmailMetadata,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailSummary,
} from "./storage";

export type { StoredSendingEmail };

function decodeCapturedRaw(rawBase64: string, truncated: boolean): string {
	const bytes = base64ToBytes(rawBase64);
	return new TextDecoder().decode(
		truncated ? trimIncompleteUtf8Suffix(bytes) : bytes
	);
}

function trimIncompleteUtf8Suffix(bytes: Uint8Array): Uint8Array {
	if (bytes.byteLength === 0) {
		return bytes;
	}
	let sequenceStart = bytes.byteLength - 1;
	while (
		sequenceStart > 0 &&
		(bytes[sequenceStart] & 0xc0) === 0x80 &&
		bytes.byteLength - sequenceStart < 4
	) {
		sequenceStart--;
	}
	const leadingByte = bytes[sequenceStart];
	const expectedLength =
		(leadingByte & 0x80) === 0
			? 1
			: (leadingByte & 0xe0) === 0xc0
				? 2
				: (leadingByte & 0xf0) === 0xe0
					? 3
					: (leadingByte & 0xf8) === 0xf0
						? 4
						: 1;
	return bytes.byteLength - sequenceStart < expectedLength
		? bytes.subarray(0, sequenceStart)
		: bytes;
}

function materialiseReceivedEmail(
	email: StoredRoutingEmailMetadata,
	rawBase64: string,
	replyRawBase64: Map<number, string>
): StoredRoutingEmail {
	return {
		...email,
		raw: decodeCapturedRaw(rawBase64, email.captureTruncated === true),
		rawBase64,
		replies: email.replies.map((reply, index) => {
			const encoded = replyRawBase64.get(index);
			if (encoded === undefined) {
				throw new Error(
					`Received email ${email.messageId} has no captured reply body at index ${index}`
				);
			}
			return {
				...reply,
				raw: decodeCapturedRaw(encoded, reply.captureTruncated === true),
				rawBase64: encoded,
			};
		}),
	};
}

/** Decodes a sent record's `raw` when it was stored base64-only. */
function materialiseSentEmail(email: StoredSendingEmail): StoredSendingEmail {
	if (email.raw !== undefined || email.rawBase64 === undefined) {
		return email;
	}
	return {
		...email,
		raw: decodeCapturedRaw(email.rawBase64, email.captureTruncated === true),
	};
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS email_store_metadata (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS emails (
		seq  INTEGER PRIMARY KEY AUTOINCREMENT,
		kind TEXT NOT NULL CHECK (kind IN ('received', 'sent')),
		id   TEXT NOT NULL,
		created_at TEXT NOT NULL,
		data TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS emails_by_kind_seq ON emails (kind, seq DESC)`,
	`CREATE INDEX IF NOT EXISTS emails_by_kind_created_seq ON emails (
			kind, created_at DESC, seq DESC
		)`,
	`CREATE INDEX IF NOT EXISTS emails_by_kind_id ON emails (kind, id)`,
	`CREATE INDEX IF NOT EXISTS emails_by_kind_worker_seq ON emails (
			kind, json_extract(data, '$.worker'), seq DESC
		)`,
	`CREATE INDEX IF NOT EXISTS emails_by_kind_worker_created_seq ON emails (
			kind, json_extract(data, '$.worker'), created_at DESC, seq DESC
		)`,
	`CREATE TABLE IF NOT EXISTS received_email_bodies (
			capture_id TEXT NOT NULL,
			part INTEGER NOT NULL,
			raw_base64 TEXT NOT NULL,
			PRIMARY KEY (capture_id, part)
		)`,
];

const zStoredEmailReply = zEmailHandlerReplyApi.omit({
	raw: true,
	rawBase64: true,
});
const zStoredEmailReplyMetadata = zStoredEmailReply.extend({
	captureTruncated: z.boolean().optional(),
});
const zStoredEmailEvent = z.discriminatedUnion("type", [
	z.object({
		type: z.enum(["forward", "reply"]),
		timestamp: z.string(),
		messageId: z.string(),
	}),
	z.object({
		type: z.enum(["received", "reject", "unhandled"]),
		timestamp: z.string(),
	}),
]);
export const zStoredRoutingEmailSummary = zEmailBase.extend({
	to: z.string(),
	cc: z.array(z.string()).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	receivedAt: z.string(),
	rawSize: z.number(),
	outcome: z.enum(["ok", "exception"]),
	rejectReason: z.string().optional(),
	forwards: z.array(zEmailHandlerForward),
	replies: z.array(zStoredEmailReply),
	events: z.array(zStoredEmailEvent),
});
const zStoredRoutingEmailMetadata = zStoredRoutingEmailSummary.extend({
	captureTruncated: z.boolean().optional(),
	replies: z.array(zStoredEmailReplyMetadata),
});
export const zStoredRoutingEmail = zStoredRoutingEmailMetadata.extend({
	raw: z.string(),
	rawBase64: z.string(),
	replies: z.array(
		zEmailHandlerReplyApi.extend({
			raw: z.string(),
			rawBase64: z.string(),
			captureTruncated: z.boolean().optional(),
		})
	),
});

type EmailTable = "received" | "sent";
type EmailCursor = { createdAt: string; seq: number };
const encoder = new TextEncoder();

function assertEmailRowValueFits(value: string, description: string): void {
	if (encoder.encode(value).byteLength > MAX_EMAIL_ROW_VALUE_BYTES) {
		throw new RangeError(
			`${description} exceeds the ${MAX_EMAIL_ROW_VALUE_BYTES}-byte email storage row value limit`
		);
	}
}

function createStatements(kind: EmailTable) {
	return {
		insert: `INSERT INTO emails (kind, id, created_at, data)
			VALUES ('${kind}', ?, ?, ?) RETURNING seq`,
		list: `SELECT seq, created_at, data FROM emails
			WHERE kind = '${kind}'
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		listForWorker: `SELECT seq, created_at, data FROM emails
			WHERE kind = '${kind}' AND json_extract(data, '$.worker') = ?
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		listAfter: `SELECT seq, created_at, data FROM emails
			WHERE kind = '${kind}'
			AND (created_at < ? OR (created_at = ? AND seq < ?))
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		listAfterForWorker: `SELECT seq, created_at, data FROM emails
			WHERE kind = '${kind}'
			AND (created_at < ? OR (created_at = ? AND seq < ?))
			AND json_extract(data, '$.worker') = ?
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		find: `SELECT seq, data FROM emails WHERE kind = '${kind}' AND id = ?
			ORDER BY seq DESC LIMIT 1`,
		findForWorker: `SELECT seq, data FROM emails
			WHERE kind = '${kind}' AND id = ?
			AND json_extract(data, '$.worker') = ?
			ORDER BY seq DESC LIMIT 1`,
	};
}

const STATEMENTS = {
	received: createStatements("received"),
	sent: createStatements("sent"),
	insertReceivedBody: `INSERT INTO received_email_bodies
		(capture_id, part, raw_base64) VALUES (?, ?, ?)`,
	countReceivedBodies: `SELECT COUNT(*) AS count, MIN(part) AS first_part,
		MAX(part) AS last_part FROM received_email_bodies WHERE capture_id = ?`,
	findReceivedBodies: `SELECT part, raw_base64 FROM received_email_bodies
		WHERE capture_id = ? ORDER BY part`,
	discardReceivedBodies:
		"DELETE FROM received_email_bodies WHERE capture_id = ?",
	discardReceivedMetadata:
		"DELETE FROM emails WHERE kind = 'received' AND json_extract(data, '$.bodyId') = ?",
	insertMetadata: `INSERT OR IGNORE INTO email_store_metadata (key, value)
		VALUES (?, ?)`,
	findMetadata: "SELECT value FROM email_store_metadata WHERE key = ?",
	clearReceivedBodies: "DELETE FROM received_email_bodies",
	clear: "DELETE FROM emails",
} as const;

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

function encodeCursor(cursor: EmailCursor): string {
	return bytesToBase64(new TextEncoder().encode(JSON.stringify(cursor)));
}

function decodeCursor(value: string): EmailCursor {
	try {
		const cursor = JSON.parse(
			new TextDecoder().decode(base64ToBytes(value))
		) as Partial<EmailCursor>;
		if (
			typeof cursor.createdAt !== "string" ||
			typeof cursor.seq !== "number" ||
			!Number.isSafeInteger(cursor.seq)
		) {
			throw new Error("Invalid cursor");
		}
		return cursor as EmailCursor;
	} catch {
		throw new TypeError("Invalid email pagination cursor");
	}
}

function normaliseLimit(limit: number | undefined): number {
	if (limit === undefined) {
		return DEFAULT_LIST_LIMIT;
	}
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
		throw new RangeError("Invalid email pagination limit");
	}
	return limit;
}

function getSentSummary(email: StoredSendingEmail): StoredSendingEmailSummary {
	const {
		text: _text,
		html: _html,
		raw: _raw,
		rawBase64: _rawBase64,
		captureTruncated: _captureTruncated,
		...summary
	} = email;
	return summary;
}

export class EmailStore extends DurableObject {
	private sql = this.ctx.storage.sql;

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		this.ctx.blockConcurrencyWhile(async () => {
			for (const stmt of SCHEMA) {
				this.sql.exec(stmt);
			}
			this.sql.exec(
				STATEMENTS.insertMetadata,
				"source_id",
				crypto.randomUUID()
			);
		});
	}

	getSourceId(): string {
		const row = this.sql
			.exec<{ value: string }>(STATEMENTS.findMetadata, "source_id")
			.toArray()[0];
		if (row === undefined) {
			throw new Error("Email store source ID is unavailable");
		}
		return row.value;
	}

	#insert(
		table: EmailTable,
		id: string,
		createdAt: string,
		data: unknown
	): number {
		const encoded = JSON.stringify(data);
		assertEmailRowValueFits(encoded, `${table} email metadata`);
		const row = this.sql
			.exec<{ seq: number }>(STATEMENTS[table].insert, id, createdAt, encoded)
			.toArray()[0];
		if (row === undefined) {
			throw new Error(`Failed to store ${table} email`);
		}
		return row.seq;
	}

	/** Newest-first cursor page of records from a table. */
	#list<T>(
		table: EmailTable,
		parse: (data: string) => T,
		cursor: string | undefined,
		limit: number | undefined,
		worker: string | undefined
	): EmailListPage<T> {
		const pageSize = normaliseLimit(limit);
		const rows =
			cursor === undefined
				? this.sql
						.exec<{ seq: number; created_at: string; data: string }>(
							worker === undefined
								? STATEMENTS[table].list
								: STATEMENTS[table].listForWorker,
							...(worker === undefined
								? [pageSize + 1]
								: [worker, pageSize + 1])
						)
						.toArray()
				: (() => {
						const decoded = decodeCursor(cursor);
						return this.sql
							.exec<{ seq: number; created_at: string; data: string }>(
								worker === undefined
									? STATEMENTS[table].listAfter
									: STATEMENTS[table].listAfterForWorker,
								...(worker === undefined
									? [
											decoded.createdAt,
											decoded.createdAt,
											decoded.seq,
											pageSize + 1,
										]
									: [
											decoded.createdAt,
											decoded.createdAt,
											decoded.seq,
											worker,
											pageSize + 1,
										])
							)
							.toArray();
					})();
		const hasMore = rows.length > pageSize;
		const pageRows = rows.slice(0, pageSize);
		const last = pageRows.at(-1);
		return {
			items: pageRows.map(({ data }) => parse(data)),
			hasMore,
			...(hasMore && last !== undefined
				? {
						cursor: encodeCursor({
							createdAt: last.created_at,
							seq: last.seq,
						}),
					}
				: {}),
		};
	}

	/** Most recently stored full record with the given message ID. */
	#find<T>(table: EmailTable, id: string, worker?: string): T | undefined {
		const row = this.sql
			.exec<{ data: string }>(
				worker === undefined
					? STATEMENTS[table].find
					: STATEMENTS[table].findForWorker,
				...(worker === undefined ? [id] : [id, worker])
			)
			.toArray()[0];
		return row === undefined ? undefined : (JSON.parse(row.data) as T);
	}

	storeReceivedBody(captureId: string, part: number, rawBase64: string): void {
		if (!Number.isSafeInteger(part) || part < 0) {
			throw new RangeError("Invalid received email body part");
		}
		assertEmailRowValueFits(rawBase64, "Received email body");
		this.sql.exec(STATEMENTS.insertReceivedBody, captureId, part, rawBase64);
	}

	storeReceivedMetadata(
		captureId: string,
		expectedBodyParts: number,
		email: StoredRoutingEmailMetadata
	): void {
		if (!Number.isSafeInteger(expectedBodyParts) || expectedBodyParts < 1) {
			throw new RangeError("Invalid received email body count");
		}
		this.ctx.storage.transactionSync(() => {
			const bodies = this.sql
				.exec<{
					count: number;
					first_part: number | null;
					last_part: number | null;
				}>(STATEMENTS.countReceivedBodies, captureId)
				.toArray()[0];
			if (
				bodies === undefined ||
				bodies.count !== expectedBodyParts ||
				bodies.first_part !== 0 ||
				bodies.last_part !== expectedBodyParts - 1
			) {
				throw new Error(
					`Received email ${email.messageId} has incomplete captured bodies`
				);
			}
			this.#insert(
				"received",
				messageIdToStorageId(email.messageId),
				email.receivedAt,
				{ ...email, bodyId: captureId }
			);
		});
	}

	discardReceived(captureId: string): void {
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(STATEMENTS.discardReceivedBodies, captureId);
			this.sql.exec(STATEMENTS.discardReceivedMetadata, captureId);
		});
	}

	findReceived(id: string, worker?: string): StoredRoutingEmail | undefined {
		const row = this.sql
			.exec<{ data: string }>(
				worker === undefined
					? STATEMENTS.received.find
					: STATEMENTS.received.findForWorker,
				...(worker === undefined ? [id] : [id, worker])
			)
			.toArray()[0];
		if (row === undefined) {
			return undefined;
		}
		const stored = JSON.parse(row.data) as unknown;
		const bodyId =
			typeof stored === "object" &&
			stored !== null &&
			"bodyId" in stored &&
			typeof stored.bodyId === "string"
				? stored.bodyId
				: undefined;
		if (bodyId === undefined) {
			throw new Error(`Received email ${id} has no body identifier`);
		}
		const bodies = this.sql
			.exec<{ part: number; raw_base64: string }>(
				STATEMENTS.findReceivedBodies,
				bodyId
			)
			.toArray();
		const rawBase64 = bodies.find(({ part }) => part === 0)?.raw_base64;
		if (rawBase64 === undefined) {
			throw new Error(`Received email ${id} has no captured body`);
		}
		return materialiseReceivedEmail(
			zStoredRoutingEmailMetadata.parse(stored),
			rawBase64,
			new Map(
				bodies
					.filter(({ part }) => part > 0)
					.map(({ part, raw_base64 }) => [part - 1, raw_base64])
			)
		);
	}

	listReceived(
		cursor?: string,
		limit?: number,
		worker?: string
	): EmailListPage<StoredRoutingEmailSummary> {
		return this.#list(
			"received",
			(data) => zStoredRoutingEmailSummary.parse(JSON.parse(data)),
			cursor,
			limit,
			worker
		);
	}

	storeSent(email: StoredSendingEmail): void {
		this.#insert(
			"sent",
			messageIdToStorageId(email.messageId),
			email.sentAt,
			email
		);
	}

	findSent(id: string, worker?: string): StoredSendingEmail | undefined {
		const email = this.#find<StoredSendingEmail>("sent", id, worker);
		return email === undefined ? undefined : materialiseSentEmail(email);
	}

	listSent(
		cursor?: string,
		limit?: number,
		worker?: string
	): EmailListPage<StoredSendingEmailSummary> {
		return this.#list(
			"sent",
			(data) => getSentSummary(zEmailSendingDetail.parse(JSON.parse(data))),
			cursor,
			limit,
			worker
		);
	}

	clear(): void {
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(STATEMENTS.clearReceivedBodies);
			this.sql.exec(STATEMENTS.clear);
		});
	}
}
