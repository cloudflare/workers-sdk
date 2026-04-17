import { prompt, select } from "../../dialogs";
import { logger } from "../../logger";
import { createIndex, listIndexes } from "../../vectorize/client";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type VectorizeBinding = Extract<Binding, { type: "vectorize" }>;

export class VectorizeHandler extends ProvisionResourceHandler<
	"vectorize",
	VectorizeBinding
> {
	static readonly bindingType = "vectorize";
	static readonly friendlyName = "Vectorize Index";

	static async load(
		config: Config,
		_accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listIndexes(config, false);
		return preExisting.map((idx) => ({ title: idx.name, value: idx.name }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new VectorizeHandler(
			bindingName,
			binding as VectorizeBinding,
			config,
			accountId
		);
	}

	private dimensions?: number;
	private metric?: string;

	// Vectorize creation requires dimensions + metric, so we can't auto-create
	// from just a name in config. Return undefined to force the interactive path.
	// The name-in-config is still used by isConnectedToExistingResource.
	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		const body: Record<string, unknown> = { name };
		if (this.dimensions !== undefined && this.metric !== undefined) {
			body.config = {
				dimensions: this.dimensions,
				metric: this.metric,
			};
		}
		const index = await createIndex(this.config, body, false);
		return index.name;
	}
	constructor(
		bindingName: string,
		binding: VectorizeBinding,
		config: Config,
		accountId: string
	) {
		super("vectorize", bindingName, binding, "index_name", config, accountId);
	}

	isFullySpecified(): boolean {
		return (
			typeof this.binding.index_name === "string" &&
			this.binding.index_name.length > 0
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				(this.binding.index_name
					? this.binding.index_name === existing.index_name
					: true)
		);
	}

	async isConnectedToExistingResource(): Promise<boolean> {
		if (
			typeof this.binding.index_name === "symbol" ||
			!this.binding.index_name
		) {
			return false;
		}
		const indexes = await listIndexes(this.config, false);
		return indexes.some((idx) => idx.name === this.binding.index_name);
	}

	get ciSafe(): boolean {
		return false;
	}
	get provisioningHint(): string {
		return "Run `wrangler vectorize create <name> --dimensions <number> --metric <cosine|euclidean|dot-product>` and set index_name in your config. Or set index_name to an existing index.";
	}

	override async interactiveCreate(name: string): Promise<void> {
		this.metric = await select(
			`Select a distance metric for Vectorize index "${name}":`,
			{
				choices: [
					{ title: "cosine", value: "cosine" },
					{ title: "euclidean", value: "euclidean" },
					{ title: "dot-product", value: "dot-product" },
				],
				defaultOption: 0,
			}
		);
		const dimensionsStr = await prompt(
			`Enter the vector dimensions for Vectorize index "${name}" (e.g. 768, 1536):`,
			{}
		);
		this.dimensions = parseInt(dimensionsStr, 10);
		if (isNaN(this.dimensions) || this.dimensions <= 0) {
			throw new Error(
				`Invalid dimensions "${dimensionsStr}". Must be a positive integer.`
			);
		}

		logger.log(
			`🌀 Creating Vectorize index "${name}" (metric: ${this.metric}, dimensions: ${this.dimensions})...`
		);
		await this.provision(name);
	}
}
