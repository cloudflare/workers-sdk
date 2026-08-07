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
	EmailArtifact,
	StoredRoutingEmail,
	StoredRoutingEmailMetadata,
	StoredRoutingEmailRecord,
	StoredRoutingEmailSummary,
	StoredSendingEmail,
	StoredSendingEmailMetadata,
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

	async storeReceived(
		email: StoredRoutingEmailRecord
	): Promise<EmailArtifact[]> {
		return await this.#store().storeReceived(email);
	}

	async beginReceived(email: StoredRoutingEmailMetadata): Promise<void> {
		await this.#store().beginReceived(email);
	}

	async appendReceivedRaw(id: string, chunk: string): Promise<void> {
		await this.#store().appendReceivedRaw(id, chunk);
	}

	async appendReplyRaw(
		id: string,
		replyIndex: number,
		chunk: string
	): Promise<void> {
		await this.#store().appendReplyRaw(id, replyIndex, chunk);
	}

	async finishReceived(id: string): Promise<EmailArtifact[]> {
		return await this.#store().finishReceived(id);
	}

	async discardReceived(id: string): Promise<void> {
		await this.#store().discardReceived(id);
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

	async beginSent(email: StoredSendingEmailMetadata): Promise<void> {
		await this.#store().beginSent(email);
	}

	async appendSentRaw(id: string, chunk: string): Promise<void> {
		await this.#store().appendSentRaw(id, chunk);
	}

	async finishSent(id: string): Promise<EmailArtifact[]> {
		return await this.#store().finishSent(id);
	}

	async discardSent(id: string): Promise<void> {
		await this.#store().discardSent(id);
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
