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
import {
	base64ToBytes,
	bytesToBase64,
	MAX_EMAIL_ROW_VALUE_BYTES,
} from "./capture";
import { messageIdToStorageId } from "./message-id";
import { missingReceivedCaptureBody } from "./received-capture";
import {
	zStoredRoutingEmailListMetadata,
	zStoredRoutingEmailMetadata,
	zStoredRoutingEmailSummary,
	zStoredSendingEmail,
} from "./storage";
import type {
	EmailListPage,
	ReceivedCaptureOperationLookup,
	StoredRoutingEmail,
	StoredRoutingEmailMetadata,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailSummary,
} from "./storage";

export type { StoredSendingEmail };

function decodeCapturedRaw(rawBase64: string, truncated: boolean): string {
	let bytes: Uint8Array;
	try {
		bytes = base64ToBytes(rawBase64);
	} catch {
		// Preserve the stored Base64 for operation-specific validation. A corrupt
		// dev-only capture must not prevent callers from returning a structured
		// Local Explorer error.
		return "";
	}
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
	email: StoredRoutingEmailMetadata & { captureId: string },
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
	`CREATE UNIQUE INDEX IF NOT EXISTS received_emails_by_id ON emails (id)
		WHERE kind = 'received'`,
	`CREATE INDEX IF NOT EXISTS received_emails_by_message_id_seq ON emails (
		trim(json_extract(data, '$.messageId'), '<>'), seq DESC
		) WHERE kind = 'received'`,
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
	`CREATE TABLE IF NOT EXISTS received_email_capture_attempts (
			capture_id TEXT PRIMARY KEY
		)`,
];

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
		list: `SELECT id, seq, created_at, data FROM emails
			WHERE kind = '${kind}'
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		listForWorker: `SELECT id, seq, created_at, data FROM emails
			WHERE kind = '${kind}' AND json_extract(data, '$.worker') = ?
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		listAfter: `SELECT id, seq, created_at, data FROM emails
			WHERE kind = '${kind}'
			AND (created_at < ? OR (created_at = ? AND seq < ?))
			ORDER BY created_at DESC, seq DESC LIMIT ?`,
		listAfterForWorker: `SELECT id, seq, created_at, data FROM emails
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
	beginReceivedCapture: `INSERT OR IGNORE INTO received_email_capture_attempts
		(capture_id) VALUES (?) RETURNING capture_id`,
	findAnyReceivedCapture: `SELECT id FROM emails WHERE kind = 'received'
		AND id = ? LIMIT 1`,
	findReceivedCaptureAttempt: `SELECT capture_id
		FROM received_email_capture_attempts WHERE capture_id = ?`,
	findReceivedCapture: `SELECT data FROM emails WHERE kind = 'received'
		AND id = ? AND json_extract(data, '$.worker') = ? LIMIT 1`,
	findReceivedMessage: `SELECT id, data FROM emails WHERE kind = 'received'
		AND trim(json_extract(data, '$.messageId'), '<>') = ?
		ORDER BY seq DESC LIMIT 1`,
	findReceivedMessageForWorker: `SELECT id, data FROM emails
		WHERE kind = 'received'
		AND trim(json_extract(data, '$.messageId'), '<>') = ?
		AND json_extract(data, '$.worker') = ? ORDER BY seq DESC LIMIT 1`,
	countReceivedBodies: `SELECT COUNT(*) AS count, MIN(part) AS first_part,
		MAX(part) AS last_part FROM received_email_bodies WHERE capture_id = ?`,
	findReceivedBodies: `SELECT part, raw_base64 FROM received_email_bodies
		WHERE capture_id = ? ORDER BY part`,
	discardReceivedBodies:
		"DELETE FROM received_email_bodies WHERE capture_id = ?",
	discardReceivedMetadata:
		"DELETE FROM received_email_capture_attempts WHERE capture_id = ?",
	insertMetadata: `INSERT OR IGNORE INTO email_store_metadata (key, value)
		VALUES (?, ?)`,
	findMetadata: "SELECT value FROM email_store_metadata WHERE key = ?",
	clearReceivedBodies: "DELETE FROM received_email_bodies",
	clearReceivedCaptureAttempts: "DELETE FROM received_email_capture_attempts",
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
		parse: (data: string, id: string) => T,
		cursor: string | undefined,
		limit: number | undefined,
		worker: string | undefined
	): EmailListPage<T> {
		const pageSize = normaliseLimit(limit);
		const rows =
			cursor === undefined
				? this.sql
						.exec<{
							id: string;
							seq: number;
							created_at: string;
							data: string;
						}>(
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
							.exec<{
								id: string;
								seq: number;
								created_at: string;
								data: string;
							}>(
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
			items: pageRows.map(({ data, id }) => parse(data, id)),
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

	beginReceivedCapture(captureId: string): boolean {
		return this.ctx.storage.transactionSync(() => {
			const existing = this.sql
				.exec<{ id: string }>(STATEMENTS.findAnyReceivedCapture, captureId)
				.toArray()[0];
			const bodies = this.sql
				.exec<{ count: number }>(STATEMENTS.countReceivedBodies, captureId)
				.toArray()[0];
			if (existing !== undefined || (bodies?.count ?? 0) !== 0) {
				return false;
			}
			return (
				this.sql
					.exec<{ capture_id: string }>(
						STATEMENTS.beginReceivedCapture,
						captureId
					)
					.toArray()[0] !== undefined
			);
		});
	}

	storeReceivedBody(captureId: string, part: number, rawBase64: string): void {
		if (!Number.isSafeInteger(part) || part < 0) {
			throw new RangeError("Invalid received email body part");
		}
		const attempt = this.sql
			.exec<{ capture_id: string }>(
				STATEMENTS.findReceivedCaptureAttempt,
				captureId
			)
			.toArray()[0];
		if (attempt === undefined) {
			throw new Error("Received email capture attempt is unavailable");
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
			const attempt = this.sql
				.exec<{ capture_id: string }>(
					STATEMENTS.findReceivedCaptureAttempt,
					captureId
				)
				.toArray()[0];
			if (attempt === undefined) {
				throw new Error("Received email capture attempt is unavailable");
			}
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
			this.#insert("received", captureId, email.receivedAt, email);
			this.sql.exec(STATEMENTS.discardReceivedMetadata, captureId);
		});
	}

	discardReceived(captureId: string): void {
		this.ctx.storage.transactionSync(() => {
			const attempt = this.sql
				.exec<{ capture_id: string }>(
					STATEMENTS.findReceivedCaptureAttempt,
					captureId
				)
				.toArray()[0];
			if (attempt === undefined) {
				return;
			}
			this.sql.exec(STATEMENTS.discardReceivedBodies, captureId);
			this.sql.exec(STATEMENTS.discardReceivedMetadata, captureId);
		});
	}

	#materialiseReceived(
		row: { id: string; data: string } | undefined
	): StoredRoutingEmail | undefined {
		if (row === undefined) {
			return undefined;
		}
		const stored = JSON.parse(row.data) as unknown;
		const bodies = this.sql
			.exec<{ part: number; raw_base64: string }>(
				STATEMENTS.findReceivedBodies,
				row.id
			)
			.toArray();
		const rawBase64 = bodies.find(({ part }) => part === 0)?.raw_base64;
		if (rawBase64 === undefined) {
			throw new Error(`Received email ${row.id} has no captured body`);
		}
		const metadata = zStoredRoutingEmailMetadata.parse(stored);
		return materialiseReceivedEmail(
			{
				...metadata,
				captureId: row.id,
				capturedPortion:
					metadata.capturedPortion ?? metadata.captureTruncated === true,
			},
			rawBase64,
			new Map(
				bodies
					.filter(({ part }) => part > 0)
					.map(({ part, raw_base64 }) => [part - 1, raw_base64])
			)
		);
	}

	findReceivedByCaptureId(
		captureId: string,
		worker: string
	): StoredRoutingEmail | undefined {
		const row = this.sql
			.exec<{ data: string }>(STATEMENTS.findReceivedCapture, captureId, worker)
			.toArray()[0];
		return this.#materialiseReceived(
			row === undefined ? undefined : { id: captureId, data: row.data }
		);
	}

	findReceivedForOperation(
		captureId: string,
		worker: string
	): ReceivedCaptureOperationLookup {
		const row = this.sql
			.exec<{ data: string }>(STATEMENTS.findReceivedCapture, captureId, worker)
			.toArray()[0];
		if (row === undefined) {
			return { found: false };
		}
		const metadata = zStoredRoutingEmailMetadata.parse(JSON.parse(row.data));
		try {
			const email = this.#materialiseReceived({
				id: captureId,
				data: row.data,
			});
			if (email === undefined) {
				return { found: false };
			}
			return {
				found: true,
				capturedPortion:
					email.capturedPortion ?? email.captureTruncated === true,
				email,
			};
		} catch {
			return missingReceivedCaptureBody(metadata);
		}
	}

	findReceivedByMessageId(
		messageId: string,
		worker?: string
	): StoredRoutingEmail | undefined {
		const row = this.sql
			.exec<{ id: string; data: string }>(
				worker === undefined
					? STATEMENTS.findReceivedMessage
					: STATEMENTS.findReceivedMessageForWorker,
				...(worker === undefined
					? [messageIdToStorageId(messageId)]
					: [messageIdToStorageId(messageId), worker])
			)
			.toArray()[0];
		return this.#materialiseReceived(row);
	}

	listReceived(
		cursor?: string,
		limit?: number,
		worker?: string
	): EmailListPage<StoredRoutingEmailSummary> {
		return this.#list(
			"received",
			(data, captureId) => {
				const email = zStoredRoutingEmailListMetadata.parse(JSON.parse(data));
				return zStoredRoutingEmailSummary.parse({
					...email,
					captureId,
					capturedPortion:
						email.capturedPortion ?? email.captureTruncated === true,
				});
			},
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
			(data) => getSentSummary(zStoredSendingEmail.parse(JSON.parse(data))),
			cursor,
			limit,
			worker
		);
	}

	clear(): void {
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(STATEMENTS.clearReceivedBodies);
			this.sql.exec(STATEMENTS.clearReceivedCaptureAttempts);
			this.sql.exec(STATEMENTS.clear);
		});
	}
}
