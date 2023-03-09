import { rest } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
	mswSuccessDeploymentDetails,
	mswSuccessDeploymentScriptMetadata,
	createFetchResult,
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

	it("should log a help message for deployments command", async () => {
		await runWrangler("deployments --help");
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler deployments

		🚢 Displays the 10 most recent deployments for a worker

		Commands:
		  wrangler deployments rollback [deployment-id]  🔙 Rollback a deployment
		  wrangler deployments view <deployment-id>      🔍 View a deployment

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		Options:
		      --name  The name of your worker  [string]

		🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
	`);
	});

	it("should log deployments", async () => {
		writeWranglerToml();

		await runWrangler("deployments");
		expect(std.out).toMatchInlineSnapshot(`
		"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


		Deployment ID:   Constitution-Class
		Created on:      2021-01-01T00:00:00.000000Z
		Author:          Jean-Luc-Picard@federation.org
		Source:          Upload from Wrangler 🤠

		Deployment ID:   Intrepid-Class
		Created on:      2021-02-02T00:00:00.000000Z
		Author:          Kathryn-Janeway@federation.org
		Source:          Rollback from Wrangler 🤠
		Rollback from:   MOCK-DEPLOYMENT-ID-1111

		Deployment ID:   3mEgaU1T-Intrepid-someThing
		Created on:      2021-02-03T00:00:00.000000Z
		Author:          Kathryn-Janeway@federation.org
		Source:          Wrangler 🤠

		Deployment ID:   Galaxy-Class
		Created on:      2021-01-04T00:00:00.000000Z
		Author:          Jean-Luc-Picard@federation.org
		Source:          Rollback from Wrangler 🤠
		Rollback from:   MOCK-DEPLOYMENT-ID-2222
		🟩 Active"
	`);
	});

	it("should log deployments for script with passed in name option", async () => {
		await runWrangler("deployments --name something-else");
		expect(std.out).toMatchInlineSnapshot(`
		"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


		Deployment ID:   Constitution-Class
		Created on:      2021-01-01T00:00:00.000000Z
		Author:          Jean-Luc-Picard@federation.org
		Source:          Upload from Wrangler 🤠

		Deployment ID:   Intrepid-Class
		Created on:      2021-02-02T00:00:00.000000Z
		Author:          Kathryn-Janeway@federation.org
		Source:          Rollback from Wrangler 🤠
		Rollback from:   MOCK-DEPLOYMENT-ID-1111

		Deployment ID:   3mEgaU1T-Intrepid-someThing
		Created on:      2021-02-03T00:00:00.000000Z
		Author:          Kathryn-Janeway@federation.org
		Source:          Wrangler 🤠

		Deployment ID:   Galaxy-Class
		Created on:      2021-01-04T00:00:00.000000Z
		Author:          Jean-Luc-Picard@federation.org
		Source:          Rollback from Wrangler 🤠
		Rollback from:   MOCK-DEPLOYMENT-ID-2222
		🟩 Active"
	`);
	});

	it("should error on missing script name", async () => {
		await expect(runWrangler("deployments")).rejects.toMatchInlineSnapshot(
			`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name\`]`
		);
	});

	describe("deployments subcommands", () => {
		describe("deployment view", () => {
			it("should log deployment details", async () => {
				writeWranglerToml();

				await runWrangler("deployments view 1701-E");

				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID:   undefined
			Created on:      2021-01-01T00:00:00.000000Z
			Author:          Jean-Luc-Picard@federation.org
			Source:          Wrangler 🤠
			------------------------------------------------------------
			Author ID:          Picard-Gamma-6-0-7-3
			Usage Model:        bundled
			Handlers:           fetch
			--------------------------bindings--------------------------
			None
			"
		`);
			});
			it("should log deployment script", async () => {
				writeWranglerToml();

				await runWrangler("deployments view 1701-E --content");

				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


						export default {
							async fetch(request) {
								return new Response('Hello World from Deployment 1701-E');
							},
						};"
		`);
			});

			it("should log deployment details with bindings", async () => {
				writeWranglerToml();

				await runWrangler("deployments view bindings-tag");

				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID:   undefined
			Created on:      2021-01-01T00:00:00.000000Z
			Author:          Jean-Luc-Picard@federation.org
			Source:          Wrangler 🤠
			------------------------------------------------------------
			Author ID:          Picard-Gamma-6-0-7-3
			Usage Model:        bundled
			Handlers:           fetch
			--------------------------bindings--------------------------
			[[r2_buckets]]
			binding = \\"MY_BUCKET\\"
			bucket_name = \\"testr2\\"

			"
		`);
			});
		});

		describe("deployments rollback", () => {
			const { setIsTTY } = useMockIsTTY();
			const requests = { count: 0 };
			beforeEach(() => {
				setIsTTY(true);
				requests.count = 0;
				msw.use(
					rest.put(
						"*/accounts/:accountID/workers/scripts/:scriptName",
						(req, res, ctx) => {
							expect(req.url.searchParams.get("rollback_to")).toBe(
								"3mEgaU1T-Intrepid-someThing"
							);

							requests.count++;

							return res.once(
								ctx.json(
									createFetchResult({
										created_on: "2222-11-18T16:40:48.50545Z",
										modified_on: "2222-01-20T18:08:47.464024Z",
										id: "space_craft_1",
										tag: "alien_tech_001",
										tags: ["hyperdrive", "laser_cannons", "shields"],
										deployment_id: "galactic_mission_alpha",
										logpush: true,
										etag: "13a3240e8fb414561b0366813b0b8f42b3e6cfa0d9e70e99835dae83d0d8a794",
										handlers: [
											"interstellar_communication",
											"hyperspace_navigation",
										],
										last_deployed_from: "spaceport_alpha",
										usage_model: "intergalactic",
										script: `addEventListener('interstellar_communication', event =\u003e
							{ event.respondWith(transmit(event.request)) }
							)`,
										size: "1 light-year",
									})
								)
							);
						}
					)
				);
			});

			it("should successfully rollback and output a success message", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, R2, KV, etc.).",
					result: true,
				});

				mockPrompt({
					text: "Please provide a reason for this rollback (280 characters max)",
					result: "",
				});

				await runWrangler("deployments rollback 3mEgaU1T-Intrepid-someThing");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing
			Current Deployment ID: galactic_mission_alpha"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should early exit from rollback if user denies continuing", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, R2, KV, etc.).",
					result: false,
				});

				mockPrompt({
					text: "Please provide a reason for this rollback (280 characters max)",
					result: "",
				});

				await runWrangler("deployments rollback 3mEgaU1T-Intrpid-someThing");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			"
		`);

				expect(requests.count).toEqual(0);
			});

			it("should skip prompt automatically in rollback if in a non-TTY environment", async () => {
				setIsTTY(false);

				await runWrangler("deployments rollback 3mEgaU1T-Intrepid-someThing");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose

			? This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, R2, KV, etc.).
			🤖 Using default value in non-interactive context: yes
			? Please provide a reason for this rollback (280 characters max)
			🤖 Using default value in non-interactive context:

			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing
			Current Deployment ID: galactic_mission_alpha"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should automatically rollback to previous deployment when id is not specified", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, R2, KV, etc.).",
					result: true,
				});

				mockPrompt({
					text: "Please provide a reason for this rollback (280 characters max)",
					result: "",
				});

				await runWrangler("deployments rollback");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing
			Current Deployment ID: galactic_mission_alpha"
		`);

				expect(requests.count).toEqual(1);
			});
		});
	});
});
