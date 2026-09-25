import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { Framework } from "./framework-class";
import { Vite } from "./vite";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";
import type { PackageJSON } from "@cloudflare/workers-utils";

const ENTRYPOINT = "src/index.js";
type NewProjectPackageJson = PackageJSON & { type?: "module" };

/** A new project without application files or framework configuration. */
export class NewProject extends Framework {
	readonly #vite = new Vite({ id: "vite", name: "Vite" });

	override readonly supportsMode = this.#vite.supportsMode;
	override readonly env = this.#vite.env;
	override readonly configurationDescription =
		"Creating a new Worker project with Vite";

	async configure(
		options: ConfigurationOptions
	): Promise<ConfigurationResults> {
		if (!options.dryRun) {
			const packageJsonPath = join(options.projectPath, "package.json");
			const packageJson = JSON.parse(
				readFileSync(packageJsonPath, "utf8")
			) as NewProjectPackageJson;
			writeFileSync(
				packageJsonPath,
				JSON.stringify(
					{
						...packageJson,
						name: options.workerName,
						private: true,
						type: "module",
						scripts: {
							...packageJson.scripts,
							build: "vite build",
							deploy: "cf deploy",
							dev: "vite dev",
						},
					} satisfies NewProjectPackageJson,
					null,
					2
				) + "\n"
			);
			mkdirSync(join(options.projectPath, "src"), { recursive: true });
			writeFileSync(
				join(options.projectPath, ENTRYPOINT),
				`export default {
	async fetch() {
		return new Response("Hello, World!");
	},
};
`
			);
			await installPackages(options.packageManager.type, ["vite@latest"], {
				dev: true,
				isWorkspaceRoot: options.isWorkspaceRoot,
			});
		}

		return {
			...(await this.#vite.configure(options)),
			workerConfig: { entrypoint: `./${ENTRYPOINT}` },
		};
	}
}
