import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { dedent } from "../../utils/dedent";
import { installPackages } from "../c3-vendor/packages";
import { Framework } from ".";
import type { ConfigurationOptions } from ".";
import type { RawConfig } from "@cloudflare/workers-utils";

export class Angular extends Framework {
	name = "angular";

	async configure({
		workerName,
		outputDir,
		dryRun,
	}: ConfigurationOptions): Promise<RawConfig> {
		if (!dryRun) {
			await updateAngularJson(workerName);
			await overrideServerFile();
			await installAdditionalDependencies();
		}
		return {
			main: "./dist/server/server.mjs",
			assets: {
				binding: "ASSETS",
				directory: `${outputDir}browser`,
			},
		};
	}
}

async function updateAngularJson(projectName: string) {
	const s = spinner();
	s.start(`Updating angular.json config`);
	const angularJson = JSON.parse(
		await readFile(resolve("angular.json"), "utf8")
	) as AngularJson;

	// Update builder
	const architectSection = angularJson.projects[projectName].architect;
	architectSection.build.options.outputPath = "dist";
	architectSection.build.options.outputMode = "server";
	architectSection.build.options.ssr.experimentalPlatform = "neutral";

	await writeFile(
		resolve("angular.json"),
		JSON.stringify(angularJson, null, 2)
	);

	s.stop(`${brandColor(`updated`)} ${dim(`\`angular.json\``)}`);
}

async function overrideServerFile() {
	await writeFile(
		resolve("src/server.ts"),
		dedent`
		import { AngularAppEngine, createRequestHandler } from '@angular/ssr';

		const angularApp = new AngularAppEngine();

		/**
		 * This is a request handler used by the Angular CLI (dev-server and during build).
		 */
		export const reqHandler = createRequestHandler(async (req) => {
			const res = await angularApp.handle(req);

			return res ?? new Response('Page not found.', { status: 404 });
		});

		export default { fetch: reqHandler };
		`
	);
}

async function installAdditionalDependencies() {
	await installPackages(["xhr2"], {
		dev: true,
		startText: "Installing additional dependencies",
		doneText: `${brandColor("installed")}`,
	});
}

type AngularJson = {
	projects: Record<
		string,
		{
			architect: {
				build: {
					options: {
						outputPath: string;
						outputMode: string;
						ssr: Record<string, unknown>;
						assets: string[];
					};
				};
			};
		}
	>;
};
