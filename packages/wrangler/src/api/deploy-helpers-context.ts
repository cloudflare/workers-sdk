import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import {
	fetchKVGetValue,
	fetchListResult,
	fetchPagedListResult,
	fetchResult,
} from "../cfetch";
import { confirm, prompt, select } from "../dialogs";
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
		select,
		isNonInteractiveOrCI,
	});
}
