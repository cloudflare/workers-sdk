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
	type DefinedConfig<T extends TConfigInput> = ConfigWithType<T, TType>;

	function define<const T extends TConfigInput>(
		config: (ctx: ConfigContext) => Promise<TConfigInput & T>
	): (ctx: ConfigContext) => Promise<DefinedConfig<T>>;
	function define<const T extends TConfigInput>(
		config: (ctx: ConfigContext) => TConfigInput & T
	): (ctx: ConfigContext) => DefinedConfig<T>;
	function define<const T extends TConfigInput>(
		config: (
			ctx: ConfigContext
		) => (TConfigInput & T) | Promise<TConfigInput & T>
	): (ctx: ConfigContext) => DefinedConfig<T> | Promise<DefinedConfig<T>>;
	function define<const T extends TConfigInput>(
		config: Promise<TConfigInput & T>
	): Promise<DefinedConfig<T>>;
	function define<const T extends TConfigInput>(
		config: TConfigInput & T
	): DefinedConfig<T>;
	function define(
		config: ConfigInput<TConfigInput>
	): ConfigInput<ConfigWithType<TConfigInput, TType>> {
		return addConfigType(config, type);
	}

	return define;
}
