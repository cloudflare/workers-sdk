import assert from "node:assert";
import { createAISearchNamespace, getAISearchNamespace } from "../../ai-search";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type AISearchBinding = Extract<Binding, { type: "ai_search_namespace" }>;

export class AISearchNamespaceHandler extends ProvisionResourceHandler<
	"ai_search_namespace",
	AISearchBinding
> {
	static readonly bindingType = "ai_search_namespace";
	static readonly friendlyName = "AI Search Namespace";

	static async load(
		_config: Config,
		_accountId: string
	): Promise<NormalisedResourceInfo[]> {
		return [];
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new AISearchNamespaceHandler(
			bindingName,
			binding as AISearchBinding,
			config,
			accountId
		);
	}

	get name(): string | undefined {
		return typeof this.binding.namespace === "string"
			? this.binding.namespace
			: undefined;
	}

	async create(name: string) {
		await createAISearchNamespace(this.config, this.accountId, name);
		return name;
	}

	constructor(
		bindingName: string,
		binding: AISearchBinding,
		config: Config,
		accountId: string
	) {
		super(
			"ai_search_namespace",
			bindingName,
			binding,
			"namespace",
			config,
			accountId
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				(this.binding.namespace
					? this.binding.namespace === existing.namespace
					: true)
		);
	}

	async isConnectedToExistingResource(): Promise<boolean> {
		assert(typeof this.binding.namespace !== "symbol");

		if (!this.binding.namespace) {
			return false;
		}

		const namespace = await getAISearchNamespace(
			this.config,
			this.accountId,
			this.binding.namespace
		);

		return namespace !== null;
	}
	get ciSafe(): boolean {
		return true;
	}
	get provisioningHint(): undefined {
		return undefined;
	}
}
