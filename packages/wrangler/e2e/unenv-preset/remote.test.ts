/**
 * Test building and serving a worker in nodejs_compat mode.
 * This makes sure the prod workerd is is compatible with unenv.
 */

import assert from "node:assert";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import { retry } from "../helpers/retry";
import { getYMDDate, workerScript } from "./helper";
import { TESTS } from "./worker/index";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	`@cloudflare/unenv-preset remote tests`,
	() => {
		let url: string;
		let helper: WranglerE2ETestHelper;

		beforeAll(async () => {
			helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.jsonc": dedent`{
				"name": "${generateResourceName()}",
				"main": "${workerScript}",
				"compatibility_date": "${getYMDDate()}",
				"compatibility_flags": ["nodejs_compat"],
				"vars": {
					"DEBUG": "example"
				}
			}`,
			});

			const { stdout } = await helper.run(`wrangler deploy`);

			const match = stdout.match(
				/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
			);
			assert(match?.groups);
			url = match.groups.url;

			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`${url}/ping`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toEqual("pong");
		}, 30_000);

		afterAll(async () => {
			// clean up user Worker
			await helper.run(`wrangler delete`);
		});

		test.for(Object.keys(TESTS))(
			"%s",
			{ timeout: 20_000 },
			async (testName) => {
				// Retries the callback until it succeeds or times out.
				// Useful for the i.e. DNS tests where underlying requests might error/timeout.
				await vi.waitFor(async () => {
					const response = await fetch(`${url}/${testName}`);
					const body = await response.text();
					expect(body).toMatch("OK!");
				});
			}
		);
	}
);
