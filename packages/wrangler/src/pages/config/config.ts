export type PagesConfig = {
	configPath: string | undefined;
	/**
	 * The name of your Pages project. Alphanumeric + dashes only.
	 */
	name: string | undefined;

	/**
	 * This is the ID of the account associated with your Pages account.
	 * You might have more than one account, so make sure to use
	 * the ID of the account associated with the Project you
	 * provide, if you provide one. It can also be specified through
	 * the CLOUDFLARE_ACCOUNT_ID environment variable.
	 */
	account_id: string | undefined;

	/**
	 * The output directory of your Pages project. This is the directory where your static/built files live.
	 * We will publish this directory during "wrangler pages publish"
	 */
	output_directory: string | undefined;

	/**
	 * Build image version (we don't know how this is versioned exactly yet :^) )
	 *
	 * More details at https://developers.cloudflare.com/
	 */
	build_image: string | undefined;

	/**
	 * A date in the form yyyy-mm-dd, which will be used to determine
	 * which version of the Workers runtime is used.
	 *
	 * More details at https://pages/something
	 */
	compatibility_date: string | undefined;

	/**
	 * A list of flags that enable features from upcoming features of
	 * the Workers runtime, usually used together with compatibility_flags.
	 *
	 * More details at https://developers.cloudflare.com/workers/platform/compatibility-dates
	 */
	compatibility_flags: string[];

	/**
	 * Add polyfills for node builtin modules and globals
	 */
	node_compat: boolean | undefined;

	/**
	 * A map of environment variables to set when deploying your project.
	 *
	 * NOTE: This field is not automatically inherited from the top level environment,
	 * and so must be specified in every named environment.
	 *
	 * @default `{}`
	 */
	vars: { [key: string]: unknown };
};

export type RawPagesConfig = Partial<PagesConfig>;

export type WranglerPagesConfig = {
	type: "pages";
} & PagesConfig;
