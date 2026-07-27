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

	storeReceived(email: StoredRoutingEmail): Promise<void> {
		return this.#store().storeReceived(email);
	}

	findReceived(id: string): Promise<StoredRoutingEmail | undefined> {
		return this.#store().findReceived(id);
	}

	listReceived(): Promise<StoredRoutingEmail[]> {
		return this.#store().listReceived();
	}

	storeSent(email: StoredSendingEmail): Promise<void> {
		return this.#store().storeSent(email);
	}

	findSent(id: string): Promise<StoredSendingEmail | undefined> {
		return this.#store().findSent(id);
	}

	listSent(): Promise<StoredSendingEmail[]> {
		return this.#store().listSent();
	}

	clear(): Promise<void> {
		return this.#store().clear();
	}
}
