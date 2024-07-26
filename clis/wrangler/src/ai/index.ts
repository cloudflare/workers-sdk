import * as CreateFinetune from "./createFinetune";
import * as ListCatalog from "./listCatalog";
import * as ListFinetune from "./listFinetune";
import type { CommonYargsArgv } from "../yargs-types";

export function ai(yargs: CommonYargsArgv) {
	return yargs
		.command(
			"models",
			"List catalog models",
			ListCatalog.options,
			ListCatalog.handler
		)
		.command("finetune", "Interact with finetune files", (finetuneArgs) =>
			finetuneArgs
				.demandCommand()
				.command(
					"list",
					"List your finetune files",
					ListFinetune.options,
					ListFinetune.handler
				)
				.command(
					"create <model_name> <finetune_name> <folder_path>",
					"Create finetune and upload assets",
					CreateFinetune.options,
					CreateFinetune.handler
				)
		);
}
