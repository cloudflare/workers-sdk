import { PLUGINS } from "miniflare";
import { formatZodError } from "miniflare";
import { z } from "zod";
import type { WorkerOptions } from "miniflare";
import type { WorkspaceProject } from "vitest/node";
import type { ParseParams, ZodError } from "zod";

const PLUGIN_VALUES = Object.values(PLUGINS);

const OPTIONS_PATH_ARRAY = ["test", "poolOptions", "workers"];
export const OPTIONS_PATH = OPTIONS_PATH_ARRAY.join(".");

const WorkersPoolOptionsSchema = z.object({
	main: z.ostring(),
	isolatedStorage: z.oboolean(),
	singleWorker: z.oboolean(),
	miniflare: z
		.object({
			workers: z.array(z.object({}).passthrough()).optional(),
		})
		.passthrough()
		.optional(),
});
type WorkersPoolOptions = z.infer<typeof WorkersPoolOptionsSchema>;
export type WorkersProjectOptions = WorkersPoolOptions & {
	miniflare: WorkerOptions & { workers?: WorkerOptions[] };
};

export type PathParseParams = Pick<ParseParams, "path">;

export function isZodErrorLike(value: unknown): value is ZodError {
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
			Object.assign(result, plugin.options.parse(value, opts));
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
	value: unknown,
	opts: PathParseParams
): WorkersProjectOptions {
	// Try to parse pool specific options
	const options = WorkersPoolOptionsSchema.parse(value, opts);
	options.miniflare ??= {};

	// Try to parse runner worker options, coalescing all errors
	const errorRef: ZodErrorRef = {};
	const workers = options.miniflare?.workers;
	try {
		options.miniflare = parseWorkerOptions(
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
				return parseWorkerOptions(worker, /* withoutScript */ false, {
					path: [...opts.path, "miniflare", "workers", i],
				});
			} catch (e) {
				coalesceZodErrors(errorRef, e);
				return { script: "" }; // (ignored as we'll be throwing)
			}
		});

		if (errorRef.value !== undefined) throw errorRef.value;
	}

	return options as WorkersProjectOptions;
}

export function parseProjectOptions(
	project: WorkspaceProject
): WorkersProjectOptions {
	const poolOptions = project.config.poolOptions;
	const workersPoolOptions = poolOptions?.workers ?? {};
	try {
		return parseCustomPoolOptions(workersPoolOptions, {
			path: OPTIONS_PATH_ARRAY,
		});
	} catch (e) {
		if (!isZodErrorLike(e)) throw e;
		let formatted: string;
		try {
			formatted = formatZodError(e, { test: { poolOptions } });
		} catch (error) {
			throw e;
		}
		throw new TypeError(
			`Unexpected pool options in project ${project.path}:\n${formatted}`
		);
	}
}
