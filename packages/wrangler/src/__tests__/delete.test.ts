import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

describe("delete", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	afterEach(() => {
		unsetAllMocks();
	});

	const std = mockConsoleMethods();

	it("should delete an entire service by name", async () => {
		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockDeleteWorkerRequest({ name: "my-script" });
		await runWrangler("delete --name my-script");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "out": "Successfully deleted my-script",
		  "warn": "",
		}
	`);
	});

	it("should delete a script by configuration", async () => {
		mockConfirm({
			text: `Are you sure you want to delete test-name? This action cannot be undone.`,
			result: true,
		});
		writeWranglerToml();
		mockDeleteWorkerRequest();
		await runWrangler("delete");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "out": "Successfully deleted test-name",
		  "warn": "",
		}
	`);
	});

	it("shouldn't delete a service when doing a --dry-run", async () => {
		await runWrangler("delete --name xyz --dry-run");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "out": "--dry-run: exiting now.",
		  "warn": "",
		}
	`);
	});

	it('shouldn\'t delete when the user says "no"', async () => {
		mockConfirm({
			text: `Are you sure you want to delete xyz? This action cannot be undone.`,
			result: false,
		});

		await runWrangler("delete --name xyz");

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "out": "",
		  "warn": "",
		}
	`);
	});
});

/** Create a mock handler for the request to upload a worker script. */
function mockDeleteWorkerRequest(
	options: {
		name?: string;
		env?: string;
		legacyEnv?: boolean;
	} = {}
) {
	const { env, legacyEnv, name } = options;
	setMockResponse(
		// there's no special handling for environments yet
		"/accounts/:accountId/workers/services/:scriptName",
		"DELETE",
		async ([_url, accountId, scriptName], { method }, queryParams) => {
			expect(accountId).toEqual("some-account-id");
			expect(method).toEqual("DELETE");
			expect(scriptName).toEqual(
				legacyEnv && env
					? `${name || "test-name"}-${env}`
					: `${name || "test-name"}`
			);

			expect(queryParams.get("force")).toEqual("true");

			return null;
		}
	);
}
