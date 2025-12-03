import { readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import type { PackageJSON } from "@cloudflare/workers-utils";

describe("wrangler setup", () => {
	describe("run on a vite react SPA project", () => {
		test.each(["ts", "js"] as const)(
			"installs and adds to the vite config the Cloudflare vite plugin (with a .%s config)",
			async (tsOrJs) => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed(resolve(__dirname, "./fixtures/vite-react-spa"));
				const viteConfigTsPath = `${helper.tmpPath}/vite.config.ts`;
				const viteConfigJsPath = `${helper.tmpPath}/vite.config.js`;

				if (tsOrJs === "js") {
					await rename(viteConfigTsPath, viteConfigJsPath);
				}

				const viteConfigPath =
					tsOrJs === "ts" ? viteConfigTsPath : viteConfigJsPath;

				const prePackageJson = JSON.parse(
					await readFile(`${helper.tmpPath}/package.json`, "utf8")
				) as PackageJSON;

				expect(
					prePackageJson.devDependencies?.["@cloudflare/vite-plugin"]
				).toBeUndefined();

				const preViteConfig = await readFile(viteConfigPath, "utf8");

				expect(preViteConfig).not.toContain(
					'import { cloudflare } from "@cloudflare/vite-plugin"'
				);
				expect(preViteConfig).not.toMatch(/plugins:\s*?\[.*?cloudflare.*?]/);

				await helper.run("wrangler setup");

				const postPackageJson = JSON.parse(
					await readFile(`${helper.tmpPath}/package.json`, "utf8")
				) as PackageJSON;

				expect(
					postPackageJson.devDependencies?.["@cloudflare/vite-plugin"]
				).not.toBeUndefined();

				const postViteConfig = await readFile(viteConfigPath, "utf8");

				expect(postViteConfig).toContain(
					'import { cloudflare } from "@cloudflare/vite-plugin"'
				);
				expect(postViteConfig).toMatch(/plugins:\s*?\[.*?cloudflare.*?]/);
			}
		);

		test("doesn't run any autoconfig logic if the Cloudflare vite plugin is already in use", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed(resolve(__dirname, "./fixtures/vite-react-spa"));

			const viteConfigPath = `${helper.tmpPath}/vite.config.ts`;

			await rm(viteConfigPath);

			await rename(
				`${helper.tmpPath}/__alternative-vite-configs/with-cloudflare-plugin.ts`,
				viteConfigPath
			);

			const { stdout } = await helper.run("wrangler setup");

			expect(
				stdout.replace(/ ⛅️ wrangler \d+\.\d+\.\d+/, "⛅️ wrangler x.x.x")
			).toMatchInlineSnapshot(`
				"
				⛅️ wrangler x.x.x
				───────────────────
				🎉 Your project is already setup to deploy to Cloudflare
				You can now deploy with pnpm run deploy
				"
			`);
		});
	});
});
