import assert from "node:assert";
import { APIError } from "@cloudflare/workers-utils";
import { createD1Database } from "../../d1/create";
import { listDatabases } from "../../d1/list";
import { getDatabaseInfoFromIdOrName } from "../../d1/utils";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config, WorkerMetadataBinding } from "@cloudflare/workers-utils";

type D1Binding = Extract<Binding, { type: "d1" }>;

export class D1Handler extends ProvisionResourceHandler<"d1", D1Binding> {
	static readonly bindingType = "d1";
	static readonly friendlyName = "D1 Database";

	static async load(
		config: Config,
		accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listDatabases(config, accountId, true, 1000);
		return preExisting.map((db) => ({ title: db.name, value: db.uuid }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new D1Handler(bindingName, binding as D1Binding, config, accountId);
	}

	get name(): string | undefined {
		return typeof this.binding.database_name === "string"
			? this.binding.database_name
			: undefined;
	}
	async create(name: string) {
		const db = await createD1Database(this.config, this.accountId, name);
		return db.uuid;
	}
	constructor(
		bindingName: string,
		binding: D1Binding,
		config: Config,
		accountId: string
	) {
		super("d1", bindingName, binding, "database_id", config, accountId);
	}
	async canInherit(settings: Settings | undefined): Promise<boolean> {
		const maybeInherited = settings?.bindings.find(
			(existing) =>
				existing.type === this.type && existing.name === this.bindingName
		) as Extract<WorkerMetadataBinding, { type: "d1" }> | undefined;
		// A D1 binding with the same binding name exists is already present on the worker...
		if (maybeInherited) {
			// ...and the user hasn't specified a name in their config, so we don't need to check if the database_name matches
			if (!this.binding.database_name) {
				return true;
			}

			// ...and the user HAS specified a name in their config, so we need to check if the database_name they provided
			// matches the database_name of the existing binding (which isn't present in settings, so we'll need to make an API call to check)
			const dbFromId = await getDatabaseInfoFromIdOrName(
				this.config,
				this.accountId,
				maybeInherited.id
			);
			if (this.binding.database_name === dbFromId.name) {
				return true;
			}
		}
		return false;
	}
	async isConnectedToExistingResource(): Promise<boolean | string> {
		assert(typeof this.binding.database_name !== "symbol");

		// If the user hasn't specified a database_name in config, we always provision
		if (!this.binding.database_name) {
			return false;
		}
		try {
			const db = await getDatabaseInfoFromIdOrName(
				this.config,
				this.accountId,
				this.binding.database_name
			);

			// This database_name exists! We don't need to provision it
			return db.uuid;
		} catch (e) {
			if (!(e instanceof APIError && e.code === 7404)) {
				// this is an error that is not "database not found", so we do want to throw
				throw e;
			}

			// This database_name doesn't exist—let's provision
			return false;
		}
	}
	isFullySpecified(): boolean {
		return !!this.binding.database_id;
	}
	get ciSafe(): boolean {
		return true;
	}
	get provisioningHint(): undefined {
		return undefined;
	}
}
