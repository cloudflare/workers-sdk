import {
	decoratorsTransformFilter,
	lowerDecorators,
} from "@cloudflare/workers-utils/decorators";
import { createPlugin } from "../utils";

/**
 * Plugin to lower standard (TC39) decorators in Worker code, which workerd
 * cannot parse and Vite leaves in place.
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
