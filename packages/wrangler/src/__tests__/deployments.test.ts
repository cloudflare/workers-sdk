import fs from "node:fs";
import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	createFetchResult,
	msw,
	mswSuccessDeploymentDetails,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptMetadata,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

function isFileNotFound(e: unknown) {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
}

describe("deployments", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	runInTempDir();
	afterAll(() => {
		clearDialogs();
	});

	beforeEach(() => {
		msw.use(
			...mswSuccessDeployments,
			...mswSuccessOauthHandlers,
			...mswSuccessUserHandlers,
			...mswSuccessDeploymentScriptMetadata,
			...mswSuccessDeploymentDetails
		);
	});
	afterEach(() => {
		try {
			fs.unlinkSync("wrangler.toml");
		} catch (e) {
			if (!isFileNotFound(e)) {
				throw e;
			}
		}
	});

	it("should log a help message for deployments command", async () => {
		await runWrangler("deployments --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler deployments

			🚢 List and view the current and past deployments for your Worker [open beta]

			COMMANDS
			  wrangler deployments list                  Displays the 10 most recent deployments for a Worker
			  wrangler deployments view [deployment-id]  View a deployment

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			OPTIONS
			      --name  The name of your Worker  [string]

			🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	describe("deployments subcommands", () => {
		describe("deployments list", () => {
			it("should log deployments", async () => {
				writeWranglerToml();

				await runWrangler("deployments list");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID: Constitution-Class-tag:test-name
			Version ID:    Constitution-Class-tag:test-name
			Created on:    2021-01-01T00:00:00.000000Z
			Author:        Jean-Luc-Picard@federation.org
			Source:        Upload from Wrangler 🤠

			Deployment ID: Intrepid-Class-tag:test-name
			Version ID:    Intrepid-Class-tag:test-name
			Created on:    2021-02-02T00:00:00.000000Z
			Author:        Kathryn-Janeway@federation.org
			Source:        Rollback from Wrangler 🤠
			Rollback from: MOCK-DEPLOYMENT-ID-1111
			Message:       Rolled back for this version

			Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
			Version ID:    3mEgaU1T-Intrepid-someThing-tag:test-name
			Created on:    2021-02-03T00:00:00.000000Z
			Author:        Kathryn-Janeway@federation.org
			Source:        Wrangler 🤠

			Deployment ID: Galaxy-Class-tag:test-name
			Version ID:    Galaxy-Class-tag:test-name
			Created on:    2021-01-04T00:00:00.000000Z
			Author:        Jean-Luc-Picard@federation.org
			Source:        Rollback from Wrangler 🤠
			Rollback from: MOCK-DEPLOYMENT-ID-2222
			🟩 Active


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
			});

			it("should log deployments for script with passed in name option", async () => {
				await runWrangler("deployments list --name something-else");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID: Constitution-Class-tag:something-else
			Version ID:    Constitution-Class-tag:something-else
			Created on:    2021-01-01T00:00:00.000000Z
			Author:        Jean-Luc-Picard@federation.org
			Source:        Upload from Wrangler 🤠

			Deployment ID: Intrepid-Class-tag:something-else
			Version ID:    Intrepid-Class-tag:something-else
			Created on:    2021-02-02T00:00:00.000000Z
			Author:        Kathryn-Janeway@federation.org
			Source:        Rollback from Wrangler 🤠
			Rollback from: MOCK-DEPLOYMENT-ID-1111
			Message:       Rolled back for this version

			Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:something-else
			Version ID:    3mEgaU1T-Intrepid-someThing-tag:something-else
			Created on:    2021-02-03T00:00:00.000000Z
			Author:        Kathryn-Janeway@federation.org
			Source:        Wrangler 🤠

			Deployment ID: Galaxy-Class-tag:something-else
			Version ID:    Galaxy-Class-tag:something-else
			Created on:    2021-01-04T00:00:00.000000Z
			Author:        Jean-Luc-Picard@federation.org
			Source:        Rollback from Wrangler 🤠
			Rollback from: MOCK-DEPLOYMENT-ID-2222
			🟩 Active


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
			});

			it("should error on missing script name", async () => {
				await expect(
					runWrangler("deployments list")
				).rejects.toMatchInlineSnapshot(
					`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name\`]`
				);
			});
		});
		describe("deployment view", () => {
			it("should log deployment details", async () => {
				writeWranglerToml();

				await runWrangler("deployments view 1701-E");

				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID:       1701-E
			Version ID:          1701-E
			Created on:          2021-01-01T00:00:00.000000Z
			Author:              Jean-Luc-Picard@federation.org
			Source:              Wrangler 🤠
			------------------------------------------------------------
			Author ID:           Picard-Gamma-6-0-7-3
			Usage Model:         bundled
			Handlers:            fetch
			--------------------------bindings--------------------------
			None



			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
			});

			it("should log deployment details with bindings", async () => {
				writeWranglerToml();

				await runWrangler("deployments view bindings-tag");

				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID:       1701-E
			Version ID:          1701-E
			Created on:          2021-01-01T00:00:00.000000Z
			Author:              Jean-Luc-Picard@federation.org
			Source:              Wrangler 🤠
			------------------------------------------------------------
			Author ID:           Picard-Gamma-6-0-7-3
			Usage Model:         bundled
			Handlers:            fetch
			--------------------------bindings--------------------------
			[[r2_buckets]]
			binding = \\"MY_BUCKET\\"
			bucket_name = \\"testr2\\"




			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
			});
			it("should automatically log latest deployment details", async () => {
				writeWranglerToml();

				await runWrangler("deployments view");

				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Deployment ID:       1701-E
			Version ID:          1701-E
			Created on:          2021-01-01T00:00:00.000000Z
			Author:              Jean-Luc-Picard@federation.org
			Source:              Wrangler 🤠
			------------------------------------------------------------
			Author ID:           Picard-Gamma-6-0-7-3
			Usage Model:         bundled
			Handlers:            fetch
			--------------------------bindings--------------------------
			None



			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
			});
		});

		describe("rollback", () => {
			const { setIsTTY } = useMockIsTTY();
			const requests = { count: 0 };
			beforeEach(() => {
				setIsTTY(true);
				requests.count = 0;
				msw.use(
					http.put(
						"*/accounts/:accountID/workers/scripts/:scriptName",
						({ request }) => {
							const url = new URL(request.url);

							expect(url.searchParams.get("rollback_to")).toMatch(
								/^3mEgaU1T-Intrepid-someThing-tag:/
							);

							requests.count++;

							return HttpResponse.json(
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
							);
						},
						{ once: true }
					)
				);
			});

			it("should successfully rollback and output a success message", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).",
					result: true,
				});

				mockPrompt({
					text: "Please provide a message for this rollback (120 characters max)",
					result: "",
				});

				writeWranglerToml();
				await runWrangler("rollback 3mEgaU1T-Intrepid-someThing-tag:test-name");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
			Current Deployment ID: galactic_mission_alpha
			Current Version ID: galactic_mission_alpha


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should early exit from rollback if user denies continuing", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).",
					result: false,
				});

				writeWranglerToml();
				await runWrangler("rollback 3mEgaU1T-Intrpid-someThing-tag:test-name");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			"
		`);

				expect(requests.count).toEqual(0);
			});

			it("should skip prompt automatically in rollback if in a non-TTY environment", async () => {
				setIsTTY(false);

				writeWranglerToml();
				await runWrangler("rollback 3mEgaU1T-Intrepid-someThing-tag:test-name");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose

			? This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
			🤖 Using fallback value in non-interactive context: yes
			? Please provide a message for this rollback (120 characters max)
			🤖 Using default value in non-interactive context:

			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
			Current Deployment ID: galactic_mission_alpha
			Current Version ID: galactic_mission_alpha


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should skip prompt automatically in rollback if message flag is provided", async () => {
				writeWranglerToml();
				await runWrangler(
					`rollback 3mEgaU1T-Intrepid-someThing-tag:test-name --message "test"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
			Current Deployment ID: galactic_mission_alpha
			Current Version ID: galactic_mission_alpha


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should skip prompt automatically in rollback with empty message", async () => {
				writeWranglerToml();
				await runWrangler(
					`rollback 3mEgaU1T-Intrepid-someThing-tag:test-name --message "test"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
			Current Deployment ID: galactic_mission_alpha
			Current Version ID: galactic_mission_alpha


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should automatically rollback to previous deployment when id is not specified", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).",
					result: true,
				});

				mockPrompt({
					text: "Please provide a message for this rollback (120 characters max)",
					result: "",
				});

				writeWranglerToml();
				await runWrangler("rollback");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
			Current Deployment ID: galactic_mission_alpha
			Current Version ID: galactic_mission_alpha


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);

				expect(requests.count).toEqual(1);
			});

			it("should require a worker name", async () => {
				await expect(runWrangler("rollback")).rejects.toMatchInlineSnapshot(
					`[Error: Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`--name\`]`
				);

				expect(requests.count).toEqual(0);
			});

			it("should automatically rollback to previous deployment with specified name", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).",
					result: true,
				});

				mockPrompt({
					text: "Please provide a message for this rollback (120 characters max)",
					result: "",
				});

				await runWrangler("rollback --name something-else");
				expect(std.out).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:something-else
			Current Deployment ID: galactic_mission_alpha
			Current Version ID: galactic_mission_alpha


			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);

				expect(requests.count).toEqual(1);
			});
		});
	});
});
