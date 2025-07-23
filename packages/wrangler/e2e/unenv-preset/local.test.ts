/**
 * Test building and serving locally a worker in nodejs_compat mode.
 */

import path from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { formatCompatibilityDate } from "../../src/utils/compatibility-date";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import { TESTS } from "./worker/index";
import type { WranglerLongLivedCommand } from "../helpers/wrangler";

describe(`@cloudflare/unenv-preset local tests`, () => {
	let url: string;
	let wrangler: WranglerLongLivedCommand;

	beforeAll(async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.jsonc": JSON.stringify({
				name: generateResourceName(),
				main: path.join(__dirname, "/worker/index.ts"),
				compatibility_date: formatCompatibilityDate(new Date()),
				compatibility_flags: ["nodejs_compat"],
				vars: {
					DEBUG: "example",
				},
			}),
		});

		wrangler = helper.runLongLived(`wrangler dev`, {
			stopOnTestFinished: false,
		});
		url = (await wrangler.waitForReady()).url;
	});

	afterAll(async () => {
		await wrangler.stop();
	});

	test.for(Object.keys(TESTS))("%s", { timeout: 20_000 }, async (testName) => {
		// Retries the callback until it succeeds or times out.
		// Useful for the i.e. DNS tests where underlying requests might error/timeout.
		await vi.waitFor(async () => {
			const response = await fetch(`${url}/${testName}`);
			const body = await response.text();
			expect(body).toMatch("OK!");
		});
	});
});
