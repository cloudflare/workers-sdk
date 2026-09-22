import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import {
	fetchKVGetValue,
	fetchListResult,
	fetchPagedListResult,
	fetchResult,
} from "../cfetch";
import { createCloudflareClient } from "../cfetch/internal";
import { confirm, prompt, select } from "../dialogs";
import { logger } from "../logger";

export function initApiDeployHelpersContext(): void {
	initDeployHelpersContext({
		logger,
		createCloudflareClient,
		fetchResult,
		fetchListResult,
		fetchPagedListResult,
		fetchKVGetValue,
		confirm,
		prompt,
		select,
	});
}
