import * as esbuild from "esbuild";
import { createPlugin } from "../utils";

/**
 * `transform` hook filter for modules that may contain decorators. Vite module
 * IDs can carry a query string or hash, such as the `?v=` on pre-bundled
 * dependencies.
 */
export const decoratorsTransformFilter = {
	id: /\.[cm]?[jt]sx?(?:[?#].*)?$/,
	code: "@",
};

// esbuild emits this helper whenever it lowers a decorator.
const loweredDecoratorMarker = "__decoratorStart(";

/**
 * Plugin to lower standard (TC39) decorators in Worker code.
 *
 * workerd cannot parse decorator syntax, and Vite leaves it in place: Vite 8's
 * Oxc transform cannot lower standard decorators, and Vite 6 and 7 do not set
 * an esbuild target during development.
 *
 * TODO: remove once Vite lowers standard decorators itself.
 */
export const decoratorsPlugin = createPlugin("decorators", (ctx) => {
	return {
		// Run after Vite's Oxc or esbuild transform so that TypeScript has already
		// been stripped. TypeScript `experimentalDecorators` are lowered by that
		// transform, so they never reach this plugin.
		applyToEnvironment(environment) {
			return ctx.getWorkerConfig(environment.name) !== undefined;
		},
		transform: {
			filter: decoratorsTransformFilter,
			handler: lowerDecorators,
		},
	};
});

/**
 * Lower standard decorators in a JavaScript module, leaving all other syntax
 * unchanged.
 *
 * @param code - The module's JavaScript, with any TypeScript already stripped.
 * @param id - The module ID, used for the file-type check and the source map.
 * @returns The lowered code and source map, or `undefined` if the module has no
 * decorators.
 */
export async function lowerDecorators(
	code: string,
	id: string
): Promise<{ code: string; map: string } | undefined> {
	// Vite 6 doesn't apply hook filters, so check them here too.
	if (
		!decoratorsTransformFilter.id.test(id) ||
		!code.includes(decoratorsTransformFilter.code)
	) {
		return;
	}

	const result = await esbuild.transform(code, {
		loader: "js",
		target: "esnext",
		supported: { decorators: false },
		sourcefile: id,
		sourcemap: "external",
	});

	// Most modules with an `@` have no decorators, for example because of JSDoc
	// tags. Keep those unchanged rather than returning esbuild's reprint.
	if (!result.code.includes(loweredDecoratorMarker)) {
		return;
	}

	return { code: result.code, map: result.map };
}
