import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli-shared-helpers";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { readJSON, removeFile, writeJSON } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context, PackageJson } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// We use the upstream `create-react-router` default template and overlay
	// our Cloudflare-specific files via `copyFiles`. This avoids depending on
	// a third-party Cloudflare template that has been deleted upstream in the past.
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		// to prevent asking about git twice, just let c3 do it
		"--no-git-init",
		"--no-install",
	]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	// `npmInstall` has already run by this point with the upstream default
	// template's `package.json`, which doesn't include `@cloudflare/vite-plugin`.
	// Our overlaid `vite.config.ts` imports it, so install it now (this also
	// adds it to `package.json`). `wrangler` is installed separately by
	// `installWrangler()` in the main configure flow before this runs.
	await installPackages(["@cloudflare/vite-plugin"], {
		dev: true,
		startText: "Installing the Cloudflare Vite plugin",
		doneText: `${brandColor("installed")} ${dim("@cloudflare/vite-plugin")}`,
	});

	// The upstream default template targets a generic Node.js/Docker deployment.
	// Remove artifacts that don't apply to a Cloudflare Workers project.
	const s = spinner();
	s.start("Removing non-Cloudflare artifacts from template");
	removeFile(resolve(ctx.project.path, "Dockerfile"));
	removeFile(resolve(ctx.project.path, ".dockerignore"));

	// `transformPackageJson` is deep-merge only and cannot remove keys, so strip
	// the Node-server deps and `start` script that the default template ships.
	const pkgJsonPath = resolve(ctx.project.path, "package.json");
	const pkgJson = readJSON(pkgJsonPath) as PackageJson;
	delete pkgJson.dependencies?.["@react-router/node"];
	delete pkgJson.dependencies?.["@react-router/serve"];
	delete pkgJson.scripts?.start;
	writeJSON(pkgJsonPath, pkgJson);
	s.stop(`${brandColor("removed")} ${dim("Node-server template artifacts")}`);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "react-router",
	platform: "workers",
	frameworkCli: "create-react-router",
	displayName: "React Router (formerly Remix)",
	copyFiles: {
		path: "./ts",
	},
	generate,
	configure,
	transformPackageJson: async () => ({
		dependencies: {
			"react-router": "^7.10.0",
		},
		devDependencies: {
			"@react-router/dev": "^7.10.0",
		},
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && vite preview`,
			"cf-typegen": `wrangler types`,
			typecheck: `wrangler types && react-router typegen && tsc -b`,
			postinstall: `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
