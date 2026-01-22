import assert from "node:assert";
import { exports } from "cloudflare:workers";

export { env } from "cloudflare:workers";

/**
 * For reasons that aren't clear to me, just `SELF = exports.default` ends up with SELF being
 * undefined in a test. This Proxy solution works.
 */
export const SELF = new Proxy(
	{},
	{
		get(_, p) {
			// @ts-expect-error This works at runtime
			return exports.default[p].bind(exports.default);
		},
	}
);

export function getSerializedOptions(): SerializedOptions {
	assert(typeof __vitest_worker__ === "object", "Expected global Vitest state");
	const options = __vitest_worker__.providedContext.cloudflarePoolOptions;
	// `options` should always be defined when running tests

	assert(
		options !== undefined,
		"Expected serialised options" +
			Object.keys(__vitest_worker__.providedContext)
	);
	const parsedOptions = JSON.parse(options);
	return {
		...parsedOptions,
		durableObjectBindingDesignators: new Map(
			parsedOptions.durableObjectBindingDesignators
		),
	};
}

export function getResolvedMainPath(
	forBindingType: "service" | "Durable Object"
): string {
	const options = getSerializedOptions();
	if (options.main === undefined) {
		throw new Error(
			`Using ${forBindingType} bindings to the current worker requires \`poolOptions.workers.main\` to be set to your worker's entrypoint: ${JSON.stringify(options)}`
		);
	}
	return options.main;
}
