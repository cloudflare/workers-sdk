import crypto from "node:crypto";
import { INHERIT_SYMBOL } from "@cloudflare/workers-utils";
import type { Binding } from "../../api/startDevWorker/types";
import type { Config, WorkerMetadataBinding } from "@cloudflare/workers-utils";

export type ProvisionableBinding =
	| Extract<Binding, { type: "kv_namespace" }>
	| Extract<Binding, { type: "d1" }>
	| Extract<Binding, { type: "r2_bucket" }>
	| Extract<Binding, { type: "ai_search_namespace" }>
	| Extract<Binding, { type: "queue" }>
	| Extract<Binding, { type: "dispatch_namespace" }>
	| Extract<Binding, { type: "vectorize" }>
	| Extract<Binding, { type: "hyperdrive" }>
	| Extract<Binding, { type: "pipeline" }>
	| Extract<Binding, { type: "vpc_service" }>
	| Extract<Binding, { type: "mtls_certificate" }>;

export type Settings = {
	bindings: Array<WorkerMetadataBinding>;
};

export abstract class ProvisionResourceHandler<
	T extends WorkerMetadataBinding["type"],
	B extends ProvisionableBinding,
> {
	constructor(
		public type: T,
		public bindingName: string,
		public binding: B,
		public idField: string,
		public config: Config,
		public accountId: string
	) {}

	// Does this resource already exist in the currently deployed version of the Worker?
	// If it does, that means we can inherit from it.
	abstract canInherit(
		settings: Settings | undefined
	): boolean | Promise<boolean>;

	inherit(): void {
		// @ts-expect-error idField is a key of this.binding
		this.binding[this.idField] = INHERIT_SYMBOL;
	}
	connect(id: string): void {
		// @ts-expect-error idField is a key of this.binding
		this.binding[this.idField] = id;
	}

	abstract create(name: string): Promise<string>;

	abstract get name(): string | undefined;

	async provision(name: string): Promise<void> {
		const id = await this.create(name);
		this.connect(id);
	}

	// This binding is fully specified and can't/shouldn't be provisioned
	// This is usually when it has an id (e.g. D1 `database_id`)
	isFullySpecified(): boolean {
		return false;
	}

	// Does this binding need to be provisioned?
	// Some bindings are not fully specified, but don't need provisioning
	// (e.g. R2 binding, with a bucket_name that already exists)
	async isConnectedToExistingResource(): Promise<boolean | string> {
		return false;
	}

	// Should this resource be provisioned?
	async shouldProvision(settings: Settings | undefined) {
		// If the resource is fully specified, don't provision
		if (!this.isFullySpecified()) {
			// If we can inherit, do that and don't provision
			if (await this.canInherit(settings)) {
				this.inherit();
			} else {
				// If the resource is connected to a remote resource that _exists_
				// (see comments on the individual functions for why this is different to isFullySpecified())
				const connected = await this.isConnectedToExistingResource();
				if (connected) {
					if (typeof connected === "string") {
						// Basically a special case for D1: the resource is specified by name in config
						// and exists, but needs to be specified by ID for the first deploy to work
						this.connect(connected);
					}
					return false;
				}
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether this binding type is safe to auto-create in CI without interactive prompts.
	 * Safe bindings only need a name (KV, R2, D1, AI Search, Queues, Dispatch Namespaces).
	 * Unsafe bindings need additional configuration (Vectorize, Hyperdrive, Pipelines, VPC, mTLS).
	 */
	abstract get ciSafe(): boolean;

	/**
	 * Instructions shown to users and AI agents when this binding can't be
	 * auto-provisioned in non-interactive mode. Should describe the wrangler
	 * command to create the resource and which config field to set.
	 * ciSafe handlers return undefined (they'll just be auto-created).
	 */
	abstract get provisioningHint(): string | undefined;

	/**
	 * Perform interactive creation, prompting the user for any additional
	 * parameters beyond just a name. The default implementation works for
	 * simple handlers that only need a name. Handlers that need additional
	 * config (e.g. Vectorize, Hyperdrive) should override this.
	 */
	async interactiveCreate(name: string): Promise<void> {
		await this.provision(name);
	}
}

export type NormalisedResourceInfo = {
	title: string;
	value: string;
};

export interface HandlerStatics {
	readonly bindingType: string;
	readonly friendlyName: string;
	load(config: Config, accountId: string): Promise<NormalisedResourceInfo[]>;
	create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	): ProvisionResourceHandler<
		WorkerMetadataBinding["type"],
		ProvisionableBinding
	>;
}

/**
 * Generate a short (4 hex chars) random suffix for auto-created resource
 * names to reduce the chance of name collisions while keeping names short.
 */
export function generateRandomSuffix(): string {
	return crypto.randomBytes(2).toString("hex");
}

/**
 * Generate a default resource name from the script name and binding name,
 * with a random suffix to avoid collisions.
 */
export function generateDefaultName(
	scriptName: string,
	bindingName: string
): string {
	const base = `${scriptName}-${bindingName.toLowerCase().replaceAll("_", "-")}`;
	return `${base}-${generateRandomSuffix()}`;
}
