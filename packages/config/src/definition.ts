export interface ConfigContext {
	/**
	 * The mode the config is being evaluated in.
	 * Set via the `--mode` CLI flag.
	 * In Vite the mode defaults to `development` in `vite dev` and `production` in `vite build` ([more info](https://vite.dev/guide/env-and-mode.html#modes)).
	 * In Wrangler the mode defaults to `undefined`.
	 */
	mode: string | undefined;
}

// We currently use Symbol.for rather than Symbol so that the symbol matches if duplicated across bundles
// This wouldn't be necessary if @cloudflare/config was published and included as a dependency
export const DEFINITION = Symbol.for("@cloudflare/config:definition");

/**
 * The authored config in any of its supported shapes: a plain value, a promise,
 * or a function of {@link ConfigContext}.
 */
export type ConfigInput<T> =
	| T
	| Promise<T>
	| ((ctx: ConfigContext) => T | Promise<T>);

/**
 * Unwrap an authored config from its value / promise / function shape, awaiting
 * the result. A function config is invoked with {@link ConfigContext}.
 */
async function unwrap(config: unknown, ctx: ConfigContext): Promise<unknown> {
	return typeof config === "function"
		? await (config as (ctx: ConfigContext) => unknown)(ctx)
		: await config;
}

/**
 * Resolve any `cloudflare.config.ts` export to its plain config value.
 *
 * A `define*` helper stores its authored config plus `type` under the
 * {@link DEFINITION} symbol; here we unwrap the config and stamp `type` back on.
 * Every other export — a raw object/promise/function — is unwrapped as-is and
 * already carries its own `type`. Discrimination happens afterwards via `type`.
 */
export async function resolveExportDefinition(
	def: unknown,
	ctx: ConfigContext
): Promise<unknown> {
	if (typeof def === "object" && def !== null && DEFINITION in def) {
		const { config, type } = (def as Record<symbol, unknown>)[DEFINITION] as {
			config: unknown;
			type: string;
		};
		const resolved = await unwrap(config, ctx);
		return { ...(resolved as object), type };
	}

	return await unwrap(def, ctx);
}
