import type { StoredRoutingEmail, StoredSendingEmail } from "./workers/email/storage";

export type { StoredRoutingEmail, StoredSendingEmail };

/**
 * In-memory singleton for the local explorer email interface.
 *
 * Emails are captured at runtime (received via the `email()` handler, sent
 * via `send_email` bindings) and held here. Workers push records over the
 * loopback service, and the local explorer reads them back. Emails do not
 * persist across dev-server restarts. Newest entries are kept last.
 */
class EmailStorage {
	#received: StoredRoutingEmail[] = [];
	#sent: StoredSendingEmail[] = [];

	storeReceived(email: StoredRoutingEmail): void {
		this.#received.push(email);
	}

	findReceived(id: string): StoredRoutingEmail | undefined {
		return this.#received.find((e) => e.id === id);
	}

	getAllReceived(): StoredRoutingEmail[] {
		return [...this.#received];
	}

	storeSent(email: StoredSendingEmail): void {
		this.#sent.push(email);
	}

	findSent(id: string): StoredSendingEmail | undefined {
		return this.#sent.find((e) => e.id === id);
	}

	getAllSent(): StoredSendingEmail[] {
		return [...this.#sent];
	}
}

export const emailStorage = new EmailStorage();
