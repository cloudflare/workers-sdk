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
import { messageIdToStorageId } from "./message-id";
import type {
	EmailArtifact,
	StoredRoutingEmail,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailSummary,
} from "./storage";

export type { StoredRoutingEmail, StoredSendingEmail };

/**
 * Upper bound on the number of received/sent emails retained per dev session.
 * Adjust if the explorer needs a deeper history.
 */
const MAX_STORED_EMAILS = 500;

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
		addSummary: "ALTER TABLE received ADD COLUMN summary TEXT",
		rows: "SELECT seq, data, summary FROM received WHERE summary IS NULL",
		update: "UPDATE received SET summary = ? WHERE seq = ?",
	},
	sent: {
		addSummary: "ALTER TABLE sent ADD COLUMN summary TEXT",
		rows: "SELECT seq, data, summary FROM sent WHERE summary IS NULL",
		update: "UPDATE sent SET summary = ? WHERE seq = ?",
	},
} as const;

type EmailTable = keyof typeof STATEMENTS;

function getReceivedSummary(
	email: StoredRoutingEmail
): StoredRoutingEmailSummary {
	const { raw: _raw, rawBase64: _rawBase64, replies, ...rest } = email;
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
	email: StoredRoutingEmail | StoredSendingEmail
): EmailArtifact[] {
	const recordId = messageIdToStorageId(email.messageId);
	if (table === "received") {
		const routingEmail = email as StoredRoutingEmail;
		return routingEmail.replies.map((reply) => ({
			recordId,
			prefix: "reply",
			id: messageIdToStorageId(reply.messageId),
			extension: "eml",
		}));
	}

	const sentEmail = email as StoredSendingEmail;
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

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		this.ctx.blockConcurrencyWhile(async () => {
			for (const stmt of SCHEMA) {
				this.sql.exec(stmt);
			}
			for (const table of ["received", "sent"] as const) {
				try {
					this.sql.exec(MIGRATION_STATEMENTS[table].addSummary);
				} catch {
					// The column already exists for current databases.
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
					const email = JSON.parse(row.data) as
						| StoredRoutingEmail
						| StoredSendingEmail;
					const summary =
						table === "received"
							? getReceivedSummary(email as StoredRoutingEmail)
							: getSentSummary(email as StoredSendingEmail);
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
					JSON.parse(evictedData) as StoredRoutingEmail | StoredSendingEmail
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

	storeReceived(email: StoredRoutingEmail): EmailArtifact[] {
		return this.#insert(
			"received",
			messageIdToStorageId(email.messageId),
			email,
			getReceivedSummary(email)
		);
	}

	findReceived(id: string): StoredRoutingEmail | undefined {
		return this.#find<StoredRoutingEmail>("received", id);
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

	findSent(id: string): StoredSendingEmail | undefined {
		return this.#find<StoredSendingEmail>("sent", id);
	}

	listSent(): StoredSendingEmailSummary[] {
		return this.#list<StoredSendingEmailSummary>("sent");
	}

	clear(): void {
		this.sql.exec(STATEMENTS.received.clear);
		this.sql.exec(STATEMENTS.sent.clear);
	}
}
