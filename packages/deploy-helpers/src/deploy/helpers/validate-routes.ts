import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "../../shared/context";
import type { AssetsOptions, Route } from "@cloudflare/workers-utils";

export const validateRoutes = (
	routes: Route[],
	assets: AssetsOptions | undefined
) => {
	const invalidRoutes: Record<string, string[]> = {};
	const mountedAssetRoutes: string[] = [];

	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			if (route.pattern.includes("*")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Wildcard operators (*) are not allowed in Custom Domains`
				);
			}
			if (route.pattern.includes("/")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Paths are not allowed in Custom Domains`
				);
			}
		} else if (
			// If we have Assets but we're not always hitting the Worker then validate
			assets?.directory !== undefined &&
			assets.routerConfig.invoke_user_worker_ahead_of_assets !== true
		) {
			const pattern = typeof route === "string" ? route : route.pattern;
			const components = pattern.split("/");

			// If this isn't `domain.com/*` then we're mounting to a path
			if (!(components.length === 2 && components[1] === "*")) {
				mountedAssetRoutes.push(pattern);
			}
		}
	}
	if (Object.keys(invalidRoutes).length > 0) {
		throw new UserError(
			`Invalid Routes:\n` +
				Object.entries(invalidRoutes)
					.map(([route, errors]) => `${route}:\n` + errors.join("\n"))
					.join(`\n\n`),
			{ telemetryMessage: "deploy invalid routes" }
		);
	}

	if (mountedAssetRoutes.length > 0 && assets?.directory !== undefined) {
		const relativeAssetsDir = path.relative(process.cwd(), assets.directory);

		const warnFn = logger.once?.warn ?? logger.warn;
		warnFn(
			`Warning: The following routes will attempt to serve Assets on a configured path:\n${mountedAssetRoutes
				.map((route) => {
					const routeNoScheme = route.replace(/https?:\/\//g, "");
					const assetPath = path.join(
						relativeAssetsDir,
						routeNoScheme.substring(routeNoScheme.indexOf("/"))
					);
					return `  • ${route} (Will match assets: ${assetPath})`;
				})
				.join("\n")}` +
				(assets?.routerConfig.has_user_worker
					? "\n\nRequests not matching an asset will be forwarded to the Worker's code."
					: "")
		);
	}
};
