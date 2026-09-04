export interface ConfigContext {
	/**
	 * The mode the config is being evaluated in.
	 * Set via the `--mode` CLI flag.
	 * In Vite the mode defaults to `development` in `vite dev` and `production` in `vite build` ([more info](https://vite.dev/guide/env-and-mode.html#modes)).
	 * In Wrangler the mode defaults to `undefined`.
	 */
	mode: string | undefined;
}

/**
 * The authored config in any of its supported shapes: a plain value, a promise,
 * or a function of {@link ConfigContext}.
 */
export type ConfigInput<T> =
	| T
	| Promise<T>
	| ((ctx: ConfigContext) => T | Promise<T>);

type ConfigObject = Record<string, unknown>;

export type ConfigWithType<T extends ConfigObject, TType extends string> = T & {
	type: TType;
};

type DefinedConfigValue<TValue, TType extends string> =
	TValue extends Promise<infer TConfig extends ConfigObject>
		? Promise<ConfigWithType<TConfig, TType>>
		: TValue extends ConfigObject
			? ConfigWithType<TValue, TType>
			: never;

type DefinedConfig<TInput, TType extends string> = TInput extends (
	ctx: ConfigContext
) => infer TResult
	? (ctx: ConfigContext) => DefinedConfigValue<TResult, TType>
	: DefinedConfigValue<TInput, TType>;

/** Add a config type while preserving its value, promise, or function shape. */
function addConfigType<
	TConfig extends ConfigObject,
	const TType extends string,
>(
	config: ConfigInput<TConfig>,
	type: TType
): ConfigInput<ConfigWithType<TConfig, TType>> {
	function addType(value: TConfig): ConfigWithType<TConfig, TType> {
		return { ...value, type };
	}

	if (typeof config === "function") {
		return (ctx) => {
			const result = config(ctx);
			return result instanceof Promise ? result.then(addType) : addType(result);
		};
	}

	return config instanceof Promise ? config.then(addType) : addType(config);
}

/** Create a type-safe config helper for a particular export type. */
export function createConfigDefiner<
	TConfigInput extends ConfigObject,
	const TType extends string,
>(type: TType) {
	function define<const TInput extends ConfigInput<TConfigInput>>(
		config: TInput
	): DefinedConfig<TInput, TType>;
	function define(
		config: ConfigInput<TConfigInput>
	): ConfigInput<ConfigWithType<TConfigInput, TType>> {
		return addConfigType(config, type);
	}

	return define;
}
