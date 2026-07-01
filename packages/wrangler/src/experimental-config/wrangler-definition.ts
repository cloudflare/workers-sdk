import type { WranglerConfig } from "./types";
import type { ConfigContext } from "@cloudflare/config/public";

export type WranglerConfigExport =
	| WranglerConfig
	| Promise<WranglerConfig>
	| ((ctx: ConfigContext) => WranglerConfig | Promise<WranglerConfig>);

export function defineWranglerConfig(
	config: WranglerConfigExport
): WranglerConfigExport {
	return config;
}

export async function resolveWranglerConfig(
	def: unknown,
	ctx: ConfigContext
): Promise<unknown> {
	let raw = def;
	if (typeof raw === "function") {
		raw = (raw as (ctx: ConfigContext) => unknown)(ctx);
	}
	return await raw;
}
