import { writeFileSync } from "fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { getPackageManager } from "../../package-manager";
import { runCommand } from "../c3-vendor/command";
import { Framework } from ".";
import type { RawConfig } from "@cloudflare/workers-utils";

export class Astro extends Framework {
	name = "astro";
	async configure(outputDir: string): Promise<RawConfig> {
		const { npx } = await getPackageManager();
		await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
			silent: true,
			startText: "Installing adapter",
			doneText: `${brandColor("installed")} ${dim(
				`via \`${npx} astro add cloudflare\``
			)}`,
		});
		await writeFileSync("public/.assetsignore", "_worker.js\n_routes.json");
		return {
			main: `${outputDir}/_worker.js/index.js`,
			compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
			assets: {
				binding: "ASSETS",
				directory: outputDir,
			},
			observability: {
				enabled: true,
			},
		};
	}
}
