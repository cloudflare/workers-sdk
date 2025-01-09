import fs from "node:fs";
import path from "node:path";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runWranglerDev } from "../../../fixtures/shared/src/run-wrangler-long-lived";
import { TESTS } from "./worker/index";

// Root of the current package
const pkgDir = path.resolve(fileURLToPath(import.meta.url), "../..");
// workerd binary
const localWorkerdPath = path.join(pkgDir, "node_modules/.bin/workerd");
// Base path for resolving `@cloudflare/unenv-preset` files
const localPresetResolveBaseDir = path.join(pkgDir, "package.json");
// Base path for resolving `unjs/unenv` files
const localUnenvResolveBaseDir = path.join(
	pkgDir,
	"node_modules/unenv/package.json"
);

// `runWranglerDev` + `MINIFLARE_WORKERD_PATH` is not supported on Windows
// See https://github.com/nodejs/node/issues/52554
describe.skipIf(platform === "win32")(
	`@cloudflare/unenv-preset ${platform} ${localWorkerdPath} ${fs.existsSync(localWorkerdPath)}`,
	() => {
		let wrangler: Awaited<ReturnType<typeof runWranglerDev>> | undefined;

		beforeAll(async () => {
			// Use workerd binary install in `@cloudflare/unenv-preset`
			// rather than the one bundled with wrangler.
			const MINIFLARE_WORKERD_PATH = localWorkerdPath;

			// Use the preset from the local `@cloudflare/unenv-preset` and `unjs/unenv`
			// rather than the one bundled with wrangler.
			const WRANGLER_UNENV_RESOLVE_PATHS = [
				localPresetResolveBaseDir,
				localUnenvResolveBaseDir,
			].join(",");

			wrangler = await runWranglerDev(
				path.join(__dirname, "worker"),
				["--port=0", "--inspector-port=0"],
				{
					MINIFLARE_WORKERD_PATH,
					WRANGLER_UNENV_RESOLVE_PATHS,
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
	}
);
