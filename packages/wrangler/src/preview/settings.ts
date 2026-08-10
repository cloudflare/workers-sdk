import {
	previewSettingsGet,
	previewSettingsUpdate,
} from "@cloudflare/deploy-helpers";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

export async function handlePreviewSettingsUpdateCommand(
	args: {
		skipConfirmation?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const accountId = await requireAuth(config);
	await previewSettingsUpdate(accountId, args, config);
}

export async function handlePreviewSettingsCommand(
	args: {
		json?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const accountId = await requireAuth(config);
	await previewSettingsGet(accountId, args, config);
}
