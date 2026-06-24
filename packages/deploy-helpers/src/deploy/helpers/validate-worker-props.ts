import assert from "node:assert";
import {
	configFileName,
	formatConfigSnippet,
	getTodaysCompatDate,
	UserError,
} from "@cloudflare/workers-utils";
import { logger } from "../../shared/context";
import { verifyWorkerMatchesCITag } from "./match-tag";
import { validateRoutes } from "./validate-routes";
import type { DeployProps, VersionsUploadProps } from "../../shared/types";
import type { AssetsOptions, Config } from "@cloudflare/workers-utils";

/**
 * All validation of props (merged args and config) should go here,
 * and NOT inline in deploy() or versionsUpload()
 * The order should be:
 * 1. generic validation checks
 * 2. deploy or versions upload specific checks
 * 3. checks that require making an API call
 */
export async function validateWorkerProps(
	props:
		| (DeployProps & { assetsOptions?: AssetsOptions })
		| VersionsUploadProps,
	config: Config
): Promise<void> {
	const { name, dryRun, accountId, compatibilityDate } = props;
	const { format } = props.entry;
	if (!name) {
		throw new UserError(
			`You need to provide the name of your worker. Either pass it as a cli arg with --name <name> or in your config file as ${formatConfigSnippet({ name: "<name>" }, config.userConfigPath)}`,
			{
				telemetryMessage:
					props.command === "deploy"
						? "deploy command missing worker name"
						: "versions upload missing worker name",
			}
		);
	}

	if (!compatibilityDate) {
		const compatibilityDateStr = getTodaysCompatDate();
		throw new UserError(
			`A compatibility_date is required when uploading a Worker. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
    ${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{
				telemetryMessage:
					props.command === "deploy"
						? "missing compatibility date when deploying"
						: "versions upload missing compatibility date",
			}
		);
	}

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{ telemetryMessage: "wasm_modules with es module worker" }
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "text_blobs with es module worker" }
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "data_blobs with es module worker" }
		);
	}

	if (props.command === "deploy") {
		validateRoutes(props.routes, props.assetsOptions);
		assert(
			!config.site || config.site.bucket,
			"A [site] definition requires a `bucket` field with a path to the site's assets directory."
		);
		if (
			!props.isWorkersSite &&
			Boolean(props.legacyAssetPaths) &&
			format === "service-worker"
		) {
			throw new UserError(
				"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/",
				{ telemetryMessage: "deploy service worker assets unsupported" }
			);
		}
	} else {
		if (config.containers && config.containers.length > 0) {
			logger.warn(
				`Your Worker has Containers configured. Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions. These changes will only take effect after running \`wrangler deploy\`.`
			);
		}
	}

	if (!dryRun) {
		assert(accountId, "Missing account ID");
		await verifyWorkerMatchesCITag(config, accountId, name, config.configPath);
	}
}
