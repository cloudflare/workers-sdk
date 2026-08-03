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
	StoredRoutingEmail,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailSummary,
	EmailArtifact,
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

	async storeReceived(email: StoredRoutingEmail): Promise<EmailArtifact[]> {
		return await this.#store().storeReceived(email);
	}

	async findReceived(id: string): Promise<StoredRoutingEmail | undefined> {
		const email = await this.#store().findReceived(id);
		return email === undefined ? undefined : zStoredRoutingEmail.parse(email);
	}

	async listReceived(): Promise<StoredRoutingEmailSummary[]> {
		return zStoredRoutingEmailSummary
			.array()
			.parse(await this.#store().listReceived());
	}

	async storeSent(email: StoredSendingEmail): Promise<EmailArtifact[]> {
		return await this.#store().storeSent(email);
	}

	async findSent(id: string): Promise<StoredSendingEmail | undefined> {
		return await this.#store().findSent(id);
	}

	async listSent(): Promise<StoredSendingEmailSummary[]> {
		return await this.#store().listSent();
	}

	async clear(): Promise<void> {
		await this.#store().clear();
	}
}
