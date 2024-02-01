import path from "node:path";
import {
	formatZodError,
	getRootPath,
	parseWithRootPath,
	PLUGINS,
} from "miniflare";
import { z } from "zod";
import type { ProvidedEnv } from "cloudflare:test";
import type { Awaitable, WorkerOptions } from "miniflare";
import type { ProvidedContext } from "vitest";
import type { WorkspaceProject } from "vitest/node";
import type { ParseParams, ZodError } from "zod";
import { getProjectPath, getRelativeProjectPath } from "./helpers";

const PLUGIN_VALUES = Object.values(PLUGINS);

const OPTIONS_PATH_ARRAY = ["test", "poolOptions", "workers"];
export const OPTIONS_PATH = OPTIONS_PATH_ARRAY.join(".");

const WorkersPoolOptionsSchema = z.object({
	/**
	 * Entrypoint to worker run in the same isolate/context as tests. Only
	 * required if `kCurrentWorker` `serviceBindings` defined, or Durable Objects
	 * without explicit `scriptName` used. Note this goes through Vite transforms
	 * and can be TypeScript. Note also `import module from "<main>"` inside tests
	 * gives exactly the same `module` instance as is used internally for
	 * self-service and Durable Object bindings.
	 */
	main: z.ostring(),
	/**
	 * Enables per-test isolated storage. If enabled, any writes to storage
	 * performed in a test will be undone at the end of the test. The test storage
	 * environment is copied from the containing suite, meaning `beforeAll()`
	 * hooks can be used to seed data. If this is disabled, all tests will share
	 * the same storage.
	 */
	isolatedStorage: z.boolean().default(false),
	/**
	 * Runs all tests in this project serially in the same worker, using the same
	 * module cache. This can significantly speed up tests if you've got lots of
	 * small test files.
	 */
	singleWorker: z.boolean().default(false),
	/**
	 * Called at the start of each test run with the same `env` object as
	 * `import { env } from "cloudflare:test"` inside tests. This function will
	 * always be called with nothing stored in any of the bindings. This function
	 * may be called multiple times per test run if `singleWorker` is `false`
	 * and `isolatedStorage` is `true`.
	 */
	setupEnvironment: z
		// eslint-disable-next-line unused-imports/no-unused-vars
		.custom<(env: ProvidedEnv) => Awaitable<void>>(
			(v) => typeof v === "function"
		)
		.optional(),
	miniflare: z
		.object({
			workers: z.array(z.object({}).passthrough()).optional(),
		})
		.passthrough()
		.optional(),
});
export type SourcelessWorkerOptions = Omit<
	WorkerOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot" | "modulesRule"
>;
export type WorkersProjectOptions = z.input<typeof WorkersPoolOptionsSchema> & {
	miniflare?: SourcelessWorkerOptions & {
		workers?: WorkerOptions[];
	};
};

export type PathParseParams = Pick<ParseParams, "path">;

function isZodErrorLike(value: unknown): value is ZodError {
	return (
		typeof value === "object" &&
		value !== null &&
		"issues" in value &&
		Array.isArray(value.issues)
	);
}

type ZodErrorRef = { value?: ZodError };
function coalesceZodErrors(ref: ZodErrorRef, thrown: unknown) {
	if (!isZodErrorLike(thrown)) throw thrown;
	if (ref.value === undefined) ref.value = thrown;
	else ref.value.issues.push(...thrown.issues);
}

function parseWorkerOptions(
	rootPath: string,
	value: Record<string, unknown>,
	withoutScript: boolean,
	opts: PathParseParams
): WorkerOptions {
	// If this worker shouldn't have a configurable script, remove all script data
	// and replace it with an empty `script` that will pass validation
	if (withoutScript) {
		value["script"] = "";
		delete value["scriptPath"];
		delete value["modules"];
		delete value["modulesRoot"];
		delete value["modulesRules"];
	}

	const result = {} as WorkerOptions;
	const errorRef: ZodErrorRef = {};
	for (const plugin of PLUGIN_VALUES) {
		try {
			// This `parse()` may throw a different `ZodError` than what we `import`
			const parsed = parseWithRootPath(rootPath, plugin.options, value, opts);
			Object.assign(result, parsed);
		} catch (e) {
			coalesceZodErrors(errorRef, e);
		}
	}
	if (errorRef.value !== undefined) throw errorRef.value;

	// Remove the placeholder script added if any
	if (withoutScript) delete value["script"];
	return result;
}

function parseCustomPoolOptions(
	rootPath: string,
	value: unknown,
	opts: PathParseParams
): WorkersProjectOptions {
	// Try to parse pool specific options
	const options = WorkersPoolOptionsSchema.parse(value, opts);
	options.miniflare ??= {};

	// Try to parse runner worker options, coalescing all errors
	const errorRef: ZodErrorRef = {};
	const workers = options.miniflare?.workers;
	const rootPathOption = getRootPath(options.miniflare);
	rootPath = path.resolve(rootPath, rootPathOption);
	try {
		options.miniflare = parseWorkerOptions(
			rootPath,
			options.miniflare,
			/* withoutScript */ true, // (script provided by runner)
			{ path: [...opts.path, "miniflare"] }
		);
	} catch (e) {
		coalesceZodErrors(errorRef, e);
	}

	// Try to parse auxiliary worker options
	if (workers !== undefined) {
		options.miniflare.workers = workers.map((worker, i) => {
			try {
				const workerRootPathOption = getRootPath(worker);
				const workerRootPath = path.resolve(rootPath, workerRootPathOption);
				return parseWorkerOptions(
					workerRootPath,
					worker,
					/* withoutScript */ false,
					{
						path: [...opts.path, "miniflare", "workers", i],
					}
				);
			} catch (e) {
				coalesceZodErrors(errorRef, e);
				return { script: "" }; // (ignored as we'll be throwing)
			}
		});
	}

	if (errorRef.value !== undefined) throw errorRef.value;

	return options as WorkersProjectOptions;
}

export async function parseProjectOptions(
	project: WorkspaceProject
): Promise<WorkersProjectOptions> {
	// Make sure the user hasn't specified a custom environment. This was how
	// users enabled Miniflare 2's Vitest environment, so it's likely users will
	// hit this case.
	const environment = project.config.environment;
	if (environment !== undefined && environment !== "node") {
		const quotedEnvironment = JSON.stringify(environment);

		let migrationGuide = "";
		if (environment === "miniflare") {
			// TODO(soon): include a link to the migration guide once it's written
			migrationGuide =
				", and refer to the migration guide if upgrading from `vitest-environment-miniflare`";
		}

		const relativePath = getRelativeProjectPath(project);
		const message = [
			`Unexpected custom \`environment\` ${quotedEnvironment} in project ${relativePath}.`,
			"The Workers pool always runs your tests inside of an environment providing Workers runtime APIs.",
			`Please remove the \`environment\` configuration${migrationGuide}.`,
			"Use `poolMatchGlobs`/`environmentMatchGlobs` to run a subset of your tests in a different pool/environment.",
		].join("\n");
		throw new TypeError(message);
	}

	const projectPath = getProjectPath(project);
	const rootPath =
		typeof projectPath === "string" ? path.dirname(projectPath) : "";
	const poolOptions = project.config.poolOptions;
	let workersPoolOptions = poolOptions?.workers ?? {};
	try {
		if (typeof workersPoolOptions === "function") {
			// https://github.com/vitest-dev/vitest/blob/v1.0.0/packages/vitest/src/integrations/inject.ts
			const inject = <K extends keyof ProvidedContext>(
				key: K
			): ProvidedContext[K] => {
				return project.getProvidedContext()[key];
			};
			workersPoolOptions = await workersPoolOptions({ inject });
		}
		return parseCustomPoolOptions(rootPath, workersPoolOptions, {
			path: OPTIONS_PATH_ARRAY,
		});
	} catch (e) {
		if (!isZodErrorLike(e)) throw e;
		let formatted: string;
		try {
			formatted = formatZodError(e, {
				test: { poolOptions: { workers: workersPoolOptions } },
			});
		} catch (error) {
			throw e;
		}
		const relativePath = getRelativeProjectPath(project);
		throw new TypeError(
			`Unexpected pool options in project ${relativePath}:\n${formatted}`
		);
	}
}
