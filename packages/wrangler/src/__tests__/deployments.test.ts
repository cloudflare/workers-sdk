import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
	mswSuccessDeploymentDetails,
	mswSuccessDeploymentScriptMetadata,
} from "./helpers/msw";
import { mswSuccessDeployments } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

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
			...mswSuccessDeploymentScriptMetadata,
			...mswSuccessDeploymentDetails
		);
	});

	it("should log helper message for deployments command", async () => {
		await runWrangler("deployments --help");
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler deployments [deployment-id]

		🚢 Displays the 10 most recent deployments for a worker

		Positionals:
		  deployment-id  The ID of the deployment you want to inspect  [string]

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -e, --env      Environment to use for operations and .env files  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]

		Options:
		      --name  The name of your worker  [string]

		🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
	`);
	});

	it("should log deployments", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				name: "test-script-name",
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

	describe("deployment details", () => {
		it("should log deployment details", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"./wrangler.toml",
				TOML.stringify({
					compatibility_date: "2022-01-12",
					name: "test-script-name",
				}),
				"utf-8"
			);

			await runWrangler("deployments 1701-E");

			expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose

			{
			  Tag: '',
			  Number: 0,
			  'Metadata.author_id': 'Picard-Gamma-6-0-7-3',
			  'Metadata.author_email': 'Jean-Luc-Picard@federation.org',
			  'Metadata.source': 'wrangler',
			  'Metadata.created_on': '2021-01-01T00:00:00.000000Z',
			  'Metadata.modified_on': '2021-01-01T00:00:00.000000Z',
			  'resources.script': {
			    etag: 'mock-e-tag',
			    handlers: [ 'fetch' ],
			    last_deployed_from: 'wrangler'
			  },
			  'resources.bindings': []
			}

						export default {
							async fetch(request) {
								return new Response('Hello World from Deployment 1701-E');
							},
						};"
		`);
		});
	});
});
