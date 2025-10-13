import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { execa } from "execa";
import { fetchResult } from "./cfetch";
import { fetchWorkerDefinitionFromDash } from "./cfetch/internal";
import { createCommand } from "./core/create-command";
import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getC3CommandFromEnv,
} from "./environment-variables/misc-variables";
import { UserError } from "./errors";
import { logger } from "./logger";
import { readMetricsConfig } from "./metrics/metrics-config";
import { getPackageManager } from "./package-manager";
import { requireAuth } from "./user";
import { createBatches } from "./utils/create-batches";
import { downloadWorkerConfig } from "./utils/download-worker-config";
import * as shellquote from "./utils/shell-quote";
import type { Observability, TailConsumer } from "./config/environment";
import type { PackageManager } from "./package-manager";
import type { ReadableStream } from "stream/web";

export const init = createCommand({
	metadata: {
		description: "📥 Initialize a basic Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	args: {
		name: {
			describe: "The name of your worker",
			type: "string",
		},
		yes: {
			describe: 'Answer "yes" to any prompts for new projects',
			type: "boolean",
			alias: "y",
		},
		"from-dash": {
			describe:
				"The name of the Worker you wish to download from the Cloudflare dashboard for local development.",
			type: "string",
			requiresArg: true,
		},
		"delegate-c3": {
			describe: "Delegate to Create Cloudflare CLI (C3)",
			type: "boolean",
			hidden: true,
			default: true,
			alias: "c3",
		},
	},
	behaviour: {
		provideConfig: false,
	},
	positionalArgs: ["name"],
	async handler(args) {
		const yesFlag = args.yes ?? false;

		const packageManager = await getPackageManager();

		const name = args.fromDash ?? args.name;

		const c3Arguments = [
			...shellquote.parse(getC3CommandFromEnv()),
			...(name ? [name] : []),
			...(yesFlag && isNpm(packageManager) ? ["-y"] : []), // --yes arg for npx
			...(isNpm(packageManager) ? ["--"] : []),
			...(args.fromDash ? ["--existing-script", args.fromDash] : []),
			...(yesFlag ? ["--wrangler-defaults"] : []),
		];
		const replacementC3Command = `\`${packageManager.type} ${c3Arguments.join(
			" "
		)}\``;

		if (args.fromDash && !args.delegateC3) {
			const accountId = await requireAuth({});
			try {
				await fetchResult<ServiceMetadataRes>(
					// `wrangler init` is not run from within a Workers project, so there will be no config file to define the compliance region.
					COMPLIANCE_REGION_CONFIG_UNKNOWN,
					`/accounts/${accountId}/workers/services/${args.fromDash}`
				);
			} catch (err) {
				if ((err as { code?: number }).code === 10090) {
					throw new UserError(
						"wrangler couldn't find a Worker with that name in your account.\nRun `wrangler whoami` to confirm you're logged into the correct account.",
						{
							telemetryMessage: true,
						}
					);
				}
				throw err;
			}

			const creationDir = path.join(process.cwd(), args.fromDash);

			await mkdir(creationDir, { recursive: true });
			const { modules, config } = await downloadWorker(
				accountId,
				args.fromDash
			);

			await mkdir(path.join(creationDir, "./src"), {
				recursive: true,
			});

			config.main = `src/${config.main}`;
			config.name = args.fromDash;

			// writeFile in small batches (of 10) to not exhaust system file descriptors
			for (const files of createBatches(modules, 10)) {
				await Promise.all(
					files.map(async (file) => {
						const filepath = path.join(creationDir, `./src/${file.name}`);
						const directory = dirname(filepath);

						await mkdir(directory, { recursive: true });
						await writeFile(filepath, file.stream() as ReadableStream);
					})
				);
			}

			await writeFile(
				path.join(creationDir, "wrangler.jsonc"),
				JSON.stringify(config, null, 2)
			);
		} else {
			logger.log(`🌀 Running ${replacementC3Command}...`);

			// if telemetry is disabled in wrangler, prevent c3 from sending metrics too
			const metricsConfig = readMetricsConfig();
			await execa(packageManager.type, c3Arguments, {
				stdio: "inherit",
				...(metricsConfig.permission?.enabled === false && {
					env: { CREATE_CLOUDFLARE_TELEMETRY_DISABLED: "1" },
				}),
			});
		}
	},
});

export type ServiceMetadataRes = {
	id: string;
	default_environment: {
		environment: string;
		created_on: string;
		modified_on: string;
		script: {
			id: string;
			tag: string;
			etag: string;
			handlers: string[];
			modified_on: string;
			created_on: string;
			migration_tag: string;
			usage_model: "bundled" | "unbound";
			limits: {
				cpu_ms: number;
			};
			compatibility_date: string;
			compatibility_flags: string[];
			last_deployed_from?: "wrangler" | "dash" | "api";
			placement_mode?: "smart";
			tail_consumers?: TailConsumer[];
			observability?: Observability;
		};
	};
	created_on: string;
	modified_on: string;
	usage_model: "bundled" | "unbound";
	environments: [
		{
			environment: string;
			created_on: string;
			modified_on: string;
		},
	];
};

function isNpm(packageManager: PackageManager) {
	return packageManager.type === "npm";
}

export async function downloadWorker(accountId: string, workerName: string) {
	const serviceMetadata = await fetchResult<ServiceMetadataRes>(
		COMPLIANCE_REGION_CONFIG_UNKNOWN,
		`/accounts/${accountId}/workers/services/${workerName}`
	);
	const defaultEnvironment = serviceMetadata.default_environment.environment;

	// Use the default environment, assuming it's the most up to date code.
	const { entrypoint, modules } = await fetchWorkerDefinitionFromDash(
		COMPLIANCE_REGION_CONFIG_UNKNOWN,
		`/accounts/${accountId}/workers/services/${workerName}/environments/${defaultEnvironment}/content/v2`
	);

	const config = await downloadWorkerConfig(
		workerName,
		defaultEnvironment,
		entrypoint,
		accountId
	);

	return {
		modules,
		config,
	};
}
