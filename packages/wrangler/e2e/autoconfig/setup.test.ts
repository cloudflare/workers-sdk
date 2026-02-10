import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";

describe("wrangler setup", () => {
	describe("run on a hono project", () => {
		test("detects when a hono app is already configured for Cloudflare", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed(resolve(__dirname, "./fixtures/hono-cf-workers-app"));

			const { status, stdout } = await helper.run("wrangler setup --yes");

			expect(stdout).toContain(
				"🎉 Your project is already setup to deploy to Cloudflare"
			);
			expect(status).toBe(0);
		});

		test("errors for a hono app that is not configured for Cloudflare, mentioning that auto-configuring it is not supported", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed(resolve(__dirname, "./fixtures/hono-nodejs-app"));

			const { status, stderr } = await helper.run("wrangler setup --yes");

			expect(stderr).toContain(
				'[41;31m[[41;97mERROR[41;31m][0m [1mThe detected framework ("Hono") cannot be automatically configured.[0m'
			);
			expect(status).not.toBe(0);
		});
	});
});
