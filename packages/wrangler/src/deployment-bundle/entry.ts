import path from "node:path";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getBasePath } from "../paths";
import guessWorkerFormat from "./guess-worker-format";
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
	/** A worker's directory. Usually where the wrangler.toml file is located */
	directory: string;
	/** Is this a module worker or a service worker? */
	format: CfScriptFormat;
	/** The directory that contains all of a `--no-bundle` worker's modules. Usually `${directory}/src`. Defaults to path.dirname(file) */
	moduleRoot: string;
	/**
	 * A worker's name
	 */
	name?: string | undefined;
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
	let file: string;
	let directory = process.cwd();

	if (args.script) {
		// If the script name comes from the command line it is relative to the current working directory.
		file = path.resolve(args.script);
	} else if (config.main === undefined) {
		if (config.site?.["entry-point"]) {
			directory = path.resolve(path.dirname(config.configPath ?? "."));
			file = path.extname(config.site?.["entry-point"])
				? path.resolve(config.site?.["entry-point"])
				: // site.entry-point could be a directory
					path.resolve(config.site?.["entry-point"], "index.js");
		} else if (
			args.legacyAssets ||
			config.legacy_assets ||
			args.assets ||
			config.assets
		) {
			file = path.resolve(getBasePath(), "templates/no-op-worker.js");
		} else {
			throw new UserError(
				`Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler ${command} path/to/script\`) or the \`main\` config field.`
			);
		}
	} else {
		directory = path.resolve(path.dirname(config.configPath ?? "."));
		file = path.resolve(directory, config.main);
	}

	const relativeFile = path.relative(directory, file) || ".";
	await runCustomBuild(file, relativeFile, config.build);

	const format = await guessWorkerFormat(
		file,
		directory,
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
		const addScriptName =
			"You can use Durable Objects defined in other Workers by specifying a `script_name` in your wrangler.toml, where `script_name` is the name of the Worker that implements that Durable Object. For example:";
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
		file,
		directory,
		format,
		moduleRoot: args.moduleRoot ?? config.base_dir ?? path.dirname(file),
		name: config.name ?? "worker",
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
