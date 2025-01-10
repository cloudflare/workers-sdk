import path from "node:path";
import { configFileName } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import guessWorkerFormat from "./guess-worker-format";
import {
	resolveEntryWithAssets,
	resolveEntryWithEntryPoint,
	resolveEntryWithMain,
	resolveEntryWithScript,
} from "./resolve-entry";
import { runCustomBuild } from "./run-custom-build";
import type { Config } from "../config";
import type { DurableObjectBindings } from "../config/environment";
import type { CfScriptFormat } from "./worker";

/**
 * An entry point for the Worker.
 *
 * It consists not just of a `file`, but also of a `directory` that is used to resolve relative paths.
 */
export type Entry = {
	/** A worker's entrypoint */
	file: string;
	/** A worker's directory. Usually where the Wrangler configuration file is located */
	projectRoot: string;
	/** Is this a module worker or a service worker? */
	format: CfScriptFormat;
	/** The directory that contains all of a `--no-bundle` worker's modules. Usually `${directory}/src`. Defaults to path.dirname(file) */
	moduleRoot: string;
	/**
	 * A worker's name
	 */
	name?: string | undefined;

	/** Export from a Worker's entrypoint */
	exports: string[];
};

/**
 * Compute the entry-point for the Worker.
 */
export async function getEntry(
	args: {
		script?: string;
		format?: CfScriptFormat | undefined;
		legacyAssets?: string | undefined | boolean;
		moduleRoot?: string;
		assets?: string | undefined;
	},
	config: Config,
	command: "dev" | "deploy" | "versions upload" | "types"
): Promise<Entry> {
	const entryPoint = config.site?.["entry-point"];

	let paths:
		| { absolutePath: string; relativePath: string; projectRoot?: string }
		| undefined;

	if (args.script) {
		paths = resolveEntryWithScript(args.script);
	} else if (config.main !== undefined) {
		paths = resolveEntryWithMain(config.main, config);
	} else if (entryPoint) {
		paths = resolveEntryWithEntryPoint(entryPoint, config);
	} else if (
		args.legacyAssets ||
		config.legacy_assets ||
		args.assets ||
		config.assets
	) {
		paths = resolveEntryWithAssets();
	} else {
		if (config.pages_build_output_dir && command === "dev") {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages dev` instead."
			);
		}
		throw new UserError(
			`Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler ${command} path/to/script\`) or the \`main\` config field.`
		);
	}
	await runCustomBuild(
		paths.absolutePath,
		paths.relativePath,
		config.build,
		config.configPath
	);

	const projectRoot = paths.projectRoot ?? process.cwd();
	const { format, exports } = await guessWorkerFormat(
		paths.absolutePath,
		projectRoot,
		args.format ?? config.build?.upload?.format,
		config.tsconfig
	);

	const { localBindings, remoteBindings } =
		partitionDurableObjectBindings(config);

	if (command === "dev" && remoteBindings.length > 0) {
		logger.warn(
			"WARNING: You have Durable Object bindings that are not defined locally in the worker being developed.\n" +
				"Be aware that changes to the data stored in these Durable Objects will be permanent and affect the live instances.\n" +
				"Remote Durable Objects that are affected:\n" +
				remoteBindings.map((b) => `- ${JSON.stringify(b)}`).join("\n")
		);
	}

	if (format === "service-worker" && localBindings.length > 0) {
		const errorMessage =
			"You seem to be trying to use Durable Objects in a Worker written as a service-worker.";
		const addScriptName = `You can use Durable Objects defined in other Workers by specifying a \`script_name\` in your ${configFileName(config.configPath)} file, where \`script_name\` is the name of the Worker that implements that Durable Object. For example:`;
		const addScriptNameExamples = generateAddScriptNameExamples(localBindings);
		const migrateText =
			"Alternatively, migrate your worker to ES Module syntax to implement a Durable Object in this Worker:";
		const migrateUrl =
			"https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/";
		throw new UserError(
			`${errorMessage}\n${addScriptName}\n${addScriptNameExamples}\n${migrateText}\n${migrateUrl}`
		);
	}

	return {
		file: paths.absolutePath,
		projectRoot,
		format,
		moduleRoot:
			args.moduleRoot ?? config.base_dir ?? path.dirname(paths.absolutePath),
		name: config.name ?? "worker",
		exports,
	};
}

/**
 * Groups the durable object bindings into two lists:
 * those that are defined locally and those that refer to a durable object defined in another script.
 */
function partitionDurableObjectBindings(config: Config): {
	localBindings: DurableObjectBindings;
	remoteBindings: DurableObjectBindings;
} {
	const localBindings: DurableObjectBindings = [];
	const remoteBindings: DurableObjectBindings = [];
	for (const binding of config.durable_objects.bindings) {
		if (binding.script_name === undefined) {
			localBindings.push(binding);
		} else {
			remoteBindings.push(binding);
		}
	}
	return { localBindings, remoteBindings };
}

/**
 * Generates some help text based on the Durable Object bindings in a given
 * config indicating how the user can add a `script_name` field to bind an
 * externally defined Durable Object.
 */
function generateAddScriptNameExamples(
	localBindings: DurableObjectBindings
): string {
	function exampleScriptName(binding_name: string): string {
		return `${binding_name.toLowerCase().replaceAll("_", "-")}-worker`;
	}

	return localBindings
		.map(({ name, class_name }) => {
			const script_name = exampleScriptName(name);
			const currentBinding = `{ name = ${name}, class_name = ${class_name} }`;
			const fixedBinding = `{ name = ${name}, class_name = ${class_name}, script_name = ${script_name} }`;

			return `${currentBinding} ==> ${fixedBinding}`;
		})
		.join("\n");
}
