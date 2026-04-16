import { createKVNamespace, listKVNamespaces } from "../../kv/helpers";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type KVBinding = Extract<Binding, { type: "kv_namespace" }>;

export class KVHandler extends ProvisionResourceHandler<
	"kv_namespace",
	KVBinding
> {
	static readonly bindingType = "kv_namespace";
	static readonly friendlyName = "KV Namespace";

	static async load(
		config: Config,
		accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listKVNamespaces(config, accountId, true);
		return preExisting.map((ns) => ({ title: ns.title, value: ns.id }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new KVHandler(bindingName, binding as KVBinding, config, accountId);
	}

	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		return await createKVNamespace(this.config, this.accountId, name);
	}
	constructor(
		bindingName: string,
		binding: KVBinding,
		config: Config,
		accountId: string
	) {
		super("kv_namespace", bindingName, binding, "id", config, accountId);
	}
	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === "kv_namespace" && existing.name === this.bindingName
		);
	}
	isFullySpecified(): boolean {
		return !!this.binding.id;
	}
	get ciSafe(): boolean {
		return true;
	}
	get provisioningHint(): undefined {
		return undefined;
	}
}
