/**
 * The local email store: a SQLite-backed Durable Object holding the emails
 * captured during a dev session. The `send_email` binding and the `email()`
 * receiving path write to it, and the Local Explorer's Email API reads from it,
 * all over workerd-internal RPC. Because every hop stays inside workerd, capture
 * never depends on the Node host loopback server — so it works even when a
 * binding method is invoked through the synchronous platform proxy
 * (`getPlatformProxy()` / `getBindings()`), which blocks the Node main thread.
 *
 * Records are stored verbatim as JSON blobs (the shapes are rich — nested
 * recipient lists, attachments, handling paths — and are only ever read back
 * whole), keyed by an autoincrement `seq` for newest-first ordering. This data
 * is local only: it is never exposed to the user's app or sent anywhere, and it
 * does not persist across dev-server restarts (the store is backed by the
 * instance temp directory).
 */
import { DurableObject } from "cloudflare:workers";
import { messageIdToStorageId } from "./message-id";
import type { StoredRoutingEmail, StoredSendingEmail } from "./storage";

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
		data TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS received_by_id ON received (id)`,
	`CREATE TABLE IF NOT EXISTS sent (
		seq  INTEGER PRIMARY KEY AUTOINCREMENT,
		id   TEXT NOT NULL,
		data TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS sent_by_id ON sent (id)`,
];

const STATEMENTS = {
	received: {
		insert: `INSERT INTO received (id, data) VALUES (?, ?)`,
		evict: `DELETE FROM received WHERE seq NOT IN (SELECT seq FROM received ORDER BY seq DESC LIMIT ?)`,
		list: `SELECT data FROM received ORDER BY seq DESC`,
		find: `SELECT data FROM received WHERE id = ? ORDER BY seq DESC LIMIT 1`,
		clear: `DELETE FROM received`,
	},
	sent: {
		insert: `INSERT INTO sent (id, data) VALUES (?, ?)`,
		evict: `DELETE FROM sent WHERE seq NOT IN (SELECT seq FROM sent ORDER BY seq DESC LIMIT ?)`,
		list: `SELECT data FROM sent ORDER BY seq DESC`,
		find: `SELECT data FROM sent WHERE id = ? ORDER BY seq DESC LIMIT 1`,
		clear: `DELETE FROM sent`,
	},
} as const;

type EmailTable = keyof typeof STATEMENTS;

export class EmailStore extends DurableObject {
	private sql = this.ctx.storage.sql;

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		this.ctx.blockConcurrencyWhile(async () => {
			for (const stmt of SCHEMA) {
				this.sql.exec(stmt);
			}
		});
	}

	/** Inserts a record and evicts the oldest rows beyond `MAX_STORED_EMAILS`. */
	#insert(table: EmailTable, id: string, data: unknown): void {
		this.sql.exec(STATEMENTS[table].insert, id, JSON.stringify(data));
		this.sql.exec(STATEMENTS[table].evict, MAX_STORED_EMAILS);
	}

	/** Newest-first list of full records from a table. */
	#list<T>(table: EmailTable): T[] {
		return this.sql
			.exec<{ data: string }>(STATEMENTS[table].list)
			.toArray()
			.map((row) => JSON.parse(row.data) as T);
	}

	/**
	 * Most recently stored record with the given message ID
	 */
	#find<T>(table: EmailTable, id: string): T | undefined {
		const row = this.sql
			.exec<{ data: string }>(STATEMENTS[table].find, id)
			.toArray()[0];
		return row === undefined ? undefined : (JSON.parse(row.data) as T);
	}

	storeReceived(email: StoredRoutingEmail): void {
		this.#insert("received", messageIdToStorageId(email.messageId), email);
	}

	findReceived(id: string): StoredRoutingEmail | undefined {
		return this.#find<StoredRoutingEmail>("received", id);
	}

	listReceived(): StoredRoutingEmail[] {
		return this.#list<StoredRoutingEmail>("received");
	}

	storeSent(email: StoredSendingEmail): void {
		this.#insert("sent", messageIdToStorageId(email.messageId), email);
	}

	findSent(id: string): StoredSendingEmail | undefined {
		return this.#find<StoredSendingEmail>("sent", id);
	}

	listSent(): StoredSendingEmail[] {
		return this.#list<StoredSendingEmail>("sent");
	}

	clear(): void {
		this.sql.exec(STATEMENTS.received.clear);
		this.sql.exec(STATEMENTS.sent.clear);
	}
}
