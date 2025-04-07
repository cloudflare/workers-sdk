import { readConfig } from "../../config";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
import { getPipeline } from "../client";
import { formatPipelinePretty } from "../index";
import { validateName } from "../validate";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { Argv } from "yargs";

export function addGetOptions(yargs: Argv<CommonYargsOptions>) {
	return yargs
		.positional("pipeline", {
			type: "string",
			describe: "The name of the pipeline to inspect",
			demandOption: true,
		})
		.option("format", {
			type: "string",
			describe: "The output format for pipeline",
			default: "pretty",
			demandOption: false,
			coerce: (value: string) => {
				const formats = ["pretty", "json"];
				if (!formats.includes(value)) {
					throw new UserError(`Unknown format value: ${value}`);
				}
				return value;
			},
		});
}

export async function getPipelineHandler(
	args: StrictYargsOptionsToInterface<typeof addGetOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args);
	const accountId = await requireAuth(config);
	const name = args.pipeline;

	validateName("pipeline name", name);

	const pipeline = await getPipeline(accountId, name);

	switch (args.format) {
		case "json":
			logger.log(JSON.stringify(pipeline, null, 2));
			break;
		case "pretty":
			logger.log(formatPipelinePretty(pipeline));
			break;
	}
}
