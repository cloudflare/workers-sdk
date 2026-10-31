import { randomBytes, timingSafeEqual } from "node:crypto";
import { DevelopmentOidcRequestPool } from "./development-oidc";

/** Host-side broker. Never place it or its credentials in Worker bindings. */
export interface DevelopmentOidcCall {
	binding: string;
	operation: "token" | "grant" | "fetch";
	grant?: { authorization_server: string; scope?: string[] };
	request?: {
		url: string;
		method: string;
		headers: [string, string][];
		body?: string;
	};
}
export interface DevelopmentOidcBroker {
	invoke(call: DevelopmentOidcCall, signal?: AbortSignal): Promise<Response>;
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
	async invoke(
		capability: string,
		options: DevelopmentOidcCall
	): Promise<Response> {
		const entry = this.#find(capability);
		if (
			!entry ||
			!options ||
			typeof options !== "object" ||
			Reflect.ownKeys(options).some(
				(k) => !["binding", "operation", "grant", "request"].includes(String(k))
			) ||
			typeof options.binding !== "string" ||
			!/^[A-Za-z0-9_-]{1,128}$/.test(options.binding) ||
			!["token", "grant", "fetch"].includes(options.operation)
		) {
			throw new Error("Development OIDC operation is invalid.");
		}
		const broker = (entry.broker ??= entry.factory.create());
		const response = await this.#requests.run(
			(signal) => broker.invoke(options, signal),
			entry.controller.signal
		);
		entry.controller.signal.throwIfAborted();
		return response;
	}

	/** Cancel callbacks before shutting down the runtime. */
	dispose(): void {
		this.update([]);
		this.#disposed = true;
	}
}
