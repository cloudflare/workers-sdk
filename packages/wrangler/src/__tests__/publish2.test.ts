import { MockedRequest, rest } from "msw";
import { FormData } from "undici";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	mockExchangeRefreshTokenForAccessToken,
	mockOAuthFlow,
} from "./helpers/mock-oauth-flow2";
import {
	msw,
	mswSuccessDeployments,
	mswSuccessLastDeployment,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import writeWranglerToml from "./helpers/write-wrangler-toml";
import type { WorkerMetadata } from "../create-worker-upload-form";
import type { CfWorkerInit } from "../worker";
import type { ResponseComposition, RestContext, RestRequest } from "msw";

describe("publish (new)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { mockOAuthServerCallback } = mockOAuthFlow();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	describe("output additional script information", () => {
		it("for first party workers, it should print worker information at log level", async () => {
			setIsTTY(false);
			writeWranglerToml({
				first_party_worker: true,
			});
			writeWorkerSource();

			mockDeploymentsListRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ expectedType: "esm", sendScriptIds: true });
			mockOAuthServerCallback();

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker ID:  abc12345
			Worker ETag:  etag98765
			Worker PipelineHash:  hash9999
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
		});
	});

	describe("authentication", () => {
		mockApiToken({ apiToken: null });

		it("drops a user into the login flow if they're unauthenticated", async () => {
			setIsTTY(true);
			writeWranglerToml();
			writeWorkerSource();
			mockDomainUsesAccess({ usesAccess: false });
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshSuccess" });
			mockOAuthServerCallback("success");
			mockDeploymentsListRequest();
			mockLastDeploymentRequest();

			await expect(runWrangler("publish index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Attempting to login via OAuth...
			Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
			Successfully logged in.
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});

function mockDeploymentsListRequest() {
	msw.use(...mswSuccessDeployments);
}

function mockLastDeploymentRequest() {
	msw.use(...mswSuccessLastDeployment);
}

/** Create a mock handler for the request to upload a worker script. */
function mockUploadWorkerRequest(
	options: {
		available_on_subdomain?: boolean;
		expectedEntry?: string;
		expectedMainModule?: string;
		expectedType?: "esm" | "sw";
		expectedBindings?: unknown;
		expectedModules?: Record<string, string>;
		expectedCompatibilityDate?: string;
		expectedCompatibilityFlags?: string[];
		expectedMigrations?: CfWorkerInit["migrations"];
		env?: string;
		legacyEnv?: boolean;
		sendScriptIds?: boolean;
		keepVars?: boolean;
		tag?: string;
	} = {}
) {
	const {
		available_on_subdomain = true,
		expectedEntry,
		expectedMainModule = "index.js",
		expectedType = "esm",
		expectedBindings,
		expectedModules = {},
		expectedCompatibilityDate,
		expectedCompatibilityFlags,
		env = undefined,
		legacyEnv = false,
		expectedMigrations,
		sendScriptIds,
		keepVars,
	} = options;
	if (env && !legacyEnv) {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				handleUpload
			)
		);
	} else {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/scripts/:scriptName",
				handleUpload
			)
		);
	}

	async function handleUpload(
		req: RestRequest,
		resp: ResponseComposition,
		ctx: RestContext
	) {
		expect(req.params.accountId).toEqual("some-account-id");
		expect(req.params.scriptName).toEqual(
			legacyEnv && env ? `test-name-${env}` : "test-name"
		);
		if (!legacyEnv) {
			expect(req.params.envName).toEqual(env);
		}
		expect(req.url.searchParams.get("include_subdomain_availability")).toEqual(
			"true"
		);
		expect(req.url.searchParams.get("excludeScript")).toEqual("true");

		const formBody = await (
			req as MockedRequest as RestRequestWithFormData
		).formData();
		if (expectedEntry !== undefined) {
			expect(formBody.get("index.js")).toMatch(expectedEntry);
		}
		const metadata = JSON.parse(
			formBody.get("metadata") as string
		) as WorkerMetadata;
		if (expectedType === "esm") {
			expect(metadata.main_module).toEqual(expectedMainModule);
		} else {
			expect(metadata.body_part).toEqual("index.js");
		}

		if (keepVars) {
			expect(metadata.keep_bindings).toEqual(["plain_text", "json"]);
		} else {
			expect(metadata.keep_bindings).toBeFalsy();
		}

		if ("expectedBindings" in options) {
			expect(metadata.bindings).toEqual(expectedBindings);
		}
		if ("expectedCompatibilityDate" in options) {
			expect(metadata.compatibility_date).toEqual(expectedCompatibilityDate);
		}
		if ("expectedCompatibilityFlags" in options) {
			expect(metadata.compatibility_flags).toEqual(expectedCompatibilityFlags);
		}
		if ("expectedMigrations" in options) {
			expect(metadata.migrations).toEqual(expectedMigrations);
		}
		for (const [name, content] of Object.entries(expectedModules)) {
			expect(formBody.get(name)).toEqual(content);
		}

		return resp(
			ctx.json({
				result: {
					available_on_subdomain,
					...(sendScriptIds && {
						id: "abc12345",
						etag: "etag98765",
						pipeline_hash: "hash9999",
						tag: "sample-tag",
					}),
				},
				success: true,
				errors: [],
				messages: [],
			})
		);
	}
}

/** Create a mock handler for the request to get the account's subdomain. */
function mockSubDomainRequest(
	subdomain = "test-sub-domain",
	registeredWorkersDev = true
) {
	if (registeredWorkersDev) {
		msw.use(
			rest.get("*/accounts/:accountId/workers/subdomain", (req, res, ctx) => {
				return res.once(
					ctx.json({
						result: { subdomain },
						success: true,
						errors: [],
						messages: [],
					})
				);
			})
		);
	} else {
		msw.use(
			rest.get("*/accounts/:accountId/workers/subdomain", (req, res, ctx) => {
				return res.once(
					ctx.json({
						result: null,
						success: false,
						errors: [
							{ code: 10007, message: "haven't registered workers.dev" },
						],
						messages: [],
					})
				);
			})
		);
	}
}

function mockDomainUsesAccess({
	usesAccess,
	domain = "dash.cloudflare.com",
}: {
	usesAccess: boolean;
	domain?: string;
}) {
	// If the domain relies upon Cloudflare Access, then a request to the domain
	// will result in a redirect to the `cloudflareaccess.com` domain.
	msw.use(
		rest.get(`https://${domain}/`, (req, res, ctx) => {
			let status = 200;
			let headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			if (usesAccess) {
				status = 302;
				headers = { location: "cloudflareaccess.com" };
			}
			return res.once(ctx.status(status), ctx.set(headers));
		})
	);
}

// The following to functions workaround the fact that MSW does not yet support FormData in requests.
// We use the fact that MSW relies upon `node-fetch` internally, which will call `toString()` on the FormData object,
// rather than passing it through  or serializing it as a proper FormData object.
// The hack is to serialize FormData to a JSON string by overriding `FormData.toString()`.
// And then to deserialize back to a FormData object by monkey-patching a `formData()` helper onto `MockedRequest`.
FormData.prototype.toString = mockFormDataToString;
function mockFormDataToString(this: FormData) {
	return JSON.stringify({
		__formdata: Array.from(this.entries()),
	});
}
interface RestRequestWithFormData extends MockedRequest, RestRequest {
	formData(): Promise<FormData>;
}
(MockedRequest.prototype as RestRequestWithFormData).formData =
	mockFormDataFromString;
async function mockFormDataFromString(this: MockedRequest): Promise<FormData> {
	const { __formdata } = await this.json();
	expect(__formdata).toBeInstanceOf(Array);
	const form = new FormData();
	for (const [key, value] of __formdata) {
		form.set(key, value);
	}
	return form;
}
