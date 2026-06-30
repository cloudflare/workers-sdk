import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli-shared-helpers";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { removeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// We use the default `create-waku` template and overlay our Cloudflare-specific
	// files via `copyFiles`. This avoids depending on an external example repository
	// for the scaffolded project content (which could be renamed, moved, or deleted).
	await runFrameworkGenerator(ctx, [
		"--project-name",
		ctx.project.name,
		// c3 installs dependencies itself once the template files have been copied over
		"--skip-install",
	]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	// `npmInstall` has already run with the default Waku template's `package.json`,
	// which doesn't include the Cloudflare build dependencies that our overlaid
	// `waku.config.ts` and Workers setup need. Install them now (this also adds them
	// to `package.json`). `wrangler` is installed separately by `installWrangler()`
	// in the main configure flow before this runs.
	await installPackages(
		["@cloudflare/vite-plugin", "miniflare", "@types/node"],
		{
			dev: true,
			startText: "Installing Cloudflare build dependencies",
			doneText: `${brandColor("installed")} ${dim(
				"@cloudflare/vite-plugin, miniflare, @types/node"
			)}`,
		}
	);

	// The default Waku template ships a Hono trailing-slash dev middleware. On
	// Cloudflare this is handled by `html_handling: "drop-trailing-slash"` in
	// `wrangler.jsonc` (and `public/_headers`), so remove the redundant middleware.
	const s = spinner();
	s.start("Removing non-Cloudflare artifacts from template");
	removeFile(resolve(ctx.project.path, "src/middleware/no-trailing-slash.ts"));
	s.stop(`${brandColor("removed")} ${dim("trailing-slash dev middleware")}`);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "waku",
	frameworkCli: "create-waku",
	platform: "workers",
	displayName: "Waku",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/waku",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `NODE_ENV=production ${npm} run build && wrangler dev`,
			start: `wrangler dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
