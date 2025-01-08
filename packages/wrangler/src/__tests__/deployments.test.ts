import fs from "node:fs";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import {
	msw,
	mswListNewDeployments,
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
			mswListNewDeployments,
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
		describe("deployment view", () => {
			it("should error with no flag", async () => {
				writeWranglerConfig();

				await expect(
					runWrangler("deployments view 1701-E")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: \`wrangler deployments view <deployment-id>\` has been renamed \`wrangler versions view [version-id]\`. Please use that command instead.]`
				);
			});
		});
	});
});
