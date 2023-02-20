// import * as fs from "fs";
// import * as TOML from "@iarna/toml";
import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { rest } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { mswSuccessDeployments } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("deployments", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	beforeEach(() => {
		msw.use(
			...mswSuccessDeployments,
			...mswSuccessOauthHandlers,
			...mswSuccessUserHandlers,
			rest.get(
				"*/accounts/:accountId/workers/services/:scriptName",
				(_, response, context) => {
					return response.once(
						context.status(200),
						context.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								default_environment: {
									script: {
										tag: "MOCK-TAG",
									},
								},
							},
						})
					);
				}
			)
		);
	});

	it("should log deployments", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				name: "test-script-name",
				first_party_worker: true,
			}),
			"utf-8"
		);

		await runWrangler("deployments");
		expect(std.out).toMatchInlineSnapshot(`
		"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


		Deployment ID: Constitution-Class
		Created on:    2021-01-01T00:00:00.000000Z
		Author:        Jean-Luc-Picard@federation.org
		Trigger:       Upload from Wrangler 🤠

		Deployment ID: Intrepid-Class
		Created on:    2021-02-02T00:00:00.000000Z
		Author:        Kathryn-Janeway@federation.org
		Trigger:       Rollback from Wrangler 🤠
		Rollback from: MOCK-DEPLOYMENT-ID-1111

		Deployment ID: Intrepid-Class
		Created on:    2021-02-03T00:00:00.000000Z
		Author:        Kathryn-Janeway@federation.org
		Trigger:       Wrangler 🤠

		Deployment ID: Galaxy-Class
		Created on:    2021-01-04T00:00:00.000000Z
		Author:        Jean-Luc-Picard@federation.org
		Trigger:       Rollback from Wrangler 🤠
		Rollback from: MOCK-DEPLOYMENT-ID-2222
		🟩 Active"
	`);
	});

	it("should log deployments for script with passed in name option", async () => {
		await runWrangler("deployments --name something-else");
		expect(std.out).toMatchInlineSnapshot(`
		"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


		Deployment ID: Constitution-Class
		Created on:    2021-01-01T00:00:00.000000Z
		Author:        Jean-Luc-Picard@federation.org
		Trigger:       Upload from Wrangler 🤠

		Deployment ID: Intrepid-Class
		Created on:    2021-02-02T00:00:00.000000Z
		Author:        Kathryn-Janeway@federation.org
		Trigger:       Rollback from Wrangler 🤠
		Rollback from: MOCK-DEPLOYMENT-ID-1111

		Deployment ID: Intrepid-Class
		Created on:    2021-02-03T00:00:00.000000Z
		Author:        Kathryn-Janeway@federation.org
		Trigger:       Wrangler 🤠

		Deployment ID: Galaxy-Class
		Created on:    2021-01-04T00:00:00.000000Z
		Author:        Jean-Luc-Picard@federation.org
		Trigger:       Rollback from Wrangler 🤠
		Rollback from: MOCK-DEPLOYMENT-ID-2222
		🟩 Active"
	`);
	});

	it("should error on missing script name", async () => {
		await expect(runWrangler("deployments")).rejects.toMatchInlineSnapshot(
			`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name\`]`
		);
	});
});
