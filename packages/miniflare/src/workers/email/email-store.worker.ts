/**
 * Hosts the `EmailStore` Durable Object and exposes it to the other email
 * services over RPC. The `send_email` binding and the `email()` receiving path
 * write captured emails here, and the Local Explorer reads them back — all
 * through workerd-internal service-binding RPC, so nothing touches the Node host
 * loopback server (see email-store.ts for why that matters).
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import {
	EmailStore,
	zStoredRoutingEmail,
	zStoredRoutingEmailSummary,
} from "./email-store";
import type {
	EmailListPage,
	StoredRoutingEmail,
	StoredRoutingEmailMetadata,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailSummary,
} from "./storage";

// Re-export so the embedded worker registers the DO class under its namespace.
export { EmailStore };

interface Env {
	EMAIL_STORE_DO: DurableObjectNamespace<EmailStore>;
}

export default class EmailStoreHost extends WorkerEntrypoint<Env> {
	#store() {
		return this.env.EMAIL_STORE_DO.get(
			this.env.EMAIL_STORE_DO.idFromName("singleton")
		);
	}

	async getSourceId(): Promise<string> {
		return await this.#store().getSourceId();
	}

	async storeReceivedBody(
		captureId: string,
		part: number,
		rawBase64: string
	): Promise<void> {
		await this.#store().storeReceivedBody(captureId, part, rawBase64);
	}

	async storeReceivedMetadata(
		captureId: string,
		expectedBodyParts: number,
		email: StoredRoutingEmailMetadata
	): Promise<void> {
		await this.#store().storeReceivedMetadata(
			captureId,
			expectedBodyParts,
			email
		);
	}

	async discardReceived(captureId: string): Promise<void> {
		await this.#store().discardReceived(captureId);
	}

	async findReceived(
		id: string,
		worker?: string
	): Promise<StoredRoutingEmail | undefined> {
		const email = await this.#store().findReceived(id, worker);
		return email === undefined ? undefined : zStoredRoutingEmail.parse(email);
	}

	async listReceived(
		cursor?: string,
		limit?: number,
		worker?: string
	): Promise<EmailListPage<StoredRoutingEmailSummary>> {
		const page = await this.#store().listReceived(cursor, limit, worker);
		return {
			...page,
			items: zStoredRoutingEmailSummary.array().parse(page.items),
		};
	}

	async storeSent(email: StoredSendingEmail): Promise<void> {
		await this.#store().storeSent(email);
	}

	async findSent(
		id: string,
		worker?: string
	): Promise<StoredSendingEmail | undefined> {
		return await this.#store().findSent(id, worker);
	}

	async listSent(
		cursor?: string,
		limit?: number,
		worker?: string
	): Promise<EmailListPage<StoredSendingEmailSummary>> {
		return await this.#store().listSent(cursor, limit, worker);
	}

	async clear(): Promise<void> {
		await this.#store().clear();
	}
}
