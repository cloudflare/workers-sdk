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
import { writeWranglerConfig } from "./helpers/write-wrangler-config";

function isFileNotFound(e: unknown) {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
}

// This is testing the old deployments behaviour, which is now deprecated
// and replaced by the versions one - see the new tests in versions/deployments/...
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

			🚢 List and view the current and past deployments for your Worker

			COMMANDS
			  wrangler deployments list    Displays the 10 most recent deployments of your Worker
			  wrangler deployments status  View the current state of your production

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	describe("deployments subcommands", () => {
		describe("deployments list", () => {
			it("should log deployments", async () => {
				writeWranglerConfig();

				await runWrangler("deployments list --no-x-versions");
				expect(std.out).toMatchInlineSnapshot(`
					"
					Version ID:    Constitution-Class-tag:test-name
					Created on:    2021-01-01T00:00:00.000000Z
					Author:        Jean-Luc-Picard@federation.org
					Source:        Upload from Wrangler 🤠

					Version ID:    Intrepid-Class-tag:test-name
					Created on:    2021-02-02T00:00:00.000000Z
					Author:        Kathryn-Janeway@federation.org
					Source:        Rollback from Wrangler 🤠
					Rollback from: MOCK-DEPLOYMENT-ID-1111
					Message:       Rolled back for this version

					Version ID:    3mEgaU1T-Intrepid-someThing-tag:test-name
					Created on:    2021-02-03T00:00:00.000000Z
					Author:        Kathryn-Janeway@federation.org
					Source:        Wrangler 🤠

					Version ID:    Galaxy-Class-tag:test-name
					Created on:    2021-01-04T00:00:00.000000Z
					Author:        Jean-Luc-Picard@federation.org
					Source:        Rollback from Wrangler 🤠
					Rollback from: MOCK-DEPLOYMENT-ID-2222
					🟩 Active"
				`);
			});

			it("should log deployments for script with passed in name option", async () => {
				await runWrangler(
					"deployments list --name something-else --no-x-versions"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					Version ID:    Constitution-Class-tag:something-else
					Created on:    2021-01-01T00:00:00.000000Z
					Author:        Jean-Luc-Picard@federation.org
					Source:        Upload from Wrangler 🤠

					Version ID:    Intrepid-Class-tag:something-else
					Created on:    2021-02-02T00:00:00.000000Z
					Author:        Kathryn-Janeway@federation.org
					Source:        Rollback from Wrangler 🤠
					Rollback from: MOCK-DEPLOYMENT-ID-1111
					Message:       Rolled back for this version

					Version ID:    3mEgaU1T-Intrepid-someThing-tag:something-else
					Created on:    2021-02-03T00:00:00.000000Z
					Author:        Kathryn-Janeway@federation.org
					Source:        Wrangler 🤠

					Version ID:    Galaxy-Class-tag:something-else
					Created on:    2021-01-04T00:00:00.000000Z
					Author:        Jean-Luc-Picard@federation.org
					Source:        Rollback from Wrangler 🤠
					Rollback from: MOCK-DEPLOYMENT-ID-2222
					🟩 Active"
				`);
			});

			it("should error on missing script name", async () => {
				await expect(
					runWrangler("deployments list --no-x-versions")
				).rejects.toMatchInlineSnapshot(
					`[Error: Required Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`--name\`]`
				);
			});
		});

		describe("deployment view", () => {
			it("should error with no --no-x-versions flag", async () => {
				writeWranglerConfig();

				await expect(
					runWrangler("deployments view 1701-E")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: \`wrangler deployments view <deployment-id>\` has been renamed \`wrangler versions view [version-id]\`. Please use that command instead.]`
				);
			});

			it("should log deployment details", async () => {
				writeWranglerConfig();

				await runWrangler("deployments view 1701-E --no-x-versions");

				expect(std.out).toMatchInlineSnapshot(`
					"
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
					"
				`);
			});

			it("should log deployment details with bindings", async () => {
				writeWranglerConfig();

				await runWrangler("deployments view bindings-tag --no-x-versions");

				expect(std.out).toMatchInlineSnapshot(`
					"
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

					"
				`);
			});

			it("should automatically log latest deployment details", async () => {
				writeWranglerConfig();

				await runWrangler("deployments view --no-x-versions");

				expect(std.out).toMatchInlineSnapshot(`
					"
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
					"
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

				writeWranglerConfig();
				await runWrangler(
					"rollback 3mEgaU1T-Intrepid-someThing-tag:test-name --no-x-versions"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
					Current Version ID: galactic_mission_alpha"
				`);

				expect(requests.count).toEqual(1);
			});

			it("should early exit from rollback if user denies continuing", async () => {
				mockConfirm({
					text: "This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).",
					result: false,
				});

				writeWranglerConfig();
				await runWrangler(
					"rollback 3mEgaU1T-Intrpid-someThing-tag:test-name --no-x-versions"
				);
				expect(std.out).toMatchInlineSnapshot(`""`);

				expect(requests.count).toEqual(0);
			});

			it("should skip prompt automatically in rollback if in a non-TTY environment", async () => {
				setIsTTY(false);

				writeWranglerConfig();
				await runWrangler(
					"rollback 3mEgaU1T-Intrepid-someThing-tag:test-name --no-x-versions"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"? This deployment 3mEgaU1T will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. Note: Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
					🤖 Using fallback value in non-interactive context: yes
					? Please provide a message for this rollback (120 characters max)
					🤖 Using default value in non-interactive context:

					Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
					Current Version ID: galactic_mission_alpha"
				`);

				expect(requests.count).toEqual(1);
			});

			it("should skip prompt automatically in rollback if message flag is provided", async () => {
				writeWranglerConfig();
				await runWrangler(
					`rollback 3mEgaU1T-Intrepid-someThing-tag:test-name --message "test" --no-x-versions`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
					Current Version ID: galactic_mission_alpha"
				`);

				expect(requests.count).toEqual(1);
			});

			it("should skip prompt automatically in rollback with empty message", async () => {
				writeWranglerConfig();
				await runWrangler(
					`rollback 3mEgaU1T-Intrepid-someThing-tag:test-name --message "test" --no-x-versions`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
					Current Version ID: galactic_mission_alpha"
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

				writeWranglerConfig();
				await runWrangler("rollback --no-x-versions");
				expect(std.out).toMatchInlineSnapshot(`
					"
					Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:test-name
					Current Version ID: galactic_mission_alpha"
				`);

				expect(requests.count).toEqual(1);
			});

			it("should require a worker name", async () => {
				await expect(runWrangler("rollback")).rejects.toMatchInlineSnapshot(
					`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
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

				await runWrangler("rollback --name something-else --no-x-versions");
				expect(std.out).toMatchInlineSnapshot(`
					"
					Successfully rolled back to Deployment ID: 3mEgaU1T-Intrepid-someThing-tag:something-else
					Current Version ID: galactic_mission_alpha"
				`);

				expect(requests.count).toEqual(1);
			});
		});
	});
});
