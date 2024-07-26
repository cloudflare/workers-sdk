import fs from "fs";
import path from "path";
import { FormData } from "undici";
import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { getErrorMessage } from "./utils";
import type { Message } from "../parse";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Finetune } from "./types";

const requiredAssets = ["adapter_config.json", "adapter_model.safetensors"];

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("model_name", {
			describe: "The catalog model name",
			type: "string",
			demandOption: true,
		})
		.positional("finetune_name", {
			describe: "The finetune name",
			type: "string",
			demandOption: true,
		})
		.positional("folder_path", {
			describe: "The folder path containing the finetune assets",
			type: "string",
			demandOption: true,
		});
}

export const handler = withConfig<HandlerOptions>(
	async ({ finetune_name, model_name, folder_path, config }): Promise<void> => {
		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Creating new finetune "${finetune_name}" for model "${model_name}"...`
		);

		try {
			const files = fs.readdirSync(folder_path, {
				withFileTypes: true,
			});

			if (
				requiredAssets.every((asset) =>
					files.some((file) => file.name === asset)
				)
			) {
				try {
					const finetune = await fetchResult<Finetune>(
						`/accounts/${accountId}/ai/finetunes`,
						{
							method: "POST",
							body: JSON.stringify({
								model: model_name,
								name: finetune_name,
								description: "",
							}),
						}
					);

					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						if (requiredAssets.includes(file.name)) {
							const filePath = path.join(folder_path, file.name);
							logger.log(
								`🌀 Uploading file "${filePath}" to "${finetune_name}"...`
							);
							try {
								const formdata = new FormData();
								formdata.set("file_name", file.name);
								formdata.set("file", new Blob([fs.readFileSync(filePath)]));
								await fetchResult<void>(
									`/accounts/${accountId}/ai/finetunes/${finetune.id}/finetune-assets`,
									{
										method: "POST",
										body: formdata,
									}
								);
							} catch (e) {
								logger.error(
									`🚨 Couldn't upload file: ${getErrorMessage(
										e as Message
									)}, quiting...`
								);
								return;
							}
						}
					}
					logger.log(
						`✅ Assets uploaded, finetune "${finetune_name}" is ready to use.`
					);
				} catch (e) {
					logger.error(
						`🚨 Finetune couldn't be created: ${getErrorMessage(e as Message)}`
					);
				}
			} else {
				logger.error(
					`🚨 Asset missing. Required assets: ${requiredAssets.join(", ")}`
				);
			}
		} catch (e) {
			logger.error(
				`🚨 Folder does not exist: ${getErrorMessage(e as Message)}`
			);
		}
	}
);
