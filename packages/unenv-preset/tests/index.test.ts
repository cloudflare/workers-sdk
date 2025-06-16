import path from "node:path";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import workerdPath from "workerd";
import { runWranglerDev } from "../../../fixtures/shared/src/run-wrangler-long-lived";
import { TESTS } from "./worker/index";

// Root of the current package
const pkgDir = path.resolve(fileURLToPath(import.meta.url), "../..");
// Base path for resolving `@cloudflare/unenv-preset` files
const localPresetResolveBaseDir = path.join(pkgDir, "package.json");
// Base path for resolving `unjs/unenv` files
const localUnenvResolveBaseDir = path.join(
	pkgDir,
	"node_modules/unenv/package.json"
);

describe(`@cloudflare/unenv-preset ${platform} ${workerdPath}`, () => {
	let wrangler: Awaited<ReturnType<typeof runWranglerDev>> | undefined;

	beforeAll(async () => {
		// Use workerd binary install in `@cloudflare/unenv-preset`
		// rather than the one bundled with wrangler.
		const MINIFLARE_WORKERD_PATH = workerdPath;

		wrangler = await runWranglerDev(
			path.join(__dirname, "worker"),
			["--port=0", "--inspector-port=0"],
			{
				MINIFLARE_WORKERD_PATH,
			}
		);
	});

	afterAll(async () => {
		await wrangler?.stop();
		wrangler = undefined;
	});

	test.for(Object.keys(TESTS))("%s", async (testName) => {
		expect(wrangler).toBeDefined();
		const { ip, port } = wrangler!;
		const response = await fetch(`http://${ip}:${port}/${testName}`);
		const body = await response.text();
		expect(body).toMatch("OK!");
	});
});
