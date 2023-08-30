/** @type {import('@remix-run/dev').AppConfig} */
export default {
	ignoredRouteFiles: ["**/.*"],
	server: "./server.ts",
	serverBuildPath: "functions/[[path]].js",
	serverConditions: ["workerd", "worker", "browser"],
	serverDependenciesToBundle: "all",
	serverMainFields: ["browser", "module", "main"],
	serverMinify: true,
	serverModuleFormat: "esm",
	serverPlatform: "neutral",
	// appDirectory: "app",
	// assetsBuildDirectory: "public/build",
	// publicPath: "/build/",
	future: {
		v2_dev: true,
		v2_errorBoundary: true,
		v2_headers: true,
		v2_meta: true,
		v2_normalizeFormMethod: true,
		v2_routeConvention: true,
	},
};
