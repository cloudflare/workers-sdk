import {
	createWorkerNamespace,
	listWorkerNamespaces,
} from "../../dispatch-namespace";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type DispatchNamespaceBinding = Extract<
	Binding,
	{ type: "dispatch_namespace" }
>;

export class DispatchNamespaceHandler extends ProvisionResourceHandler<
	"dispatch_namespace",
	DispatchNamespaceBinding
> {
	static readonly bindingType = "dispatch_namespace";
	static readonly friendlyName = "Dispatch Namespace";

	static async load(
		config: Config,
		accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listWorkerNamespaces(config, accountId);
		return preExisting.map((ns) => ({
			title: ns.namespace_name,
			value: ns.namespace_name,
		}));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new DispatchNamespaceHandler(
			bindingName,
			binding as DispatchNamespaceBinding,
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
		const result = await createWorkerNamespace(
			this.config,
			this.accountId,
			name
		);
		return result.namespace_name;
	}
	constructor(
		bindingName: string,
		binding: DispatchNamespaceBinding,
		config: Config,
		accountId: string
	) {
		super(
			"dispatch_namespace",
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
		if (typeof this.binding.namespace === "symbol" || !this.binding.namespace) {
			return false;
		}
		const namespaces = await listWorkerNamespaces(this.config, this.accountId);
		return namespaces.some(
			(ns) => ns.namespace_name === this.binding.namespace
		);
	}

	get ciSafe(): boolean {
		return true;
	}
	get provisioningHint(): undefined {
		return undefined;
	}
}
