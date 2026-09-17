import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput } from "../helpers/mock-cli-output";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { ExpectStatic } from "vitest";

const testApplicationID = "6925adea-c4ad-4aa6-bffd-d26783e9afbb";
const namespaceApplicationID = "7d88cd87be4b402387fd3aafa1d461af";

describe("containers delete", () => {
	const stdCli = mockCLIOutput();

	const std = mockConsoleMethods();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		msw.resetHandlers();
	});

	it("should help", async ({ expect }) => {
		await runWrangler("containers delete --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers delete <ID>

			Delete a container application

			POSITIONALS
			  ID  ID of the container application to delete  [string] [required]

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]"
		`);
	});

	it("should reject invalid application ID format", async ({ expect }) => {
		setWranglerConfig({});
		await expect(
			runWrangler("containers delete invalid-id")
		).rejects.toMatchInlineSnapshot(
			`[Error: Expected an application ID but got invalid-id. Use \`wrangler containers list\` to view your container applications and corresponding IDs.]`
		);
	});

	it("should reject an instance actor ID as an application ID", async ({
		expect,
	}) => {
		setWranglerConfig({});
		let deleteRequests = 0;
		msw.use(
			http.delete("*/applications/:id", () => {
				deleteRequests++;
				return HttpResponse.json({ success: true, result: {} });
			})
		);

		await expect(
			runWrangler(`containers delete ${"a".repeat(64)}`)
		).rejects.toThrow("Expected an application ID");
		expect(deleteRequests).toBe(0);
	});

	it("should reject a non-canonical namespace application ID", async ({
		expect,
	}) => {
		setWranglerConfig({});
		let deleteRequests = 0;
		msw.use(
			http.delete("*/applications/:id", () => {
				deleteRequests++;
				return HttpResponse.json({ success: true, result: {} });
			})
		);

		await expect(
			runWrangler(`containers delete ${namespaceApplicationID.toUpperCase()}`)
		).rejects.toThrow("Expected an application ID");
		expect(deleteRequests).toBe(0);
	});

	it("should delete a namespace application by its namespace ID", async ({
		expect,
	}) => {
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/:id",
				async ({ params, request }) => {
					expect(params.id).toBe(namespaceApplicationID);
					expect(await request.text()).toEqual("");
					return HttpResponse.json({ success: true, result: {} });
				},
				{ once: true }
			)
		);

		await runWrangler(`containers delete ${namespaceApplicationID}`);

		expect(stdCli.stdout).toContain(
			"The container application has been deleted"
		);
	});

	async function testStatusCode(expect: ExpectStatic, code: number) {
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
		await expect(runWrangler(`containers delete ${testApplicationID}`)).rejects
			.toMatchInlineSnapshot(`
			[Error: There has been an error deleting the container application.
			something happened]
		`);
		expect(stdCli.stderr).toMatchInlineSnapshot(`""`);
		expect(stdCli.stdout).toMatchInlineSnapshot(`
			"╭ Delete container application
			│
			"
		`);
	}

	it("should handle a 400 response when deleting an application", ({
		expect,
	}) => testStatusCode(expect, 400));
	it("should handle a 404 response when deleting an application", ({
		expect,
	}) => testStatusCode(expect, 404));

	it("should handle a 500 response when deleting an application", async ({
		expect,
	}) => {
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
		await expect(runWrangler(`containers delete ${testApplicationID}`)).rejects
			.toMatchInlineSnapshot(`
			[Error: There has been an unknown error deleting the container application.
			{"error":"something happened"}]
		`);
		expect(stdCli.stderr).toMatchInlineSnapshot(`""`);
		expect(stdCli.stdout).toMatchInlineSnapshot(`
			"╭ Delete container application
			│
			"
		`);
	});

	it("should delete an application", async ({ expect }) => {
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/:id",
				async ({ params, request }) => {
					expect(params.id).toBe(testApplicationID);
					expect(await request.text()).toEqual("");
					return new HttpResponse(`{"success": true, "result": {}}`, {
						type: "application/json",
					});
				},
				{ once: true }
			)
		);
		await runWrangler(`containers delete ${testApplicationID}`);
		expect(stdCli.stderr).toMatchInlineSnapshot(`""`);
		expect(stdCli.stdout).toMatchInlineSnapshot(`
			"╭ Delete container application
			│
			╰ The container application has been deleted

			"
		`);
	});
});
