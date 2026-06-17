import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import {
	fetchKVGetValue,
	fetchListResult,
	fetchPagedListResult,
	fetchResult,
} from "../cfetch";
import { confirm, prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";

export function initApiDeployHelpersContext(): void {
	initDeployHelpersContext({
		logger,
		fetchResult,
		fetchListResult,
		fetchPagedListResult,
		fetchKVGetValue,
		confirm,
		prompt,
		isNonInteractiveOrCI,
	});
}
