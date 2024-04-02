import fs, { existsSync, statSync } from "fs";
import path from "path";
import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { asJson } from "../yargs-types";
import { getErrorMessage } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Finetune } from "./types";

export function options(yargs: CommonYargsArgv) {
	return asJson(yargs);
}

const requiredAssets = ["adapter_config.json", "adapter_model.safetensors"];

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;

export const handler = withConfig<HandlerOptions>(
	async (args: HandlerOptions): Promise<void> => {
		const accountId = await requireAuth((args as any).config);

		logger.log(
			`🌀 Creating new finetune "${(args as any).finetune_name}" for model "${
				(args as any).model_name
			}"...`
		);

		try {
			const files = fs.readdirSync((args as any).folder_path, {
				withFileTypes: true,
			});

			if (
				requiredAssets.every((asset) =>
					files.some((file) => file.name === asset)
				)
			) {
				try {
					const finetune: any = await fetchResult<void>(
						`/accounts/${accountId}/ai/finetunes`,
						{
							method: "POST",
							body: JSON.stringify({
								model: (args as any).model_name,
								name: (args as any).finetune_name,
								description: "",
							}),
						}
					);

					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						if (requiredAssets.includes(file.name)) {
							const filePath = path.join((args as any).folder_path, file.name);
							logger.log(
								`🌀 Uploading file "${filePath}" to "${
									(args as any).finetune_name
								}"...`
							);
							try {
								const formdata = new FormData();
								formdata.set("file_name", file.name);
								formdata.set("file", new Blob([fs.readFileSync(filePath)]));
								await fetchResult<void>(
									`/accounts/${accountId}/ai/finetunes/${finetune.id}/finetune-assets`,
									{
										method: "POST",
										body: formdata as any,
									}
								);
							} catch (e: any) {
								logger.error(
									`🚨 Couldn't upload file: ${getErrorMessage(e)}, quiting...`
								);
								return;
							}
						}
					}
					logger.log(
						`✅ Assets uploaded, finetune "${
							(args as any).finetune_name
						}" is ready to use.`
					);
				} catch (e: any) {
					logger.error(
						`🚨 Finetune couldn't be created: ${getErrorMessage(e)}`
					);
				}
			} else {
				logger.error(
					`🚨 Asset missing. Required assets: ${requiredAssets.join(", ")}`
				);
			}
		} catch (e: any) {
			logger.error(`🚨 Folder does not exist: ${getErrorMessage(e)}`);
		}
	}
);
