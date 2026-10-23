import { randomBytes, timingSafeEqual } from "node:crypto";
import {
	DevelopmentOidcRequestPool,
	validateDevelopmentOidcAudience,
} from "./development-oidc";

/** Host-side broker. Never place it or its credentials in Worker bindings. */
export interface DevelopmentOidcBroker {
	getToken(options: {
		assignment: string;
		audience?: string;
		fresh?: boolean;
	}): Promise<string>;
	dispose(): void;
}

/** Lazy provider factory. Equal keys retain a session across code reloads. */
export interface DevelopmentOidcBrokerFactory {
	/** Include every setting that changes the linked Worker or authentication profile. */
	key: string;
	create(): DevelopmentOidcBroker;
}

interface Entry {
	factory: DevelopmentOidcBrokerFactory;
	capability: string;
	controller: AbortController;
	broker?: DevelopmentOidcBroker;
}

/** Instance-scoped capabilities and lazy broker lifetimes, independent of Worker code. */
export class DevelopmentOidcBrokers {
	#entries = new Map<number, Entry>();
	#requests = new DevelopmentOidcRequestPool();
	#disposed = false;

	/** Reconcile configured workers, cancelling sessions whose authority changed. */
	update(factories: (DevelopmentOidcBrokerFactory | undefined)[]): void {
		if (this.#disposed) {
			return;
		}
		for (const [index, entry] of this.#entries) {
			if (factories[index]?.key !== entry.factory.key) {
				this.#entries.delete(index);
				entry.controller.abort(
					new Error("Development OIDC configuration changed.")
				);
				try {
					entry.broker?.dispose();
				} catch {
					/* Keep cancellation and runtime teardown independent of adapters. */
				}
			}
		}
		factories.forEach((factory, index) => {
			if (factory && !this.#entries.has(index)) {
				this.#entries.set(index, {
					factory: Object.freeze({
						key: factory.key,
						create: factory.create.bind(factory),
					}),
					capability: randomBytes(32).toString("hex"),
					controller: new AbortController(),
				});
			}
		});
	}

	/** Return a private capability for the native callback's external service. */
	capability(index: number): string | undefined {
		return this.#entries.get(index)?.capability;
	}

	/** Check the separate OIDC capability before reading an HTTP request body. */
	isAuthorized(capability: string): boolean {
		return this.#find(capability) !== undefined;
	}

	#find(capability: string): Entry | undefined {
		if (capability.length !== 64) {
			return undefined;
		}
		const supplied = Buffer.from(capability);
		if (supplied.length !== 64) {
			return undefined;
		}
		return [...this.#entries.values()].find((entry) =>
			timingSafeEqual(Buffer.from(entry.capability), supplied)
		);
	}

	/** Handle a capability-authorized callback. Body limits must be applied before decoding. */
	async getToken(
		capability: string,
		options: { assignment: string; audience?: string; fresh?: boolean }
	): Promise<string> {
		const entry = this.#find(capability);
		if (!entry) {
			throw new Error("Development OIDC callback is unavailable.");
		}
		if (options.audience !== undefined) {
			validateDevelopmentOidcAudience(options.audience);
		}
		const broker = (entry.broker ??= entry.factory.create());
		const token = await this.#requests.run(
			() => broker.getToken(options),
			entry.controller.signal
		);
		// Reconfiguration can run after the operation settles but before this continuation.
		entry.controller.signal.throwIfAborted();
		if (
			typeof token !== "string" ||
			token.length > 65536 ||
			token.trim() !== token ||
			!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
		) {
			throw new Error("Development OIDC returned an invalid token.");
		}
		return token;
	}

	/** Cancel callbacks before shutting down the runtime. */
	dispose(): void {
		this.update([]);
		this.#disposed = true;
	}
}
