import { getPlatformProxy } from "../platform/index";
import type { GetPlatformProxyOptions, PlatformProxy } from "../platform/index";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";

/** Options for the `getBindingsProxy` utility */
export type GetBindingsProxyOptions = GetPlatformProxyOptions;

/**
 * Result of the `getBindingsProxy` utility
 */
export type BindingsProxy<
	Bindings = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
> = Omit<PlatformProxy<Bindings, CfProperties>, "env"> & {
	/**
	 * Object containing the various proxies
	 */
	bindings: Bindings;
};

/**
 * By reading from a `wrangler.toml` file this function generates proxy binding objects that can be
 * used to simulate the interaction with bindings during local development in a Node.js environment
 *
 * @deprecated use `getPlatformProxy` instead
 *
 * @param options The various options that can tweak this function's behavior
 * @returns An Object containing the generated proxies alongside other related utilities
 */
export async function getBindingsProxy<
	Bindings extends Record<string, unknown> = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
>(
	options: GetBindingsProxyOptions = {}
): Promise<BindingsProxy<Bindings, CfProperties>> {
	const { env, ...restOfPlatformProxy } = await getPlatformProxy<
		Bindings,
		CfProperties
	>(options);

	return {
		bindings: env,
		...restOfPlatformProxy,
	};
}
