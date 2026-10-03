/**
 * Declaration emit must name every helper's return type, and the `env` type
 * each binding infers, through the public entry point. A type missing from
 * `public.ts` fails with TS4023 ("cannot be named"). New helpers are covered
 * automatically.
 */
import { bindings, exports, triggers } from "@cloudflare/config/public";
import type { InferEnv } from "@cloudflare/config/public";

declare function returnTypesOf<T>(helpers: T): {
	[K in keyof T]: T[K] extends (...args: never[]) => infer R ? R : never;
};

export const bindingTypes = returnTypesOf(bindings);
export const triggerTypes = returnTypesOf(triggers);
export const exportTypes = returnTypesOf(exports);

declare const env: InferEnv<{ env: typeof bindingTypes }>;
export const envTypes = { ...env };
