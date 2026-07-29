/**
 * Hosts the `EmailStore` Durable Object and exposes it to the other email
 * services over RPC. The `send_email` binding and the `email()` receiving path
 * write captured emails here, and the Local Explorer reads them back — all
 * through workerd-internal service-binding RPC, so nothing touches the Node host
 * loopback server (see email-store.ts for why that matters).
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { EmailStore } from "./email-store";
import type { StoredRoutingEmail, StoredSendingEmail } from "./storage";

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

	async storeReceived(email: StoredRoutingEmail): Promise<void> {
		await this.#store().storeReceived(email);
	}

	async findReceived(id: string): Promise<StoredRoutingEmail | undefined> {
		return (await this.#store().findReceived(id)) as unknown as
			| StoredRoutingEmail
			| undefined;
	}

	async listReceived(): Promise<StoredRoutingEmail[]> {
		return (await this.#store().listReceived()) as unknown as StoredRoutingEmail[];
	}

	async storeSent(email: StoredSendingEmail): Promise<void> {
		await this.#store().storeSent(email);
	}

	async findSent(id: string): Promise<StoredSendingEmail | undefined> {
		return await this.#store().findSent(id);
	}

	async listSent(): Promise<StoredSendingEmail[]> {
		return await this.#store().listSent();
	}

	async clear(): Promise<void> {
		await this.#store().clear();
	}
}
