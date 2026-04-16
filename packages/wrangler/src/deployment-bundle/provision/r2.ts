import assert from "node:assert";
import { APIError, INHERIT_SYMBOL } from "@cloudflare/workers-utils";
import {
	createR2Bucket,
	getR2Bucket,
	listR2Buckets,
} from "../../r2/helpers/bucket";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type R2Binding = Extract<Binding, { type: "r2_bucket" }>;

export class R2Handler extends ProvisionResourceHandler<
	"r2_bucket",
	R2Binding
> {
	static readonly bindingType = "r2_bucket";
	static readonly friendlyName = "R2 Bucket";

	static async load(
		config: Config,
		accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listR2Buckets(config, accountId);
		return preExisting.map((bucket) => ({
			title: bucket.name,
			value: bucket.name,
		}));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new R2Handler(bindingName, binding as R2Binding, config, accountId);
	}

	get name(): string | undefined {
		return typeof this.binding.bucket_name === "string"
			? this.binding.bucket_name
			: undefined;
	}

	async create(name: string) {
		await createR2Bucket(
			this.config,
			this.accountId,
			name,
			undefined,
			this.binding.jurisdiction
		);
		return name;
	}
	constructor(
		bindingName: string,
		binding: R2Binding,
		config: Config,
		accountId: string
	) {
		super("r2_bucket", bindingName, binding, "bucket_name", config, accountId);
	}

	/**
	 * Inheriting an R2 binding replaces the id property (bucket_name for R2) with the inheritance symbol.
	 * This works when deploying (and is appropriate for all other binding types), but it means that the
	 * bucket_name for an R2 bucket is not displayed when deploying. As such, only use the inheritance symbol
	 * if the R2 binding has no `bucket_name`.
	 */
	override inherit(): void {
		this.binding.bucket_name ??= INHERIT_SYMBOL;
	}

	/**
	 * R2 bindings can be inherited if the binding name and jurisdiction match.
	 * Additionally, if the user has specified a bucket_name in config, make sure that matches
	 */
	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				existing.jurisdiction === this.binding.jurisdiction &&
				(this.binding.bucket_name
					? this.binding.bucket_name === existing.bucket_name
					: true)
		);
	}
	async isConnectedToExistingResource(): Promise<boolean> {
		assert(typeof this.binding.bucket_name !== "symbol");

		// If the user hasn't specified a bucket_name in config, we always provision
		if (!this.binding.bucket_name) {
			return false;
		}
		try {
			await getR2Bucket(
				this.config,
				this.accountId,
				this.binding.bucket_name,
				this.binding.jurisdiction
			);
			// This bucket_name exists! We don't need to provision it
			return true;
		} catch (e) {
			if (!(e instanceof APIError && e.code === 10006)) {
				// this is an error that is not "bucket not found", so we do want to throw
				throw e;
			}

			// This bucket_name doesn't exist—let's provision
			return false;
		}
	}
	get ciSafe(): boolean {
		return true;
	}
	get provisioningHint(): undefined {
		return undefined;
	}
}
