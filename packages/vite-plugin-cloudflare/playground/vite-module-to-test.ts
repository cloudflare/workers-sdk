import type {
	createBuilder,
	createServer,
	loadConfigFromFile,
	mergeConfig,
	preview,
	version as ViteVersion,
} from "vite";

/**
 * Returns the correct Vite module to test based on the `VITE_VERSION_TO_TEST` environment variable
 *
 * @returns The vite module to test
 */
export async function getViteModuleToTest(): Promise<{
	packageName: "vite" | "rolldown-vite";
	version: typeof ViteVersion;
	loadConfigFromFile: typeof loadConfigFromFile;
	mergeConfig: typeof mergeConfig;
	createServer: typeof createServer;
	createBuilder: typeof createBuilder;
	preview: typeof preview;
}> {
	if (process.env.VITE_VERSION_TO_TEST === undefined) {
		return {
			packageName: "vite",
			// Note: If VITE_VERSION_TO_TEST is not set we we want to fallback to a generic version of vite
			//       (instead of falling back to one of the options below) because we want to make sure that
			//       the vite version can be correctly overridden in the vite-ecosystem-ci runs
			//       (ref: https://github.com/vitejs/vite-ecosystem-ci/blob/a0fab/tests/vite-plugin-cloudflare.ts)
			...(await import("vite")),
		};
	}

	if (process.env.VITE_VERSION_TO_TEST === "6") {
		return {
			packageName: "vite",
			...(await import("vite-6")),
		} as any;
	}

	if (process.env.VITE_VERSION_TO_TEST === "7") {
		return {
			packageName: "vite",
			...(await import("vite-7")),
		} as any;
	}

	if (process.env.VITE_VERSION_TO_TEST === "rolldown-vite") {
		return {
			packageName: "rolldown-vite",
			...(await import("rolldown-vite")),
		} as any;
	}

	throw new Error(
		`Invalid value provided for "VITE_VERSION_TO_TEST" (${JSON.stringify(process.env.VITE_VERSION_TO_TEST)}). The available options are: "6", "7" and "rolldown-vite"`
	);
}
