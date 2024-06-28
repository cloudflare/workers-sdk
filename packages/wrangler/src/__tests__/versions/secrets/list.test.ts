import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { createFetchResult, msw } from "../../helpers/msw";
import { runWrangler } from "../../helpers/run-wrangler";
import writeWranglerToml from "../../helpers/write-wrangler-toml";
import type { ApiDeployment, ApiVersion } from "../../../versions/types";

describe("versions secret list", () => {
	const std = mockConsoleMethods();
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

	test("Can list secrets in single version deployment", async () => {
		mockGetDeployments();
		mockGetVersion("version-id-1");

		await runWrangler("versions secret list --name script-name --x-versions");

		expect(std.out).toMatchInlineSnapshot(`
			"-- Version version-id-1 (100%) secrets --
			Secret Name: SECRET_1
			Secret Name: SECRET_2
			Secret Name: SECRET_3
			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("Can list secrets in multi-version deployment", async () => {
		mockGetDeployments(true);
		mockGetVersion("version-id-1");
		mockGetVersion("version-id-2");

		await runWrangler("versions secret list --name script-name --x-versions");

		expect(std.out).toMatchInlineSnapshot(`
			"-- Version version-id-1 (50%) secrets --
			Secret Name: SECRET_1
			Secret Name: SECRET_2
			Secret Name: SECRET_3

			-- Version version-id-2 (50%) secrets --
			Secret Name: SECRET_1
			Secret Name: SECRET_2
			Secret Name: SECRET_3
			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("Can list secrets in single version deployment reading from wrangler.toml", async () => {
		writeWranglerToml({ name: "script-name" });

		mockGetDeployments();
		mockGetVersion("version-id-1");

		await runWrangler("versions secret list --x-versions");

		expect(std.out).toMatchInlineSnapshot(`
			"-- Version version-id-1 (100%) secrets --
			Secret Name: SECRET_1
			Secret Name: SECRET_2
			Secret Name: SECRET_3
			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("Can list secrets for latest version", async () => {
		writeWranglerToml({ name: "script-name" });

		msw.use(
			http.get(
				`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

					return HttpResponse.json(
						createFetchResult({
							items: [
								{
									id: "version-id-3",
									number: 3,
									resources: {
										bindings: [
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret one v3",
											},
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret two v3",
											},
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret three v3",
											},
										],
									},
								},
								{
									id: "version-id-2",
									number: 2,
									resources: {
										bindings: [
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret one v2",
											},
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret two v2",
											},
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret three v2",
											},
										],
									},
								},
								{
									id: "version-id-1",
									number: 1,
									resources: {
										bindings: [
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret one v1",
											},
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret two v1",
											},
											{
												type: "secret_text",
												name: "SECRET_1",
												text: "shh secret three v1",
											},
										],
									},
								},
							] as ApiVersion[],
						})
					);
				}
			)
		);

		mockGetDeployments();
		mockGetVersion("version-id-1");

		await runWrangler("versions secret list --latest-version --x-versions");

		expect(std.out).toMatchInlineSnapshot(`
			"-- Version version-id-3 (0%) secrets --
			Secret Name: SECRET_1
			Secret Name: SECRET_1
			Secret Name: SECRET_1
			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
