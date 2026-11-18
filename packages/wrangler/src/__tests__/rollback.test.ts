import { http, HttpResponse } from "msw";
import { afterEach, describe, test } from "vitest";
import { CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE } from "../versions/rollback";
import { collectCLIOutput } from "./helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type { ApiDeployment } from "../versions/types";
import type { DurableObjectCodeUpdateStrategy } from "@cloudflare/workers-utils";
import type { ExpectStatic } from "vitest";

describe("rollback", () => {
	const logs = mockConsoleMethods();
	const std = collectCLIOutput();
	const { setIsTTY } = useMockIsTTY();
	mockAccountId();
	mockApiToken();

	afterEach(() => {
		clearDialogs();
	});

	function mockGetDeployments(expect: ExpectStatic, multiVersion = false) {
		const versions = multiVersion
			? [
					{ version_id: "version-id-1", percentage: 50 },
					{ version_id: "version-id-2", percentage: 50 },
				]
			: [{ version_id: "version-id-1", percentage: 100 }];

		msw.use(
			http.get(
				`*/accounts/:accountId/workers/scripts/:scriptName/deployments`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

					return HttpResponse.json(
						createFetchResult({
							deployments: [
								{
									id: "deployment-id",
									source: "api",
									strategy: "percentage",
									versions,
								},
							] as ApiDeployment[],
						})
					);
				},
				{ once: true }
			)
		);
	}

	function mockGetVersion(expect: ExpectStatic, versionId: string) {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/scripts/:scriptName/versions/${versionId}`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

					return HttpResponse.json(
						createFetchResult({
							id: versionId,
							metadata: {},
							number: 2,
							resources: {
								bindings: [
									{
										type: "secret_text",
										name: "SECRET_1",
										text: "First secret",
									},
									{
										type: "secret_text",
										name: "SECRET_2",
										text: "Second secret",
									},
									{
										type: "secret_text",
										name: "SECRET_3",
										text: "Third secret",
									},
								],
								script: {
									etag: "etag",
									handlers: ["fetch"],
									last_deployed_from: "api",
								},
								script_runtime: {
									usage_model: "standard",
									limits: {},
								},
							},
						})
					);
				},
				{ once: true }
			)
		);
	}

	function mockPostDeployment(
		expect: ExpectStatic,
		expectedCodeUpdateStrategy: DurableObjectCodeUpdateStrategy = {
			mode: "deferred",
			max_delay: 300,
		}
	) {
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/deployments`,
				async ({ params, request }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");
					const body = (await request.json()) as {
						code_update_strategy?: DurableObjectCodeUpdateStrategy;
					};
					expect(body.code_update_strategy).toEqual(expectedCodeUpdateStrategy);

					return HttpResponse.json(createFetchResult({}));
				},
				{ once: true }
			)
		);
	}

	/**
	 * Mock the deployments endpoint so that it rejects non-forced requests
	 * because secrets have changed, and accepts requests with `?force=true`.
	 *
	 * msw ignores query strings when matching handlers, so a single handler
	 * inspects `force` instead of registering one handler per request.
	 *
	 * @returns the value of the `force` query parameter for each request made
	 */
	function mockPostDeploymentWithChangedSecrets(expect: ExpectStatic) {
		const forceParams: (string | null)[] = [];
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/deployments`,
				async ({ params, request }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");
					const force = new URL(request.url).searchParams.get("force");
					forceParams.push(force);

					if (force === "true") {
						return HttpResponse.json(createFetchResult({}));
					}
					return HttpResponse.json(
						createFetchResult(null, false, [
							{
								code: CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE,
								message:
									"A secret has changed since this version was active. If you are sure this is ok, add a ?force=true query parameter to allow the rollback. The following secrets have changed: SECRET, SECRET_TWO",
							},
						]),
						{ status: 400 }
					);
				}
			)
		);
		return forceParams;
	}

	function mockRollbackPrompts(confirmChangedSecrets: boolean) {
		mockPrompt({
			text: "Please provide an optional message for this rollback (120 characters max)",
			result: "Test rollback",
		});
		mockConfirm(
			{
				text: "Are you sure you want to deploy this Worker Version to 100% of traffic?",
				result: true,
			},
			{
				text:
					`The following secrets have changed since version rollback-version was deployed. Please confirm you wish to continue with the rollback` +
					"\n  * SECRET\n  * SECRET_TWO",
				result: confirmChangedSecrets,
			}
		);
	}

	test("can rollback to an earlier version", async ({ expect }) => {
		setIsTTY(true);
		mockGetDeployments(expect);
		mockGetVersion(expect, "version-id-1");
		mockGetVersion(expect, "rollback-version");
		mockPostDeployment(expect, { mode: "deferred", max_delay: 45 });

		mockPrompt({
			text: "Please provide an optional message for this rollback (120 characters max)",
			result: "Test rollback",
		});

		mockConfirm({
			text: "Are you sure you want to deploy this Worker Version to 100% of traffic?",
			result: true,
		});

		await runWrangler(
			"rollback --name script-name --durable-objects-code-update-mode deferred 45s rollback-version"
		);

		// Unable to test stdout as the output has weird whitespace. Causing lint to fail with "no-irregular-whitespace"
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("rolling back with changed secrets prompts confirmation", async ({
		expect,
	}) => {
		setIsTTY(true);
		mockGetDeployments(expect);
		mockGetVersion(expect, "version-id-1");
		mockGetVersion(expect, "rollback-version");
		const forceParams = mockPostDeploymentWithChangedSecrets(expect);
		mockRollbackPrompts(true);

		await runWrangler(
			"rollback --name script-name --version-id rollback-version"
		);

		expect(forceParams).toEqual([null, "true"]);
		expect(std.out).toContain(
			"Worker Version rollback-version has been deployed to 100% of traffic."
		);
		expect(logs.out).toContain("Current Version ID: rollback-version");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("declining the changed secrets confirmation aborts the rollback", async ({
		expect,
	}) => {
		setIsTTY(true);
		mockGetDeployments(expect);
		mockGetVersion(expect, "version-id-1");
		mockGetVersion(expect, "rollback-version");
		const forceParams = mockPostDeploymentWithChangedSecrets(expect);
		mockRollbackPrompts(false);

		await runWrangler(
			"rollback --name script-name --version-id rollback-version"
		);

		expect(forceParams).toEqual([null]);
		expect(std.out).toContain("Aborting rollback...");
		expect(std.out).not.toContain("has been deployed to 100% of traffic");
		expect(logs.out).not.toContain("Current Version ID");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("rolling back with changed secrets (non-interactive)", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockGetDeployments(expect);
		mockGetVersion(expect, "version-id-1");
		mockGetVersion(expect, "rollback-version");
		const forceParams = mockPostDeploymentWithChangedSecrets(expect);

		await runWrangler(
			"rollback --name script-name --version-id rollback-version"
		);

		expect(forceParams).toEqual([null, "true"]);
		expect(logs.out).toContain("Current Version ID: rollback-version");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
