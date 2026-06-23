import assert from "node:assert";
import {
	assertDoExportsEnabledIfConfigured,
	configFileName,
	getDoExportsEnabledFromEnv,
} from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
import { isWorkerNotFoundError } from "./worker-not-found-error";
import type {
	CfDurableObjectExports,
	CfWorkerInit,
	Config,
	DoExportsOptInContext,
} from "@cloudflare/workers-utils";

/**
 * For a given Worker + migrations config, figure out which migrations
 * to upload based on the current migration tag of the deployed Worker.
 */
export async function getMigrationsToUpload(
	scriptName: string,
	props: {
		accountId: string | undefined;
		config: Config;
		useServiceEnvironments: boolean | undefined;
		env: string | undefined;
		dispatchNamespace: string | undefined;
	}
): Promise<CfWorkerInit["migrations"]> {
	const { config, accountId } = props;

	assert(accountId, "Missing accountId");
	let migrations;
	if (config.migrations.length > 0) {
		type ScriptData = { id: string; migration_tag?: string };
		let script: ScriptData | undefined;
		if (props.dispatchNamespace) {
			try {
				const scriptData = await fetchResult<{ script: ScriptData }>(
					config,
					`/accounts/${accountId}/workers/dispatch/namespaces/${props.dispatchNamespace}/scripts/${scriptName}`
				);
				script = scriptData.script;
			} catch (err) {
				suppressNotFoundError(err);
			}
		} else {
			if (props.useServiceEnvironments) {
				try {
					if (props.env) {
						const scriptData = await fetchResult<{
							script: ScriptData;
						}>(
							config,
							`/accounts/${accountId}/workers/services/${scriptName}/environments/${props.env}`
						);
						script = scriptData.script;
					} else {
						const scriptData = await fetchResult<{
							default_environment: {
								script: ScriptData;
							};
						}>(config, `/accounts/${accountId}/workers/services/${scriptName}`);
						script = scriptData.default_environment.script;
					}
				} catch (err) {
					suppressNotFoundError(err);
				}
			} else {
				const scripts = await fetchResult<ScriptData[]>(
					config,
					`/accounts/${accountId}/workers/scripts`
				);
				script = scripts.find(({ id }) => id === scriptName);
			}
		}

		if (script?.migration_tag) {
			const scriptMigrationTag = script.migration_tag;
			const foundIndex = config.migrations.findIndex(
				(migration) => migration.tag === scriptMigrationTag
			);
			if (foundIndex === -1) {
				logger.warn(
					`The published script ${scriptName} has a migration tag "${script.migration_tag}, which was not found in your ${configFileName(config.configPath)} file. You may have already deleted it. Applying all available migrations to the script...`
				);
				migrations = {
					old_tag: script.migration_tag,
					new_tag: config.migrations[config.migrations.length - 1].tag,
					steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
				};
			} else {
				if (foundIndex !== config.migrations.length - 1) {
					migrations = {
						old_tag: script.migration_tag,
						new_tag: config.migrations[config.migrations.length - 1].tag,
						steps: config.migrations
							.slice(foundIndex + 1)
							.map(({ tag: _tag, ...rest }) => rest),
					};
				}
			}
		} else {
			migrations = {
				new_tag: config.migrations[config.migrations.length - 1].tag,
				steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
			};
		}
	}
	return migrations;
}

const suppressNotFoundError = (err: unknown) => {
	if (!isWorkerNotFoundError(err) && (err as { code: number }).code !== 10092) {
		throw err;
	}
};

/**
 * Resolve which Durable Object lifecycle payload to send with the upload.
 * `migrations` and `exports` are mutually exclusive, so only one is set on
 * any given upload.
 */
export async function resolveDoLifecyclePayload(props: {
	scriptName: string;
	isDryRun: boolean | undefined;
	accountId: string | undefined;
	config: Config;
	useServiceEnvironments: boolean | undefined;
	env: string | undefined;
	dispatchNamespace: string | undefined;
	optInContext?: DoExportsOptInContext;
}): Promise<{
	migrations: CfWorkerInit["migrations"];
	exports: CfWorkerInit["exports"];
}> {
	assertDoExportsEnabledIfConfigured(
		props.config.exports,
		props.optInContext ?? "deploy"
	);

	const exportsEntries = Object.keys(props.config.exports ?? {});
	if (getDoExportsEnabledFromEnv() && exportsEntries.length > 0) {
		return {
			migrations: undefined,
			exports: props.config.exports as CfDurableObjectExports,
		};
	}

	const migrations = !props.isDryRun
		? await getMigrationsToUpload(props.scriptName, {
				accountId: props.accountId,
				config: props.config,
				useServiceEnvironments: props.useServiceEnvironments,
				env: props.env,
				dispatchNamespace: props.dispatchNamespace,
			})
		: undefined;

	return { migrations, exports: undefined };
}
