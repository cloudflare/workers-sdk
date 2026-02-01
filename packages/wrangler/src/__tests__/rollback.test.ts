import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE } from "../commands/versions/rollback";
import { collectCLIOutput } from "./helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type { ApiDeployment } from "../commands/versions/types";

describe("rollback", () => {
	mockConsoleMethods();
	const std = collectCLIOutput();
	const { setIsTTY } = useMockIsTTY();
	mockAccountId();
	mockApiToken();

	function mockGetDeployments(multiVersion = false) {
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

	function mockGetVersion(versionId: string) {
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

	function mockPostDeployment(forced = false) {
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/deployments${forced ? "?force=true" : ""}`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

					return HttpResponse.json(createFetchResult({}));
				},
				{ once: true }
			)
		);
	}

	test("can rollback to an earlier version", async () => {
		mockGetDeployments();
		mockGetVersion("version-id-1");
		mockGetVersion("rollback-version");
		mockPostDeployment();

		mockPrompt({
			text: "Please provide an optional message for this rollback (120 characters max)",
			result: "Test rollback",
		});

		mockConfirm({
			text: "Are you sure you want to deploy this Worker Version to 100% of traffic?",
			result: true,
		});

		await runWrangler(
			"rollback --name script-name --version-id rollback-version"
		);

		// Unable to test stdout as the output has weird whitespace. Causing lint to fail with "no-irregular-whitespace"
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("rolling back with changed secrets prompts confirmation", async () => {
		mockGetDeployments();
		mockGetVersion("version-id-1");
		mockGetVersion("rollback-version");

		// Deployment will fail due to changed secret
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/deployments`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

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
				},
				{ once: true }
			)
		);

		// Now deploy again with force and succeed
		mockPostDeployment(true);

		mockPrompt({
			text: "Please provide an optional message for this rollback (120 characters max)",
			result: "Test rollback",
		});

		mockConfirm({
			text: "Are you sure you want to deploy this Worker Version to 100% of traffic?",
			result: true,
		});

		// We will have an additional confirmation
		mockConfirm({
			text:
				`The following secrets have changed since version rollback-version was deployed. Please confirm you wish to continue with the rollback` +
				"\n  * SECRET\n  * SECRET_TWO",
			result: true,
		});

		await runWrangler(
			"rollback --name script-name --version-id rollback-version"
		);

		// Unable to test stdout as the output has weird whitespace. Causing lint to fail with "no-irregular-whitespace"
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("rolling back with changed secrets (non-interactive)", async () => {
		setIsTTY(false);
		mockGetDeployments();
		mockGetVersion("version-id-1");
		mockGetVersion("rollback-version");

		// Deployment will fail due to changed secret
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/deployments`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

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
				},
				{ once: true }
			)
		);

		// Now deploy again with force and succeed
		mockPostDeployment(true);

		await runWrangler(
			"rollback --name script-name --version-id rollback-version"
		);

		// Unable to test stdout as the output has weird whitespace. Causing lint to fail with "no-irregular-whitespace"
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
