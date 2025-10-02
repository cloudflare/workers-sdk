import { createRequire } from "node:module";

export function assertWranglerVersion() {
	const require = createRequire(import.meta.url);
	const installedVersion = require("wrangler/package.json").version as string;
	const dependencyVersion = require("@cloudflare/vite-plugin/package.json")
		.dependencies["wrangler"] as string;

	if (
		// If running in the monorepo, the version is a workspace reference, so skip the check.
		dependencyVersion !== "workspace:*" &&
		dependencyVersion !== installedVersion
	) {
		throw new Error(
			`The installed version of Wrangler (${installedVersion}) doesn't match the version that @cloudflare/vite-plugin requires (${dependencyVersion}).\n` +
				`This can happen if your package manager has merged version of Wrangler in your project with the one that @cloudflare/vite-plugin depends upon.\n` +
				`To fix this, ensure that the version of Wrangler installed in your project matches the version that @cloudflare/vite-plugin requires.`
		);
	}
}
