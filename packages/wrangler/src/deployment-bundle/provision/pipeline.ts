import { prompt } from "../../dialogs";
import { logger } from "../../logger";
import { createPipeline, listPipelines } from "../../pipelines/client";
import { ProvisionResourceHandler } from "./index";
import type { Binding } from "../../api/startDevWorker/types";
import type {
	NormalisedResourceInfo,
	ProvisionableBinding,
	Settings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

type PipelineBinding = Extract<Binding, { type: "pipeline" }>;

export class PipelineHandler extends ProvisionResourceHandler<
	"pipelines",
	PipelineBinding
> {
	static readonly bindingType = "pipeline";
	static readonly friendlyName = "Pipeline";

	static async load(
		config: Config,
		_accountId: string
	): Promise<NormalisedResourceInfo[]> {
		const preExisting = await listPipelines(config);
		return preExisting.map((p) => ({ title: p.name, value: p.name }));
	}

	static create(
		bindingName: string,
		binding: ProvisionableBinding,
		config: Config,
		accountId: string
	) {
		return new PipelineHandler(
			bindingName,
			binding as PipelineBinding,
			config,
			accountId
		);
	}

	private sql?: string;

	// Pipeline creation requires a SQL query, so we can't auto-create from
	// just a name in config. Return undefined to force the interactive path.
	// The name-in-config is still used by isConnectedToExistingResource.
	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		if (!this.sql) {
			throw new Error(
				"Cannot create Pipeline without a SQL query. Use interactive mode."
			);
		}
		const pipeline = await createPipeline(this.config, {
			name,
			sql: this.sql,
		});
		return pipeline.name;
	}
	constructor(
		bindingName: string,
		binding: PipelineBinding,
		config: Config,
		accountId: string
	) {
		super("pipelines", bindingName, binding, "pipeline", config, accountId);
	}

	isFullySpecified(): boolean {
		return (
			typeof this.binding.pipeline === "string" &&
			this.binding.pipeline.length > 0
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === "pipelines" &&
				existing.name === this.bindingName &&
				(this.binding.pipeline
					? this.binding.pipeline === existing.pipeline
					: true)
		);
	}

	async isConnectedToExistingResource(): Promise<boolean> {
		if (typeof this.binding.pipeline === "symbol" || !this.binding.pipeline) {
			return false;
		}
		const pipelines = await listPipelines(this.config);
		return pipelines.some((p) => p.name === this.binding.pipeline);
	}

	get ciSafe(): boolean {
		return false;
	}
	get provisioningHint(): string {
		return "Run `wrangler pipelines create <name> --sql <query>` and set pipeline in your config. Or set pipeline to an existing pipeline name.";
	}

	override async interactiveCreate(name: string): Promise<void> {
		this.sql = await prompt(
			`Enter the SQL query for Pipeline "${name}" (e.g. SELECT * FROM stream):`,
			{}
		);

		logger.log(`🌀 Creating Pipeline "${name}"...`);
		await this.provision(name);
	}
}
