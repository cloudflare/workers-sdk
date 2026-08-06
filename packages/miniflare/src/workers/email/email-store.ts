/**
 * The local email store: a SQLite-backed Durable Object holding the emails
 * captured during a dev session. The `send_email` binding and the `email()`
 * receiving path write to it, and the Local Explorer's Email API reads from it,
 * all over workerd-internal RPC. Because every hop stays inside workerd, capture
 * never depends on the Node host loopback server — so it works even when a
 * binding method is invoked through the synchronous platform proxy
 * (`getPlatformProxy()` / `getBindings()`), which blocks the Node main thread.
 *
 * Records are stored as full JSON blobs alongside compact summaries keyed by an
 * autoincrement `seq` for newest-first ordering. Lists read summaries while
 * detail lookups read the full record. This data is local only: it is never
 * exposed to the user's app or sent anywhere, and it does not persist across
 * dev-server restarts (the store is backed by the instance temp directory).
 */
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
	zEmailHandlerForward,
	zEmailHandlerReply,
	zEmailRoutingDetail,
	zEmailSendingDetail,
} from "../local-explorer/generated/zod.gen";
import { base64ToBytes, bytesToBase64 } from "./capture";
import { messageIdToStorageId } from "./message-id";
import type {
	EmailArtifact,
	StoredRoutingEmailMetadata,
	StoredRoutingEmailRecord,
	StoredRoutingEmail,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailMetadata,
	StoredSendingEmailSummary,
} from "./storage";

export type { StoredRoutingEmail, StoredSendingEmail };

function materialiseReceivedEmail(
	email: StoredRoutingEmailRecord
): StoredRoutingEmail {
	return {
		...email,
		raw: new TextDecoder().decode(base64ToBytes(email.rawBase64)),
		replies: email.replies.map((reply) => ({
			...reply,
			raw:
				reply.raw ??
				(reply.rawBase64 === undefined
					? ""
					: new TextDecoder().decode(base64ToBytes(reply.rawBase64))),
		})),
	};
}

/**
 * Decodes a sent record's `raw` from its `rawBase64` when it was stored
 * base64-only (the chunked send path stores no decoded `raw`). Records that
 * already carry `raw`, or have no raw body at all, are returned unchanged.
 */
function materialiseSentEmail(email: StoredSendingEmail): StoredSendingEmail {
	if (email.raw !== undefined || email.rawBase64 === undefined) {
		return email;
	}
	return {
		...email,
		raw: new TextDecoder().decode(base64ToBytes(email.rawBase64)),
	};
}

/**
 * Upper bound on the number of received/sent emails retained per dev session.
 * Adjust if the explorer needs a deeper history. Could be attached to a binding
 * in the future.
 */
const MAX_STORED_EMAILS = 200;

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS received (
		seq  INTEGER PRIMARY KEY AUTOINCREMENT,
		id   TEXT NOT NULL,
		data TEXT NOT NULL,
		summary TEXT
	)`,
	`CREATE INDEX IF NOT EXISTS received_by_id ON received (id)`,
	`CREATE TABLE IF NOT EXISTS sent (
		seq  INTEGER PRIMARY KEY AUTOINCREMENT,
		id   TEXT NOT NULL,
		data TEXT NOT NULL,
		summary TEXT
	)`,
	`CREATE INDEX IF NOT EXISTS sent_by_id ON sent (id)`,
];

const STATEMENTS = {
	received: {
		insert: `INSERT INTO received (id, data, summary) VALUES (?, ?, ?)`,
		evict: `DELETE FROM received WHERE seq NOT IN (SELECT seq FROM received ORDER BY seq DESC LIMIT ?)`,
		list: `SELECT summary FROM received ORDER BY seq DESC`,
		find: `SELECT data FROM received WHERE id = ? ORDER BY seq DESC LIMIT 1`,
		evicted: `SELECT data FROM received WHERE seq NOT IN (SELECT seq FROM received ORDER BY seq DESC LIMIT ?)`,
		hasId: `SELECT 1 FROM received WHERE id = ? LIMIT 1`,
		clear: `DELETE FROM received`,
	},
	sent: {
		insert: `INSERT INTO sent (id, data, summary) VALUES (?, ?, ?)`,
		evict: `DELETE FROM sent WHERE seq NOT IN (SELECT seq FROM sent ORDER BY seq DESC LIMIT ?)`,
		list: `SELECT summary FROM sent ORDER BY seq DESC`,
		find: `SELECT data FROM sent WHERE id = ? ORDER BY seq DESC LIMIT 1`,
		evicted: `SELECT data FROM sent WHERE seq NOT IN (SELECT seq FROM sent ORDER BY seq DESC LIMIT ?)`,
		hasId: `SELECT 1 FROM sent WHERE id = ? LIMIT 1`,
		clear: `DELETE FROM sent`,
	},
} as const;

const MIGRATION_STATEMENTS = {
	received: {
		tableInfo: "PRAGMA table_info(received)",
		addSummary: "ALTER TABLE received ADD COLUMN summary TEXT",
		rows: "SELECT seq, data, summary FROM received WHERE summary IS NULL",
		update: "UPDATE received SET summary = ? WHERE seq = ?",
	},
	sent: {
		tableInfo: "PRAGMA table_info(sent)",
		addSummary: "ALTER TABLE sent ADD COLUMN summary TEXT",
		rows: "SELECT seq, data, summary FROM sent WHERE summary IS NULL",
		update: "UPDATE sent SET summary = ? WHERE seq = ?",
	},
} as const;

const zStoredEmailForward = zEmailHandlerForward.extend({
	headers: z.array(z.tuple([z.string(), z.string()])),
});
const zStoredEmailReply = zEmailHandlerReply.extend({ raw: z.string() });
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
export const zStoredRoutingEmail = zEmailRoutingDetail.extend({
	forwards: z.array(zStoredEmailForward),
	replies: z.array(zStoredEmailReply),
	events: z.array(zStoredEmailEvent),
});
const zStoredRoutingEmailRecord = zStoredRoutingEmail
	.omit({ raw: true, replies: true })
	.extend({
		rawBase64: z.string(),
		// Reply raw bodies are stored base64-only (streamed in chunks); the
		// decoded `raw` is materialised on read.
		replies: z.array(zEmailHandlerReply),
	});
export const zStoredRoutingEmailSummary = zStoredRoutingEmail
	.omit({ raw: true, rawBase64: true, replies: true })
	.extend({
		replies: z.array(zStoredEmailReply.omit({ raw: true, rawBase64: true })),
	});

type EmailTable = keyof typeof STATEMENTS;

function normaliseReceivedRecord(
	email: StoredRoutingEmail | StoredRoutingEmailRecord
): StoredRoutingEmailRecord {
	if ("raw" in email) {
		const { raw: _raw, ...record } = email;
		return {
			...record,
			rawBase64:
				email.rawBase64 ?? bytesToBase64(new TextEncoder().encode(email.raw)),
		};
	}
	return email;
}

function parseReceivedRecord(data: unknown): StoredRoutingEmailRecord {
	const record = zStoredRoutingEmailRecord.safeParse(data);
	if (record.success) {
		return record.data;
	}
	return normaliseReceivedRecord(zStoredRoutingEmail.parse(data));
}

function getReceivedSummary(
	email: StoredRoutingEmailRecord
): StoredRoutingEmailSummary {
	const { rawBase64: _rawBase64, replies, ...rest } = email;
	return {
		...rest,
		replies: replies.map(
			({ raw: _replyRaw, rawBase64: _replyRawBase64, ...reply }) => reply
		),
	};
}

function getSentSummary(email: StoredSendingEmail): StoredSendingEmailSummary {
	const {
		text: _text,
		html: _html,
		raw: _raw,
		rawBase64: _rawBase64,
		...summary
	} = email;
	return summary;
}

function getAttachmentExtension(filename: string): string {
	const extension = filename.match(/\.([^.]+)$/u)?.[1];
	return extension !== undefined &&
		/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(extension)
		? extension
		: "bin";
}

function getArtifacts(
	table: EmailTable,
	email: StoredRoutingEmailRecord | StoredSendingEmail
): EmailArtifact[] {
	const recordId = messageIdToStorageId(email.messageId);
	if (table === "received") {
		if (!("receivedAt" in email)) {
			throw new TypeError("Received email record does not match its table");
		}
		return email.replies.map((reply) => ({
			recordId,
			prefix: "reply",
			id: messageIdToStorageId(reply.messageId),
			extension: "eml",
		}));
	}

	if (!("sentAt" in email)) {
		throw new TypeError("Sent email record does not match its table");
	}
	const sentEmail = email;
	const artifacts: EmailArtifact[] = [];
	if (sentEmail.raw !== undefined) {
		artifacts.push({
			recordId,
			prefix: "email",
			id: recordId,
			extension: "eml",
		});
	} else {
		if (sentEmail.text !== undefined) {
			artifacts.push({
				recordId,
				prefix: "email-text",
				id: recordId,
				extension: "txt",
			});
		}
		if (sentEmail.html !== undefined) {
			artifacts.push({
				recordId,
				prefix: "email-html",
				id: recordId,
				extension: "html",
			});
		}
		for (const [index, attachment] of sentEmail.attachments.entries()) {
			artifacts.push({
				recordId,
				prefix: "email-attachment",
				id: `${recordId}-${index + 1}`,
				extension: getAttachmentExtension(attachment.filename),
			});
		}
	}
	return artifacts;
}

export class EmailStore extends DurableObject {
	private sql = this.ctx.storage.sql;
	#pendingReceived = new Map<
		string,
		{
			email: StoredRoutingEmailMetadata;
			chunks: string[];
			replyChunks: Map<number, string[]>;
		}
	>();
	#pendingSent = new Map<
		string,
		{ email: StoredSendingEmailMetadata; chunks: string[] }
	>();

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		this.ctx.blockConcurrencyWhile(async () => {
			for (const stmt of SCHEMA) {
				this.sql.exec(stmt);
			}
			for (const table of ["received", "sent"] as const) {
				const hasSummaryColumn = this.sql
					.exec<{ name: string }>(MIGRATION_STATEMENTS[table].tableInfo)
					.toArray()
					.some(({ name }) => name === "summary");
				if (!hasSummaryColumn) {
					this.sql.exec(MIGRATION_STATEMENTS[table].addSummary);
				}
			}
			for (const table of ["received", "sent"] as const) {
				const rows = this.sql
					.exec<{
						seq: number;
						data: string;
						summary: string | null;
					}>(MIGRATION_STATEMENTS[table].rows)
					.toArray();
				for (const row of rows) {
					const summary =
						table === "received"
							? getReceivedSummary(parseReceivedRecord(JSON.parse(row.data)))
							: getSentSummary(zEmailSendingDetail.parse(JSON.parse(row.data)));
					this.sql.exec(
						MIGRATION_STATEMENTS[table].update,
						JSON.stringify(summary),
						row.seq
					);
				}
			}
		});
	}

	/** Inserts a record and evicts the oldest rows beyond `MAX_STORED_EMAILS`. */
	#insert(
		table: EmailTable,
		id: string,
		data: unknown,
		summary: unknown
	): EmailArtifact[] {
		this.sql.exec(
			STATEMENTS[table].insert,
			id,
			JSON.stringify(data),
			JSON.stringify(summary)
		);
		const evicted = this.sql
			.exec<{ data: string }>(STATEMENTS[table].evicted, MAX_STORED_EMAILS)
			.toArray()
			.flatMap(({ data: evictedData }) =>
				getArtifacts(
					table,
					table === "received"
						? parseReceivedRecord(JSON.parse(evictedData))
						: zEmailSendingDetail.parse(JSON.parse(evictedData))
				)
			);
		this.sql.exec(STATEMENTS[table].evict, MAX_STORED_EMAILS);
		const retainedRecordIds = new Set<string>();
		for (const recordId of new Set(
			evicted.map((artifact) => artifact.recordId)
		)) {
			if (
				this.sql.exec(STATEMENTS[table].hasId, recordId).toArray().length > 0
			) {
				retainedRecordIds.add(recordId);
			}
		}
		return evicted.filter(
			(artifact) => !retainedRecordIds.has(artifact.recordId)
		);
	}

	/** Newest-first list of summary records from a table. */
	#list<T>(table: EmailTable): T[] {
		return this.sql
			.exec<{ summary: string | null }>(STATEMENTS[table].list)
			.toArray()
			.filter((row): row is { summary: string } => row.summary !== null)
			.map((row) => JSON.parse(row.summary) as T);
	}

	/** Most recently stored full record with the given message ID. */
	#find<T>(table: EmailTable, id: string): T | undefined {
		const row = this.sql
			.exec<{ data: string }>(STATEMENTS[table].find, id)
			.toArray()[0];
		return row === undefined ? undefined : (JSON.parse(row.data) as T);
	}

	storeReceived(email: StoredRoutingEmailRecord): EmailArtifact[] {
		return this.#insert(
			"received",
			messageIdToStorageId(email.messageId),
			email,
			getReceivedSummary(email)
		);
	}

	beginReceived(email: StoredRoutingEmailMetadata): void {
		this.#pendingReceived.set(messageIdToStorageId(email.messageId), {
			email,
			chunks: [],
			replyChunks: new Map(),
		});
	}

	appendReceivedRaw(id: string, chunk: string): void {
		const pending = this.#pendingReceived.get(id);
		if (pending === undefined) {
			throw new Error(`No pending received email for ${id}`);
		}
		pending.chunks.push(chunk);
	}

	appendReplyRaw(id: string, replyIndex: number, chunk: string): void {
		const pending = this.#pendingReceived.get(id);
		if (pending === undefined) {
			throw new Error(`No pending received email for ${id}`);
		}
		let chunks = pending.replyChunks.get(replyIndex);
		if (chunks === undefined) {
			chunks = [];
			pending.replyChunks.set(replyIndex, chunks);
		}
		chunks.push(chunk);
	}

	async finishReceived(id: string): Promise<EmailArtifact[]> {
		const pending = this.#pendingReceived.get(id);
		if (pending === undefined) {
			throw new Error(`No pending received email for ${id}`);
		}
		this.#pendingReceived.delete(id);
		return this.storeReceived({
			...pending.email,
			rawBase64: pending.chunks.join(""),
			replies: pending.email.replies.map((reply, index) => {
				const chunks = pending.replyChunks.get(index);
				return chunks === undefined
					? reply
					: { ...reply, rawBase64: chunks.join("") };
			}),
		});
	}

	discardReceived(id: string): void {
		this.#pendingReceived.delete(id);
	}

	findReceived(id: string): StoredRoutingEmail | undefined {
		const row = this.sql
			.exec<{ data: string }>(STATEMENTS.received.find, id)
			.toArray()[0];
		return row === undefined
			? undefined
			: materialiseReceivedEmail(parseReceivedRecord(JSON.parse(row.data)));
	}

	listReceived(): StoredRoutingEmailSummary[] {
		return this.#list<StoredRoutingEmailSummary>("received");
	}

	storeSent(email: StoredSendingEmail): EmailArtifact[] {
		return this.#insert(
			"sent",
			messageIdToStorageId(email.messageId),
			email,
			getSentSummary(email)
		);
	}

	beginSent(email: StoredSendingEmailMetadata): void {
		this.#pendingSent.set(messageIdToStorageId(email.messageId), {
			email,
			chunks: [],
		});
	}

	appendSentRaw(id: string, chunk: string): void {
		const pending = this.#pendingSent.get(id);
		if (pending === undefined) {
			throw new Error(`No pending sent email for ${id}`);
		}
		pending.chunks.push(chunk);
	}

	async finishSent(id: string): Promise<EmailArtifact[]> {
		const pending = this.#pendingSent.get(id);
		if (pending === undefined) {
			throw new Error(`No pending sent email for ${id}`);
		}
		this.#pendingSent.delete(id);
		return this.storeSent({
			...pending.email,
			rawBase64: pending.chunks.join(""),
		});
	}

	discardSent(id: string): void {
		this.#pendingSent.delete(id);
	}

	findSent(id: string): StoredSendingEmail | undefined {
		const email = this.#find<StoredSendingEmail>("sent", id);
		return email === undefined ? undefined : materialiseSentEmail(email);
	}

	listSent(): StoredSendingEmailSummary[] {
		return this.#list<StoredSendingEmailSummary>("sent");
	}

	clear(): void {
		this.sql.exec(STATEMENTS.received.clear);
		this.sql.exec(STATEMENTS.sent.clear);
	}
}
