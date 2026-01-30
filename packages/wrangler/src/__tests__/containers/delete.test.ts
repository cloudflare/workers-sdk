import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput } from "../helpers/mock-cli-output";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

const testContainerID = "6925adea-c4ad-4aa6-bffd-d26783e9afbb";

describe("containers delete", () => {
	const stdCli = mockCLIOutput();

	const std = mockConsoleMethods();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("containers delete --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers delete <ID>

			Delete a container [open beta]

			POSITIONALS
			  ID  ID of the container to delete  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should reject invalid container ID format", async () => {
		setWranglerConfig({});
		await expect(
			runWrangler("containers delete invalid-id")
		).rejects.toMatchInlineSnapshot(
			`[Error: Expected a container ID but got invalid-id. Use \`wrangler containers list\` to view your containers and corresponding IDs.]`
		);
	});

	async function testStatusCode(code: number) {
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/:id",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(
						`{"success": false, "errors": [{"code": 1000, "message": "something happened"}]}`,
						{
							status: code,
						}
					);
				},
				{ once: true }
			)
		);
		await expect(runWrangler(`containers delete ${testContainerID}`)).rejects
			.toMatchInlineSnapshot(`
			[Error: There has been an error deleting the container.
			something happened]
		`);
		expect(stdCli.stderr).toMatchInlineSnapshot(`""`);
		expect(stdCli.stdout).toMatchInlineSnapshot(`
			"╭ Delete your container
			│
			"
		`);
	}

	it("should delete container with 400", () => testStatusCode(400));
	it("should delete container with 404", () => testStatusCode(404));

	it("should delete container with 500", async () => {
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/:id",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return new HttpResponse(
						`{"success": false, "errors": [{"code": 1000, "message": "something happened"}]}`,
						{
							type: "applicaton/json",
							status: 500,
						}
					);
				},
				{ once: true }
			)
		);
		await expect(runWrangler(`containers delete ${testContainerID}`)).rejects
			.toMatchInlineSnapshot(`
			[Error: There has been an unknown error deleting the container.
			{"error":"something happened"}]
		`);
		expect(stdCli.stderr).toMatchInlineSnapshot(`""`);
		expect(stdCli.stdout).toMatchInlineSnapshot(`
			"╭ Delete your container
			│
			"
		`);
	});

	it("should delete container", async () => {
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/:id",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return new HttpResponse(`{"success": true, "result": {}}`, {
						type: "application/json",
					});
				},
				{ once: true }
			)
		);
		await runWrangler(`containers delete ${testContainerID}`);
		expect(stdCli.stderr).toMatchInlineSnapshot(`""`);
		expect(stdCli.stdout).toMatchInlineSnapshot(`
			"╭ Delete your container
			│
			╰ Your container has been deleted

			"
		`);
	});
});
