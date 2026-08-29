import * as childProcess from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import * as streams from "@cloudflare/cli-shared-helpers/streams";
import {
	extractConfigBindings,
	getBranchName,
	getCommitSha,
	getPullRequestMetadata,
	getRepositoryUrl,
	previewContainerAppName,
} from "@cloudflare/deploy-helpers";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeEach, describe, test, vi } from "vitest";
import { clearOutputFilePath } from "../output";
import * as user from "../user";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import {
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "./helpers/write-wrangler-config";
import type { OutputEntry } from "../output";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

vi.mock("node:child_process", async () => {
	const actual =
		await vi.importActual<typeof childProcess>("node:child_process");
	return {
		...actual,
		execSync: vi.fn(actual.execSync),
	};
});

function configWithPreviews(previews: PreviewsConfig): Config {
	return {
		...defaultWranglerConfig,
		previews,
	};
}

type PreviewDeploymentModulePart = {
	name: string;
	content_type: string;
	content: Uint8Array;
};

function decodeModuleContent(
	module: PreviewDeploymentModulePart | undefined
): string {
	return module ? new TextDecoder().decode(module.content) : "";
}

async function readPreviewDeploymentRequest(
	request: Request
): Promise<
	Record<string, unknown> & { modules: PreviewDeploymentModulePart[] }
> {
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- formData() is the standard Web API for parsing multipart bodies; only deprecated on undici's server-side types
	const form = await request.formData();

	const metadataPart = form.get("metadata");
	if (typeof metadataPart !== "string") {
		throw new Error(
			"Preview deployment request is missing its `metadata` form part"
		);
	}
	const metadata = JSON.parse(metadataPart) as Record<string, unknown>;
	if ("modules" in metadata) {
		throw new Error(
			"Preview deployment `metadata` must not carry `modules`; modules belong in their own form parts"
		);
	}

	const moduleParts = form.getAll("files");
	if (moduleParts.length === 0) {
		throw new Error("Preview deployment request has no module file parts");
	}

	const modules = await Promise.all(
		moduleParts.map(async (part) => {
			if (!(part instanceof File)) {
				throw new Error(
					"Preview deployment module part is a plain field, not a file"
				);
			}
			return {
				name: part.name,
				content_type: part.type,
				content: new Uint8Array(await part.arrayBuffer()),
			};
		})
	);

	return { ...metadata, modules };
}

/**
 * Write a Worker entrypoint and a `wrangler.json` whose `previews` block binds
 * one Durable Object and attaches a registry-image container to it.
 */
function writeContainerPreviewConfig() {
	writeFileSync(
		"src/index.ts",
		"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
	);
	writeFileSync(
		"wrangler.json",
		JSON.stringify({
			name: "test-worker",
			main: "src/index.ts",
			compatibility_date: "2025-01-01",
			previews: {
				durable_objects: {
					bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
				},
				containers: [
					{
						class_name: "MyContainer",
						image: "registry.cloudflare.com/some-account-id/test:latest",
					},
				],
			},
		})
	);
}

/**
 * Install msw handlers for the three requests a container preview makes: a
 * lookup that misses, the preview creation, then the deployment creation.
 *
 * @param options - Preview id to report, bindings the deployment response
 * carries back, and an optional hook fired when the deployment is created.
 */
function mockContainerPreview({
	previewId,
	deploymentEnv = {},
	onCreateDeployment,
}: {
	previewId: string;
	deploymentEnv?: Record<string, unknown>;
	onCreateDeployment?: () => void;
}) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
			() =>
				HttpResponse.json(
					{
						success: false,
						result: null,
						errors: [{ code: 10025, message: "Preview not found" }],
					},
					{ status: 404 }
				)
		),
		http.post(`*/accounts/:accountId/workers/workers/:workerId/previews`, () =>
			HttpResponse.json(
				{
					success: true,
					result: {
						id: previewId,
						name: "test-preview",
						slug: "test-preview",
						urls: ["https://test-preview.test-worker.cloudflare.app"],
						worker_name: "test-worker",
						created_on: new Date().toISOString(),
					},
				},
				{ status: 201 }
			)
		),
		http.post(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
			() => {
				onCreateDeployment?.();
				return HttpResponse.json(
					{
						success: true,
						result: {
							id: `deployment-${previewId}`,
							preview_id: previewId,
							preview_name: "test-preview",
							urls: ["https://test-preview.test-worker.cloudflare.app"],
							compatibility_date: "2025-01-01",
							env: deploymentEnv,
							created_on: new Date().toISOString(),
						},
					},
					{ status: 201 }
				);
			}
		)
	);
}

function clearPreviewMetadataEnvs() {
	vi.stubEnv("GITHUB_REPOSITORY", "");
	vi.stubEnv("GITHUB_SERVER_URL", "");
	vi.stubEnv("GITHUB_EVENT_PATH", "");
	vi.stubEnv("GITHUB_REF", "");
	vi.stubEnv("CI_PROJECT_URL", "");
	vi.stubEnv("CI_REPOSITORY_URL", "");
	vi.stubEnv("CI_MERGE_REQUEST_IID", "");
	vi.stubEnv("CI_MERGE_REQUEST_PROJECT_URL", "");
	vi.stubEnv("CIRCLE_REPOSITORY_URL", "");
	vi.stubEnv("CIRCLE_PULL_REQUEST", "");
	vi.stubEnv("BUILDKITE_REPO", "");
	vi.stubEnv("BITBUCKET_GIT_HTTP_ORIGIN", "");
	vi.stubEnv("BITBUCKET_GIT_SSH_ORIGIN", "");
	vi.stubEnv("REPOSITORY_URL", "");
	vi.stubEnv("PULL_REQUEST_URL", "");
	vi.stubEnv("PULL_REQUEST_NUMBER", "");
	vi.stubEnv("PR_URL", "");
	vi.stubEnv("PR_NUMBER", "");
	vi.stubEnv("CHANGE_URL", "");
	vi.stubEnv("CHANGE_ID", "");
	vi.stubEnv("GITHUB_SHA", "");
	vi.stubEnv("CI_COMMIT_SHA", "");
	vi.stubEnv("CIRCLE_SHA1", "");
	vi.stubEnv("COMMIT_SHA", "");
	vi.stubEnv("CI_MERGE_REQUEST_TITLE", "");
	vi.stubEnv("PULL_REQUEST_TITLE", "");
}

describe("wrangler preview", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockApiToken();
	mockAccountId();
	afterEach(() => {
		clearOutputFilePath();
		// Several container tests stub `getScopes` to grant `containers:write`.
		// `vitest.setup.ts` only clears mock calls, so without an explicit
		// restore that stub would outlive its test and silently grant the scope
		// to every later test in the file.
		vi.restoreAllMocks();
	});

	describe("getBranchName", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
			vi.stubEnv("WORKERS_CI_BRANCH", undefined);
			vi.stubEnv("GITHUB_REF_NAME", undefined);
			vi.stubEnv("GITHUB_HEAD_REF", undefined);
			vi.stubEnv("CI_COMMIT_REF_NAME", undefined);
			clearPreviewMetadataEnvs();
		});

		afterAll(() => {
			vi.unstubAllEnvs();
		});

		test("should prefer the Workers CI branch env var", ({ expect }) => {
			vi.stubEnv("WORKERS_CI_BRANCH", "workers-build-branch");
			vi.stubEnv("GITHUB_REF_NAME", "github-branch");
			vi.stubEnv("GITHUB_HEAD_REF", "github-head-branch");
			vi.stubEnv("CI_COMMIT_REF_NAME", "gitlab-branch");

			expect(getBranchName()).toBe("workers-build-branch");
		});

		test("should use the GitHub Actions branch env vars", ({ expect }) => {
			vi.stubEnv("GITHUB_HEAD_REF", "github-pr-branch");
			expect(getBranchName()).toBe("github-pr-branch");

			vi.stubEnv("GITHUB_HEAD_REF", undefined);
			vi.stubEnv("GITHUB_REF_NAME", "github-push-branch");
			expect(getBranchName()).toBe("github-push-branch");
		});

		test("should use the GitLab branch env var", ({ expect }) => {
			vi.stubEnv("CI_COMMIT_REF_NAME", "gitlab-branch");

			expect(getBranchName()).toBe("gitlab-branch");
		});
	});

	describe("previewContainerAppName", () => {
		const DIGEST_SUFFIX = /_[0-9a-z]{7}$/;

		test("should join worker name, preview slug, and class name with underscores", ({
			expect,
		}) => {
			expect(
				previewContainerAppName("test-worker", "feature-branch", "MyContainer")
			).toBe("test-worker_feature-branch_MyContainer");
		});

		// Worker and class names can produce values the containers API rejects.
		test.for([
			{
				reason: "a worker name that starts with a digit",
				workerName: "9-my-worker",
				className: "MyContainer",
				body: "w9-my-worker_feature-branch_MyContainer",
			},
			{
				reason: "consecutive dashes in a worker name",
				workerName: "my--worker",
				className: "MyContainer",
				body: "my-worker_feature-branch_MyContainer",
			},
			{
				reason: "a character that no application name may contain",
				workerName: "test-worker",
				className: "My$Class",
				body: "test-worker_feature-branch_My-Class",
			},
		])(
			"should normalise $reason and mark it with a digest",
			({ workerName, className, body }, { expect }) => {
				const name = previewContainerAppName(
					workerName,
					"feature-branch",
					className
				);

				expect(name).toMatch(DIGEST_SUFFIX);
				expect(name.replace(DIGEST_SUFFIX, "")).toBe(body);
			}
		);

		test("should keep apart worker names that normalise onto one another", ({
			expect,
		}) => {
			expect(
				previewContainerAppName("my--worker", "feature-branch", "MyContainer")
			).not.toBe(
				previewContainerAppName("my-worker", "feature-branch", "MyContainer")
			);
		});

		test("should cap the name at the length the API allows", ({ expect }) => {
			const name = previewContainerAppName(
				"w".repeat(300),
				"feature-branch",
				"MyContainer"
			);

			expect(name).toHaveLength(253);
			expect(name).toMatch(DIGEST_SUFFIX);
		});

		test("should keep apart worker names that differ only past that length", ({
			expect,
		}) => {
			expect(
				previewContainerAppName(
					`${"w".repeat(300)}a`,
					"feature-branch",
					"MyContainer"
				)
			).not.toBe(
				previewContainerAppName(
					`${"w".repeat(300)}b`,
					"feature-branch",
					"MyContainer"
				)
			);
		});
	});

	describe("getRepositoryUrl", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
			clearPreviewMetadataEnvs();
		});

		afterAll(() => {
			vi.unstubAllEnvs();
		});

		test("should use GitHub Actions repository env vars", ({ expect }) => {
			vi.stubEnv("GITHUB_REPOSITORY", "cloudflare/workers-sdk");

			expect(getRepositoryUrl()).toBe(
				"https://github.com/cloudflare/workers-sdk"
			);
		});

		test("should use GitHub Enterprise server URL", ({ expect }) => {
			vi.stubEnv("GITHUB_SERVER_URL", "https://github.example.com/");
			vi.stubEnv("GITHUB_REPOSITORY", "cloudflare/workers-sdk");

			expect(getRepositoryUrl()).toBe(
				"https://github.example.com/cloudflare/workers-sdk"
			);
		});

		test("should use GitLab project URL", ({ expect }) => {
			vi.stubEnv(
				"CI_PROJECT_URL",
				"https://gitlab.example.com/cloudflare/workers-sdk.git"
			);

			expect(getRepositoryUrl()).toBe(
				"https://gitlab.example.com/cloudflare/workers-sdk"
			);
		});

		test("should use and normalize git remote origin URL when in CI", ({
			expect,
		}) => {
			vi.stubEnv("CI", "true");
			vi.mocked(childProcess.execSync)
				.mockImplementationOnce(() => Buffer.from("true"))
				.mockImplementationOnce(() =>
					Buffer.from("git@git.example.com:acme/worker-project.git\n")
				);

			expect(getRepositoryUrl()).toBe(
				"https://git.example.com/acme/worker-project"
			);
		});

		test("should not shell out to the local git remote outside CI", ({
			expect,
		}) => {
			vi.stubEnv("CI", undefined);

			expect(getRepositoryUrl()).toBeUndefined();
			expect(childProcess.execSync).not.toHaveBeenCalled();
		});
	});

	describe("getPullRequestMetadata", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
			clearPreviewMetadataEnvs();
		});

		afterAll(() => {
			vi.unstubAllEnvs();
		});

		test("should use direct pull request URL env vars", ({ expect }) => {
			vi.stubEnv(
				"PULL_REQUEST_URL",
				"https://git.example.com/acme/worker-project/pulls/13"
			);
			vi.stubEnv("PULL_REQUEST_NUMBER", "13");
			vi.stubEnv("PULL_REQUEST_TITLE", "Add a cool new feature");

			expect(getPullRequestMetadata()).toEqual({
				number: "13",
				url: "https://git.example.com/acme/worker-project/pulls/13",
				title: "Add a cool new feature",
			});
		});

		test("should use GitHub event pull request metadata", ({ expect }) => {
			writeFileSync(
				"github-event.json",
				JSON.stringify({
					pull_request: {
						number: 13,
						html_url: "https://github.com/acme/worker-project/pull/13",
						title: "Add a cool new feature",
					},
				})
			);
			vi.stubEnv("GITHUB_EVENT_PATH", "github-event.json");

			expect(getPullRequestMetadata()).toEqual({
				number: "13",
				url: "https://github.com/acme/worker-project/pull/13",
				title: "Add a cool new feature",
			});
		});

		test("should not fail when the GitHub event pull request has no title", ({
			expect,
		}) => {
			writeFileSync(
				"github-event.json",
				JSON.stringify({
					pull_request: {
						number: 13,
						html_url: "https://github.com/acme/worker-project/pull/13",
					},
				})
			);
			vi.stubEnv("GITHUB_EVENT_PATH", "github-event.json");

			expect(getPullRequestMetadata()).toEqual({
				number: "13",
				url: "https://github.com/acme/worker-project/pull/13",
			});
		});

		test("should not recover a title from the GITHUB_REF fallback", ({
			expect,
		}) => {
			vi.stubEnv("GITHUB_REF", "refs/pull/13/merge");
			vi.stubEnv("GITHUB_REPOSITORY", "acme/worker-project");

			expect(getPullRequestMetadata()).toEqual({
				number: "13",
				url: "https://github.com/acme/worker-project/pull/13",
			});
		});

		test("should use GitLab merge request metadata", ({ expect }) => {
			vi.stubEnv(
				"CI_PROJECT_URL",
				"https://gitlab.example.com/acme/worker-project"
			);
			vi.stubEnv("CI_MERGE_REQUEST_IID", "13");
			vi.stubEnv("CI_MERGE_REQUEST_TITLE", "Add a cool new feature");

			expect(getPullRequestMetadata()).toEqual({
				number: "13",
				url: "https://gitlab.example.com/acme/worker-project/-/merge_requests/13",
				title: "Add a cool new feature",
			});
		});

		test("should treat a blank title the same as a missing one", ({
			expect,
		}) => {
			vi.stubEnv(
				"CI_PROJECT_URL",
				"https://gitlab.example.com/acme/worker-project"
			);
			vi.stubEnv("CI_MERGE_REQUEST_IID", "13");
			vi.stubEnv("CI_MERGE_REQUEST_TITLE", "   ");

			expect(getPullRequestMetadata()).toEqual({
				number: "13",
				url: "https://gitlab.example.com/acme/worker-project/-/merge_requests/13",
			});
		});
	});

	describe("getCommitSha", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
			clearPreviewMetadataEnvs();
		});

		afterAll(() => {
			vi.unstubAllEnvs();
		});

		test("should use the GitHub Actions commit SHA", ({ expect }) => {
			vi.stubEnv("GITHUB_SHA", "abc123def456");

			expect(getCommitSha()).toBe("abc123def456");
		});

		test("should use the GitLab CI commit SHA", ({ expect }) => {
			vi.stubEnv("CI_COMMIT_SHA", "def456abc123");

			expect(getCommitSha()).toBe("def456abc123");
		});

		test("should use the CircleCI commit SHA", ({ expect }) => {
			vi.stubEnv("CIRCLE_SHA1", "123abc456def");

			expect(getCommitSha()).toBe("123abc456def");
		});

		test("should use the generic COMMIT_SHA fallback", ({ expect }) => {
			vi.stubEnv("COMMIT_SHA", "789fed321cba");

			expect(getCommitSha()).toBe("789fed321cba");
		});

		test("should prefer GitHub Actions over other providers", ({ expect }) => {
			vi.stubEnv("GITHUB_SHA", "github-sha");
			vi.stubEnv("CI_COMMIT_SHA", "gitlab-sha");
			vi.stubEnv("CIRCLE_SHA1", "circleci-sha");
			vi.stubEnv("COMMIT_SHA", "generic-sha");

			expect(getCommitSha()).toBe("github-sha");
		});

		test("should return undefined when no commit SHA env var is set", ({
			expect,
		}) => {
			expect(getCommitSha()).toBeUndefined();
		});
	});

	describe("extractConfigBindings", () => {
		test("should extract vars as plain_text bindings", ({ expect }) => {
			const config = configWithPreviews({
				vars: { VAR1: "value1", VAR2: "value2" },
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				VAR1: { type: "plain_text", text: "value1" },
				VAR2: { type: "plain_text", text: "value2" },
			});
		});

		test("should extract non-string vars as json bindings so the runtime preserves the native shape", ({
			expect,
		}) => {
			const config = configWithPreviews({
				vars: {
					ALLOWLIST: ["a@example.com", "b@example.com"],
					CONFIG: { feature: true, retries: 3 },
					COUNT: 42,
					ENABLED: true,
				},
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				ALLOWLIST: { type: "json", json: ["a@example.com", "b@example.com"] },
				CONFIG: { type: "json", json: { feature: true, retries: 3 } },
				COUNT: { type: "json", json: 42 },
				ENABLED: { type: "json", json: true },
			});
		});

		test("should extract kv_namespaces", ({ expect }) => {
			const config = configWithPreviews({
				kv_namespaces: [{ binding: "MY_KV", id: "kv-id-123" }],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				MY_KV: { type: "kv_namespace", namespace_id: "kv-id-123" },
			});
		});

		test("should extract d1_databases", ({ expect }) => {
			const config = configWithPreviews({
				d1_databases: [
					{ binding: "DB", database_id: "db-id-123", database_name: "my-db" },
				],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				DB: { type: "d1", database_id: "db-id-123", database_name: "my-db" },
			});
		});

		test("should extract r2_buckets", ({ expect }) => {
			const config = configWithPreviews({
				r2_buckets: [{ binding: "BUCKET", bucket_name: "my-bucket" }],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				BUCKET: { type: "r2_bucket", bucket_name: "my-bucket" },
			});
		});

		test("should extract services", ({ expect }) => {
			const config = configWithPreviews({
				services: [
					{ binding: "API", service: "api-worker", entrypoint: "default" },
				],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				API: { type: "service", service: "api-worker", entrypoint: "default" },
			});
		});

		test("should extract durable_objects bindings", ({ expect }) => {
			const config = configWithPreviews({
				durable_objects: {
					bindings: [
						{
							name: "COUNTER",
							class_name: "Counter",
							script_name: "counter-worker",
						},
					],
				},
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				COUNTER: {
					type: "durable_object_namespace",
					class_name: "Counter",
					script_name: "counter-worker",
				},
			});
		});

		test("should return empty object when no previews block", ({ expect }) => {
			const config = { ...defaultWranglerConfig, previews: undefined };
			const bindings = extractConfigBindings(config);
			expect(bindings).toEqual({});
		});

		test("should extract multiple binding types", ({ expect }) => {
			const config = configWithPreviews({
				vars: { MY_VAR: "value" },
				kv_namespaces: [{ binding: "MY_KV", id: "kv-123" }],
				d1_databases: [
					{ binding: "MY_DB", database_id: "db-123", database_name: "test" },
				],
			});
			const bindings = extractConfigBindings(config);
			expect(Object.values(bindings).map((b) => b.type)).toEqual([
				"plain_text",
				"kv_namespace",
				"d1",
			]);
		});

		test("should extract additional supported preview binding types", ({
			expect,
		}) => {
			const config = configWithPreviews({
				queues: {
					producers: [{ binding: "MY_QUEUE", queue: "queue-name" }],
				},
				vectorize: [{ binding: "MY_VECTOR", index_name: "idx" }],
				hyperdrive: [{ binding: "MY_HYPERDRIVE", id: "hyper-id" }],
				analytics_engine_datasets: [
					{ binding: "MY_AE", dataset: "dataset-name" },
				],
				browser: { binding: "MY_BROWSER" },
				stream: { binding: "MY_STREAM" },
				version_metadata: { binding: "MY_VERSION_METADATA" },
				flagship: [{ binding: "MY_FLAGS", app_id: "flagship-app-id" }],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				MY_QUEUE: { type: "queue", queue_name: "queue-name" },
				MY_VECTOR: { type: "vectorize", index_name: "idx" },
				MY_HYPERDRIVE: { type: "hyperdrive", id: "hyper-id" },
				MY_AE: { type: "analytics_engine", dataset: "dataset-name" },
				MY_BROWSER: { type: "browser" },
				MY_STREAM: { type: "stream" },
				MY_VERSION_METADATA: { type: "version_metadata" },
				MY_FLAGS: { type: "flagship", app_id: "flagship-app-id" },
			});
		});

		test("should pass cross_account_grant on service bindings", ({
			expect,
		}) => {
			const config = configWithPreviews({
				services: [
					{
						binding: "API",
						service: "api-worker",
						// cross_account_grant is internal/non-public-facing on
						// the typed schema; mirror how callers set it at
						// runtime (deploy path supports the same field).
						cross_account_grant: "grant-target",
					} as {
						binding: string;
						service: string;
						cross_account_grant: string;
					},
				],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				API: {
					type: "service",
					service: "api-worker",
					cross_account_grant: "grant-target",
				},
			});
		});

		test("should fold unsafe.bindings into the previews env", ({ expect }) => {
			const config = configWithPreviews({
				unsafe: {
					bindings: [
						{
							type: "service",
							name: "VPC_BRIDGE",
							service: "vpc-bridge-worker",
							cross_account_grant: "grant-target",
						},
					],
				},
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				VPC_BRIDGE: {
					type: "service",
					service: "vpc-bridge-worker",
					cross_account_grant: "grant-target",
				},
			});
		});
	});

	describe("preview command", () => {
		beforeEach(() => {
			vi.stubEnv("CI", undefined);
			clearPreviewMetadataEnvs();
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						vars: { ENVIRONMENT: "preview" },
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [
									{ code: 10025, message: "Preview deployment not found" },
								],
							},
							{ status: 404 }
						)
				)
			);
		});

		test("should create a new preview with defaults applied", async ({
			expect,
		}) => {
			let lookupPreviewUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						lookupPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-123",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: true, head_sampling_rate: 0.5 },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-123",
									preview_id: "preview-id-123",
									preview_name: "test-preview",
									urls: ["https://abc12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										DEFAULT_VAR: { type: "plain_text", text: "from-defaults" },
										ENVIRONMENT: { type: "plain_text", text: "preview" },
										MY_KV: {
											type: "kv_namespace",
											namespace_id: "preview-kv-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler(
				"preview --name test-preview --worker-name override-worker"
			);
			expect(lookupPreviewUrl).toContain(
				"/workers/workers/override-worker/previews/"
			);
			expect(std.out).toContain("Preview: test-preview (new)");
			expect(std.out).toContain(
				"Preview URL: https://test-preview.test-worker.cloudflare.app"
			);
			expect(std.out).toContain("Deployment ID: deployment-id-123");
			expect(std.out).toContain(
				"Deployment URL: https://abc12345.test-worker.cloudflare.app"
			);
		});

		describe("when the parent Worker does not exist", () => {
			const { setIsTTY } = useMockIsTTY();

			function mockParentWorkerNotFound() {
				const createWorkerRequests: unknown[] = [];
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
						() =>
							HttpResponse.json(
								{
									success: false,
									result: null,
									errors: [
										{
											code: 10007,
											message: "This Worker does not exist on your account.",
										},
									],
								},
								{ status: 404 }
							)
					),
					http.post(
						`*/accounts/:accountId/workers/workers`,
						async ({ request }) => {
							createWorkerRequests.push(await request.json());
							return HttpResponse.json({
								success: true,
								result: { id: "worker-id-123", name: "test-worker" },
							});
						}
					),
					http.post(
						`*/accounts/:accountId/workers/workers/:workerId/previews`,
						() =>
							HttpResponse.json({
								success: true,
								result: {
									id: "preview-id-provisioned",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview-test-worker.workers.dev"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							})
					),
					http.post(
						`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
						() =>
							HttpResponse.json({
								success: true,
								result: {
									id: "deployment-id-provisioned",
									preview_id: "preview-id-provisioned",
									preview_name: "test-preview",
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							})
					)
				);
				return createWorkerRequests;
			}

			test("creates the parent Worker with Preview URLs enabled, then creates the Preview", async ({
				expect,
			}) => {
				writeWranglerConfig(
					{
						name: "test-worker",
						main: "src/index.ts",
						workers_dev: true,
					},
					"wrangler.json"
				);
				setIsTTY(false);
				const createWorkerRequests = mockParentWorkerNotFound();

				await runWrangler("preview --name test-preview");

				expect(createWorkerRequests).toEqual([
					{
						name: "test-worker",
						subdomain: {
							enabled: true,
							previews_enabled: true,
						},
					},
				]);
				expect(std.out).toContain(
					`Worker "test-worker" does not exist yet. Would you like to create it for this Preview?`
				);
				expect(std.out).toContain(`Creating new Worker "test-worker"...`);
				expect(std.out).toContain("Preview: test-preview (new)");
			});

			describe.each([
				{
					name: "defaults Preview URLs to workers.dev",
					previewUrls: undefined,
					workersDev: undefined,
					expectedWorkersDev: false,
					expectedPreviewUrls: false,
				},
				{
					name: "defaults Preview URLs to explicit workers.dev",
					previewUrls: undefined,
					workersDev: true,
					expectedWorkersDev: true,
					expectedPreviewUrls: true,
				},
				{
					name: "respects enabled Preview URLs",
					previewUrls: true,
					workersDev: undefined,
					expectedWorkersDev: false,
					expectedPreviewUrls: true,
				},
				{
					name: "respects disabled Preview URLs",
					previewUrls: false,
					workersDev: undefined,
					expectedWorkersDev: false,
					expectedPreviewUrls: false,
				},
			])(
				"$name",
				({
					previewUrls,
					workersDev,
					expectedWorkersDev,
					expectedPreviewUrls,
				}) => {
					test("resolves subdomain settings without applying production triggers", async ({
						expect,
					}) => {
						writeWranglerConfig(
							{
								name: "test-worker",
								main: "src/index.ts",
								preview_urls: previewUrls,
								workers_dev: workersDev,
								route: "example.com/*",
								triggers: { crons: ["0 * * * *"] },
							},
							"wrangler.json"
						);
						setIsTTY(false);
						const createWorkerRequests = mockParentWorkerNotFound();

						await runWrangler("preview --name test-preview");

						expect(createWorkerRequests).toEqual([
							{
								name: "test-worker",
								subdomain: {
									enabled: expectedWorkersDev,
									previews_enabled: expectedPreviewUrls,
								},
							},
						]);
					});
				}
			);

			test("keeps JSON output parseable when creating the parent Worker", async ({
				expect,
			}) => {
				setIsTTY(false);
				mockParentWorkerNotFound();

				await runWrangler("preview --name test-preview --json");

				expect(JSON.parse(std.out)).toMatchObject({
					preview: { id: "preview-id-provisioned" },
					deployment: { id: "deployment-id-provisioned" },
				});
			});

			test("aborts without creating the parent Worker when the user declines", async ({
				expect,
			}) => {
				setIsTTY(true);
				const createWorkerRequests = mockParentWorkerNotFound();
				mockConfirm({
					text: `Worker "test-worker" does not exist yet. Would you like to create it for this Preview?`,
					result: false,
				});

				await expect(
					runWrangler("preview --name test-preview")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Cannot create a Preview because the Worker "test-worker" does not exist.]`
				);

				expect(createWorkerRequests).toEqual([]);
			});
		});

		test("should warn about top-level bindings missing from preview settings", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					kv_namespaces: [{ binding: "IMPORTANT_BINDING", id: "kv-id-123" }],
				})
			);

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-warning",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-warning",
								preview_id: "preview-id-warning",
								preview_name: "test-preview",
								urls: ["https://warn123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						})
				),
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);

			await runWrangler("preview --name test-preview");

			const warningOutput = stripVTControlCharacters(std.warn);
			const normalizedWarningOutput = warningOutput.replace(/\s+/g, " ");

			expect(normalizedWarningOutput).toContain(
				"Your configuration has diverged."
			);
			expect(normalizedWarningOutput).toContain(
				"The following bindings are configured at the top level of your Wrangler config file, but are missing from the Previews settings of your Worker."
			);
			expect(warningOutput).toContain("IMPORTANT_BINDING");
			expect(warningOutput).toContain("KV Namespace");
			expect(normalizedWarningOutput).toContain(
				'Either include these bindings in the "previews" field of your Wrangler config'
			);
			expect(normalizedWarningOutput).toContain(
				"or update the Previews settings of your Worker in the Cloudflare dashboard."
			);
		});

		test("should not warn about top-level bindings when they are present in local previews config", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					kv_namespaces: [{ binding: "IMPORTANT_BINDING", id: "kv-id-123" }],
					previews: {
						kv_namespaces: [
							{ binding: "IMPORTANT_BINDING", id: "preview-kv-id" },
						],
					},
				})
			);

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-no-warning",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-no-warning",
								preview_id: "preview-id-no-warning",
								preview_name: "test-preview",
								urls: ["https://nowarn123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						})
				),
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);

			await runWrangler("preview --name test-preview");

			expect(std.warn).not.toContain("IMPORTANT_BINDING");
		});

		test("should use flagship bindings from local previews config", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					flagship: [{ binding: "FLAGS", app_id: "production-app-id" }],
					previews: {
						flagship: [{ binding: "FLAGS", app_id: "preview-app-id" }],
					},
				})
			);

			let deploymentRequestBody:
				| {
						env?: Record<string, { type: string; app_id?: string }>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-flagship",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-flagship",
								preview_id: "preview-id-flagship",
								preview_name: "test-preview",
								urls: ["https://flags123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: deploymentRequestBody?.env ?? {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.env?.FLAGS).toMatchObject({
				type: "flagship",
				app_id: "preview-app-id",
			});
			expect(deploymentRequestBody?.env?.FLAGS).not.toMatchObject({
				app_id: "production-app-id",
			});
			expect(std.warn).not.toContain("FLAGS");
		});

		test("should not warn about inheritable top-level bindings missing from previews", async ({
			expect,
		}) => {
			mkdirSync("public", { recursive: true });
			writeFileSync("public/index.html", "<h1>Hello</h1>");
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					assets: {
						binding: "ASSETS",
						directory: "public",
					},
				})
			);

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-assets",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					() =>
						HttpResponse.json({
							success: true,
							result: { buckets: [], jwt: "assets-jwt-from-session" },
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-assets",
								preview_id: "preview-id-assets",
								preview_name: "test-preview",
								urls: ["https://assets123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						})
				),
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);

			await runWrangler("preview --name test-preview");

			expect(std.warn).not.toContain("Your configuration has diverged.");
			expect(std.warn).not.toContain("ASSETS");
		});

		test("should output preview and deployment JSON with --json", async ({
			expect,
		}) => {
			const outputFile = "./output.json";
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-json",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-json",
									preview_id: "preview-id-json",
									preview_name: "test-preview",
									urls: ["https://json123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);

			await runWrangler("preview --name test-preview --json", {
				...process.env,
				WRANGLER_OUTPUT_FILE_PATH: outputFile,
			});

			expect(std.out).toContain('"preview"');
			expect(std.out).toContain('"deployment"');
			expect(std.out).toContain('"id": "preview-id-json"');
			expect(std.out).toContain('"id": "deployment-id-json"');

			const outputEntries = readFileSync(outputFile, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line)) as OutputEntry[];

			expect(outputEntries).toContainEqual(
				expect.objectContaining({
					type: "preview",
					version: 1,
					worker_name: "test-worker",
					preview_id: "preview-id-json",
					preview_name: "test-preview",
					preview_slug: "test-preview",
					preview_urls: ["https://test-preview.test-worker.cloudflare.app"],
					deployment_id: "deployment-id-json",
					deployment_urls: ["https://json123.test-worker.cloudflare.app"],
				})
			);
		});

		test("should build correctly when using a redirected config", async ({
			expect,
		}) => {
			mkdirSync("src/lib", { recursive: true });
			mkdirSync("dist", { recursive: true });
			writeFileSync(
				"src/lib/message.ts",
				'export const MESSAGE = "redirected-message";'
			);
			writeFileSync(
				"src/index.ts",
				'do { } while (false); import { MESSAGE } from "#lib/message"; export default { fetch() { return new Response(MESSAGE); } };'
			);
			writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"#lib/*": ["src/lib/*"],
						},
					},
				})
			);
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./src/index.ts",
				},
				"./wrangler.json"
			);
			writeRedirectedWranglerConfig(
				{
					name: "test-worker",
					main: "../src/index.ts",
					userConfigPath: "./wrangler.json",
				},
				"./dist/wrangler.json"
			);

			let deploymentRequestBody:
				| {
						main_module?: string;
						modules?: PreviewDeploymentModulePart[];
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-redirected",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-redirected",
								preview_id: "preview-id-redirected",
								preview_name: "test-preview",
								urls: ["https://redirected123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			const mainModule = deploymentRequestBody?.modules?.find(
				(module) => module.name === deploymentRequestBody?.main_module
			);
			const code = decodeModuleContent(mainModule);

			expect(code).toContain("redirected-message");
		});

		test("should include dist/server chunks when using a vite no-bundle redirected config", async ({
			expect,
		}) => {
			mkdirSync("dist/server/chunks", { recursive: true });
			mkdirSync("dist/client", { recursive: true });
			mkdirSync(".wrangler/deploy", { recursive: true });
			writeFileSync(
				"dist/server/entry.mjs",
				'import { MESSAGE } from "./chunks/chunk.mjs"; export default { fetch() { return new Response(MESSAGE); } };'
			);
			writeFileSync(
				"dist/server/chunks/chunk.mjs",
				'export const MESSAGE = "chunk-message";'
			);
			writeFileSync(
				"wrangler.jsonc",
				JSON.stringify({
					name: "entry-worker",
					main: "./src/index.ts",
					compatibility_date: "2025-01-01",
				})
			);
			writeFileSync(
				"dist/server/wrangler.json",
				JSON.stringify({
					configPath: "/Users/cina/src/github/example/project/wrangler.jsonc",
					userConfigPath:
						"/Users/cina/src/github/example/project/wrangler.jsonc",
					topLevelName: "entry-worker",
					definedEnvironments: [],
					compatibility_date: "2025-01-01",
					compatibility_flags: ["nodejs_compat"],
					rules: [{ type: "ESModule", globs: ["**/*.mjs"] }],
					name: "entry-worker",
					main: "entry.mjs",
					triggers: {},
					assets: { binding: "ASSETS", directory: "../client" },
					vars: {},
					durable_objects: { bindings: [] },
					workflows: [],
					migrations: [],
					kv_namespaces: [],
					cloudchamber: {},
					send_email: [],
					queues: { producers: [], consumers: [] },
					r2_buckets: [],
					d1_databases: [],
					vectorize: [],
					ai_search_namespaces: [],
					ai_search: [],
					hyperdrive: [],
					services: [],
					analytics_engine_datasets: [],
					dispatch_namespaces: [],
					mtls_certificates: [],
					images: { binding: "IMAGES" },
					pipelines: [],
					secrets_store_secrets: [],
					unsafe_hello_world: [],
					worker_loaders: [],
					ratelimits: [],
					vpc_services: [],
					logfwdr: { bindings: [] },
					observability: { enabled: true },
					python_modules: { exclude: ["**/*.pyc"] },
					dev: {
						ip: "localhost",
						local_protocol: "http",
						upstream_protocol: "http",
						enable_containers: true,
						generate_types: false,
					},
					no_bundle: true,
				})
			);
			writeFileSync(
				".wrangler/deploy/config.json",
				JSON.stringify({
					configPath: "../../dist/server/wrangler.json",
					auxiliaryWorkers: [],
					prerenderWorkerConfigPath:
						"../../dist/server/.prerender/wrangler.json",
				})
			);

			let deploymentRequestBody:
				| {
						main_module?: string;
						modules?: PreviewDeploymentModulePart[];
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								buckets: [],
								jwt: "assets-jwt-from-session",
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-vite-nobundle",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.entry-worker.cloudflare.app"],
								worker_name: "entry-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-vite-nobundle",
								preview_id: "preview-id-vite-nobundle",
								preview_name: "test-preview",
								urls: ["https://vite-nobundle.entry-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.main_module).toBe("entry.mjs");
			expect(deploymentRequestBody?.modules).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "chunks/chunk.mjs" }),
				])
			);
		});

		test("should show existing preview status for existing preview", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						return HttpResponse.json({
							success: true,
							result: {
								id: "existing-preview-id",
								name: "test-preview",
								slug: "test-preview",
								urls: [
									"https://one.test-worker.cloudflare.app",
									"https://two.test-worker.cloudflare.app",
								],
								worker_name: "test-worker",
								observability: { enabled: true },
								created_on: new Date().toISOString(),
							},
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-456",
									preview_id: "existing-preview-id",
									preview_name: "test-preview",
									urls: [
										"https://dep-one.test-worker.cloudflare.app",
										"https://dep-two.test-worker.cloudflare.app",
									],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");
			expect(std.out).toContain("Preview: test-preview (updated)");
			expect(std.out).toContain("Preview URLs:");
			expect(std.out).toContain("  https://one.test-worker.cloudflare.app");
			expect(std.out).toContain("  https://two.test-worker.cloudflare.app");
			expect(std.out).toContain("Deployment ID: deployment-id-456");
			expect(std.out).toContain("Deployment URLs:");
			expect(std.out).toContain("  https://dep-one.test-worker.cloudflare.app");
			expect(std.out).toContain("  https://dep-two.test-worker.cloudflare.app");
			expect(std.out).not.toContain("no active URLs");
		});

		test("should note when URL arrays are empty", async ({ expect }) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-empty-urls",
									name: "empty-urls-preview",
									slug: "empty-urls-preview",
									urls: [],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-empty-urls",
									preview_id: "preview-id-empty-urls",
									preview_name: "empty-urls-preview",
									urls: [],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);

			await runWrangler("preview --name empty-urls-preview");

			const summaryLines = stripVTControlCharacters(std.out)
				.split("\n")
				.filter(
					(line) => line.startsWith("Preview") || line.startsWith("Deployment")
				);
			expect(summaryLines).toEqual([
				"Preview: empty-urls-preview (new)",
				"Deployment ID: deployment-id-empty-urls",
			]);
			expect(std.out).toContain(
				"Note: This Preview deployment has no active URLs. To get one, enable Preview Deployments on workers.dev or a custom domain. See https://developers.cloudflare.com/workers/previews/custom-domains/ for more information"
			);
		});

		test("should use the URL-encoded preview name as the Preview identifier in path params", async ({
			expect,
		}) => {
			let lookupPreviewUrl: string | undefined;
			let createDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						lookupPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-direct-name",
									name: "Feature Branch/One",
									slug: "feature-branch-one",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					({ request }) => {
						createDeploymentUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-direct-name",
									preview_id: "preview-id-direct-name",
									preview_name: "Feature Branch/One",
									urls: ["https://direct123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler(
				'preview --name "Feature Branch/One" --worker-name test-worker'
			);

			expect(lookupPreviewUrl).toContain("/previews/Feature%20Branch%2FOne");
			expect(createDeploymentUrl).toContain(
				"/previews/preview-id-direct-name/deployments"
			);
		});

		test("should work without preview_defaults", async ({ expect }) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-789",
									name: "no-defaults-preview",
									slug: "no-defaults-preview",
									urls: [
										"https://no-defaults-preview.test-worker.cloudflare.app",
									],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-789",
									preview_id: "preview-id-789",
									preview_name: "no-defaults-preview",
									urls: ["https://ghi12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										ENVIRONMENT: { type: "plain_text", text: "preview" },
										MY_KV: {
											type: "kv_namespace",
											namespace_id: "preview-kv-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);
			await runWrangler("preview --name no-defaults-preview");
			expect(std.out).toContain("Preview: no-defaults-preview (new)");
			expect(std.out).toContain("Deployment ID: deployment-id-789");
		});

		test("should show compact success output when observability is configured", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						observability: { enabled: true, head_sampling_rate: 1.0 },
					},
				})
			);
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-obs",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: true, head_sampling_rate: 1.0 },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-obs",
									preview_id: "preview-id-obs",
									preview_name: "test-preview",
									urls: ["https://obs12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);
			await runWrangler("preview --name test-preview");
			expect(std.out).toContain("Preview: test-preview (new)");
			expect(std.out).toContain("Deployment ID: deployment-id-obs");
		});

		test("should include previews tail_consumers in the preview resource request", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						tail_consumers: [{ service: "tail-worker" }],
					},
				})
			);

			let createPreviewRequestBody:
				| {
						name?: string;
						tail_consumers?: Array<{ service: string; environment?: string }>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async ({ request }) => {
						createPreviewRequestBody =
							(await request.json()) as typeof createPreviewRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-tail-consumers",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									tail_consumers: [{ name: "tail-worker" }],
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-tail-consumers",
									preview_id: "preview-id-tail-consumers",
									preview_name: "test-preview",
									urls: ["https://tail123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);

			await runWrangler("preview --name test-preview");

			expect(createPreviewRequestBody?.tail_consumers).toEqual([
				{ name: "tail-worker" },
			]);
		});

		test("should include compatibility_date in the deployment request", async ({
			expect,
		}) => {
			let deploymentRequestBody:
				| {
						compatibility_date?: string;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-compat",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;

						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-compat",
									preview_id: "preview-id-compat",
									preview_name: "test-preview",
									urls: ["https://compat12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview");
			expect(deploymentRequestBody?.compatibility_date).toBe("2025-01-01");
			expect(std.out).toContain("Deployment ID: deployment-id-compat");
		});

		test("should pass ignore_base_config query param when creating a Preview with --ignore-base-config", async ({
			expect,
		}) => {
			let createPreviewUrl: string | undefined;
			let createDeploymentUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					({ request }) => {
						createPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-ignore",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					({ request }) => {
						createDeploymentUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-ignore",
									preview_id: "preview-id-ignore",
									preview_name: "test-preview",
									urls: ["https://ignore12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview --ignore-base-config");
			expect(createPreviewUrl).toContain("?ignore_base_config=true");
			expect(createDeploymentUrl).not.toContain("ignore_base_config");
		});

		test("should include assets payload for deployment when assets are configured", async ({
			expect,
		}) => {
			mkdirSync("public", { recursive: true });
			writeFileSync("public/index.html", "<h1>Hello</h1>");
			writeFileSync("public/_headers", "/\n  Cache-Control: max-age=3600");
			writeFileSync("public/_redirects", "/old /new 301");
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					assets: { directory: "public", run_worker_first: true },
				})
			);
			let deploymentRequestBody: Record<string, unknown> | undefined;
			let uploadSessionUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-assets",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					async ({ request }) => {
						uploadSessionUrl = request.url;
						const body = (await request.json()) as { manifest?: unknown };
						expect(body.manifest).toBeDefined();
						return HttpResponse.json({
							success: true,
							result: { buckets: [], jwt: "assets-jwt-from-session" },
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as Record<string, unknown>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-assets",
									preview_id: "preview-id-assets",
									preview_name: "test-preview",
									urls: ["https://assets123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview");
			expect(uploadSessionUrl).toContain(
				"/workers/scripts/test-worker/assets-upload-session"
			);
			expect(deploymentRequestBody?.assets).toMatchObject({
				jwt: "assets-jwt-from-session",
				config: { run_worker_first: true },
			});
			expect(deploymentRequestBody?.main_module).toBeDefined();
			expect(Array.isArray(deploymentRequestBody?.modules)).toBe(true);
			// No assets binding configured, so no env entry should be emitted
			const env = deploymentRequestBody?.env as
				| Record<string, { type: string }>
				| undefined;
			const assetsEntries = Object.values(env ?? {}).filter(
				(b) => b.type === "assets"
			);
			expect(assetsEntries).toHaveLength(0);
		});

		test("should include the assets binding in env using the configured binding name", async ({
			expect,
		}) => {
			mkdirSync("public", { recursive: true });
			writeFileSync("public/index.html", "<h1>Hello</h1>");
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					assets: { directory: "public", binding: "MY_ASSETS" },
				})
			);
			let deploymentRequestBody: Record<string, unknown> | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-custom-binding",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					() =>
						HttpResponse.json({
							success: true,
							result: { buckets: [], jwt: "assets-jwt-from-session" },
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as Record<string, unknown>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-custom-binding",
									preview_id: "preview-id-custom-binding",
									preview_name: "test-preview",
									urls: ["https://custom-bind.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview");
			expect(deploymentRequestBody?.env).toMatchObject({
				MY_ASSETS: { type: "assets" },
			});
			expect(deploymentRequestBody?.env).not.toHaveProperty("ASSETS");
		});

		test("should include containers in deployment metadata and create a preview-scoped container application", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
						containers: [
							{
								class_name: "MyContainer",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			let deploymentRequestBody: Record<string, unknown> | undefined;
			let createdApplication: Record<string, unknown> | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-containers",
									name: "feature/my-branch",
									slug: "feature-my-branch",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as Record<string, unknown>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-containers",
									preview_id: "preview-id-containers",
									preview_name: "feature/my-branch",
									urls: ["https://containers.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										MY_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "MyContainer",
											namespace_id: "preview-do-ns-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.get("*/me", () =>
					HttpResponse.json({
						success: true,
						result: {
							external_account_id: "some-account-id",
							limits: { disk_mb_per_deployment: 2000 },
						},
					})
				),
				http.get("*/applications", () =>
					HttpResponse.json({ success: true, result: [] })
				),
				http.post("*/applications", async ({ request }) => {
					createdApplication = (await request.json()) as Record<
						string,
						unknown
					>;
					return HttpResponse.json({
						success: true,
						result: { id: "app-id", ...createdApplication },
					});
				})
			);
			await runWrangler("preview --name feature/my-branch");
			expect(deploymentRequestBody?.containers).toEqual([
				{ class_name: "MyContainer" },
			]);
			expect(createdApplication).toMatchObject({
				name: "test-worker_feature-my-branch_MyContainer",
				durable_objects: { namespace_id: "preview-do-ns-id" },
			});
		});

		test("should name applications from the resolved worker name", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export class OtherContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			// No top-level `name`: the worker name arrives via --worker-name, and
			// the generated application name must use it.
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [
								{ name: "MY_CONTAINER", class_name: "MyContainer" },
								{ name: "OTHER_CONTAINER", class_name: "OtherContainer" },
							],
						},
						containers: [
							{
								class_name: "MyContainer",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
							{
								class_name: "OtherContainer",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			const createdApplications: Record<string, unknown>[] = [];
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-containers",
									name: "feature/my-branch",
									slug: "feature-my-branch",
									urls: ["https://test-preview.cli-worker.cloudflare.app"],
									worker_name: "cli-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-containers",
									preview_id: "preview-id-containers",
									preview_name: "feature/my-branch",
									urls: ["https://containers.cli-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										MY_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "MyContainer",
											namespace_id: "preview-do-ns-id",
										},
										OTHER_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "OtherContainer",
											namespace_id: "other-do-ns-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get("*/me", () =>
					HttpResponse.json({
						success: true,
						result: {
							external_account_id: "some-account-id",
							limits: { disk_mb_per_deployment: 2000 },
						},
					})
				),
				http.get("*/applications", () =>
					HttpResponse.json({ success: true, result: [] })
				),
				http.post("*/applications", async ({ request }) => {
					const application = (await request.json()) as Record<string, unknown>;
					createdApplications.push(application);
					return HttpResponse.json({
						success: true,
						result: { id: "app-id", ...application },
					});
				})
			);
			await runWrangler(
				"preview --name feature/my-branch --worker-name cli-worker"
			);
			expect(createdApplications.map((a) => a.name)).toEqual([
				"cli-worker_feature-my-branch_MyContainer",
				"cli-worker_feature-my-branch_OtherContainer",
			]);
		});

		test.for([
			{
				label: "the top-level config when the preview sets none",
				previewOverrides: {},
				expected: { logs: { enabled: true } },
			},
			{
				label: "the preview config, which wins over the top-level one",
				previewOverrides: { observability: { enabled: false } },
				expected: undefined,
			},
		])(
			"should take container observability from $label",
			async ({ previewOverrides, expected }, { expect }) => {
				writeFileSync(
					"src/index.ts",
					"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
				);
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "cli-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						observability: { enabled: true },
						previews: {
							...previewOverrides,
							durable_objects: {
								bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
							},
							containers: [
								{
									class_name: "MyContainer",
									image: "registry.cloudflare.com/some-account-id/test:latest",
								},
							],
						},
					})
				);
				vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
				const createdApplications: Record<string, unknown>[] = [];
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
						() =>
							HttpResponse.json(
								{
									success: false,
									result: null,
									errors: [{ code: 10025, message: "Preview not found" }],
								},
								{ status: 404 }
							)
					),
					http.post(
						`*/accounts/:accountId/workers/workers/:workerId/previews`,
						() =>
							HttpResponse.json(
								{
									success: true,
									result: {
										id: "preview-id-containers",
										name: "feature/my-branch",
										slug: "feature-my-branch",
										urls: ["https://test-preview.cli-worker.cloudflare.app"],
										worker_name: "cli-worker",
										created_on: new Date().toISOString(),
									},
								},
								{ status: 201 }
							)
					),
					http.post(
						`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
						() =>
							HttpResponse.json(
								{
									success: true,
									result: {
										id: "deployment-id-containers",
										preview_id: "preview-id-containers",
										preview_name: "feature/my-branch",
										urls: ["https://containers.cli-worker.cloudflare.app"],
										compatibility_date: "2025-01-01",
										env: {
											MY_CONTAINER: {
												type: "durable_object_namespace",
												class_name: "MyContainer",
												namespace_id: "preview-do-ns-id",
											},
										},
										created_on: new Date().toISOString(),
									},
								},
								{ status: 201 }
							)
					),
					http.get("*/me", () =>
						HttpResponse.json({
							success: true,
							result: {
								external_account_id: "some-account-id",
								limits: { disk_mb_per_deployment: 2000 },
							},
						})
					),
					http.get("*/applications", () =>
						HttpResponse.json({ success: true, result: [] })
					),
					http.post("*/applications", async ({ request }) => {
						const application = (await request.json()) as Record<
							string,
							unknown
						>;
						createdApplications.push(application);
						return HttpResponse.json({
							success: true,
							result: { id: "app-id", ...application },
						});
					})
				);
				await runWrangler("preview --name feature/my-branch");
				expect(createdApplications).toHaveLength(1);
				const configuration = createdApplications[0]?.configuration as
					| { observability?: unknown }
					| undefined;
				expect(configuration?.observability).toEqual(expected);
			}
		);

		// `migrations` and `exports` are mutually exclusive, so each declaration
		// path needs its own config.
		test.for([
			{
				label: "migrations",
				declaration: {
					migrations: [{ tag: "v1", new_sqlite_classes: ["MyContainer"] }],
				},
			},
			{
				label: "exports",
				declaration: {
					exports: {
						MyContainer: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		])(
			"should deploy containers for a Durable Object declared by $label with no preview binding",
			async ({ declaration }, { expect }) => {
				writeFileSync(
					"src/index.ts",
					"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
				);
				// `MyContainer` is not bound under `previews.durable_objects`. It is
				// still implemented by this script and reachable over `ctx.exports`,
				// so it owns a container application.
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "test-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						...declaration,
						previews: {
							containers: [
								{
									class_name: "MyContainer",
									image: "registry.cloudflare.com/some-account-id/test:latest",
								},
							],
						},
					})
				);
				vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
				const createdApplications: Record<string, unknown>[] = [];
				let deploymentRequest: Record<string, unknown> = {};
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
						() =>
							HttpResponse.json(
								{
									success: false,
									result: null,
									errors: [{ code: 10025, message: "Preview not found" }],
								},
								{ status: 404 }
							)
					),
					http.post(
						`*/accounts/:accountId/workers/workers/:workerId/previews`,
						() =>
							HttpResponse.json(
								{
									success: true,
									result: {
										id: "preview-id-ctx-exports",
										name: "test-preview",
										slug: "test-preview",
										urls: ["https://test-preview.test-worker.cloudflare.app"],
										worker_name: "test-worker",
										created_on: new Date().toISOString(),
									},
								},
								{ status: 201 }
							)
					),
					http.post(
						`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
						async ({ request }) => {
							deploymentRequest = (await readPreviewDeploymentRequest(
								request
							)) as Record<string, unknown>;
							return HttpResponse.json(
								{
									success: true,
									result: {
										id: "deployment-id-ctx-exports",
										preview_id: "preview-id-ctx-exports",
										preview_name: "test-preview",
										urls: ["https://test-preview.test-worker.cloudflare.app"],
										compatibility_date: "2025-01-01",
										created_on: new Date().toISOString(),
									},
								},
								{ status: 201 }
							);
						}
					),
					http.get("*/me", () =>
						HttpResponse.json({
							success: true,
							result: {
								external_account_id: "some-account-id",
								limits: { disk_mb_per_deployment: 2000 },
							},
						})
					),
					http.get("*/applications", () =>
						HttpResponse.json({ success: true, result: [] })
					),
					http.post("*/applications", async ({ request }) => {
						const application = (await request.json()) as Record<
							string,
							unknown
						>;
						createdApplications.push(application);
						return HttpResponse.json({
							success: true,
							result: { id: "app-id", ...application },
						});
					}),
					// The class is unbound, so its namespace is not in the deployment
					// response and has to be resolved from the namespaces list. The
					// parent Worker's own namespace shares both the class name and the
					// `script`, so only the preview id tells them apart.
					http.get(
						"*/accounts/:accountId/workers/durable_objects/namespaces",
						() =>
							HttpResponse.json({
								success: true,
								result: [
									{
										id: "parent-do-ns-id",
										class: "MyContainer",
										name: "test-worker_MyContainer",
										script: "test-worker",
										useSqlite: true,
									},
									{
										id: "preview-do-ns-id",
										class: "MyContainer",
										name: "test-worker_test-preview_MyContainer",
										script: "test-worker",
										useSqlite: true,
										preview: {
											id: "preview-id-ctx-exports",
											slug: "test-preview",
											name: "test-preview",
										},
									},
								],
							})
					)
				);
				await runWrangler("preview --name test-preview");
				expect(createdApplications.map((a) => a.name)).toEqual([
					"test-worker_test-preview_MyContainer",
				]);
				// The deployment must also declare the class as container-backed, or
				// the runtime will not populate `ctx.container` on it.
				expect(deploymentRequest.containers).toEqual([
					{ class_name: "MyContainer" },
				]);
			}
		);

		test("should keep --json output parseable while deploying containers", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
						containers: [
							{
								class_name: "MyContainer",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			let createdApplication: Record<string, unknown> | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-json-containers",
									name: "feature/my-branch",
									slug: "feature-my-branch",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-json-containers",
									preview_id: "preview-id-json-containers",
									preview_name: "feature/my-branch",
									urls: ["https://containers.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										MY_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "MyContainer",
											namespace_id: "preview-do-ns-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get("*/me", () =>
					HttpResponse.json({
						success: true,
						result: {
							external_account_id: "some-account-id",
							limits: { disk_mb_per_deployment: 2000 },
						},
					})
				),
				http.get("*/applications", () =>
					HttpResponse.json({ success: true, result: [] })
				),
				http.post("*/applications", async ({ request }) => {
					createdApplication = (await request.json()) as Record<
						string,
						unknown
					>;
					return HttpResponse.json({
						success: true,
						result: { id: "app-id", ...createdApplication },
					});
				})
			);
			// The container progress output reaches stdout through logRaw rather
			// than console.log, so it has to be captured from the stream.
			const stdoutWrite = vi
				.spyOn(streams.stdout, "write")
				.mockImplementation(() => true);
			await runWrangler("preview --name feature/my-branch --json");

			// The container application is still created, so the quiet path
			// suppresses output without skipping work.
			expect(createdApplication).toMatchObject({
				name: "test-worker_feature-my-branch_MyContainer",
			});
			expect(stdoutWrite).not.toHaveBeenCalled();
			const parsed = JSON.parse(std.out) as {
				preview: { id: string };
				deployment: { id: string };
			};
			expect(parsed.preview.id).toBe("preview-id-json-containers");
			expect(parsed.deployment.id).toBe("deployment-id-json-containers");
		});

		// A class may be bound both locally and cross-script. Container options are
		// resolved by finding the first binding with a matching class name, so a
		// cross-script binding listed first used to make the container fail as
		// though another Worker owned it.
		test("should resolve a container whose class is also bound cross-script earlier in the config", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [
								{
									name: "FOREIGN_CONTAINER",
									class_name: "MyContainer",
									script_name: "owner-worker",
								},
								{ name: "MY_CONTAINER", class_name: "MyContainer" },
							],
						},
						containers: [
							{
								class_name: "MyContainer",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			let createdApplication: Record<string, unknown> | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-containers",
									name: "feature/my-branch",
									slug: "feature-my-branch",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-containers",
									preview_id: "preview-id-containers",
									preview_name: "feature/my-branch",
									urls: ["https://containers.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										FOREIGN_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "MyContainer",
											namespace_id: "other-worker-do-ns-id",
											script_name: "owner-worker",
										},
										MY_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "MyContainer",
											namespace_id: "preview-do-ns-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get("*/me", () =>
					HttpResponse.json({
						success: true,
						result: {
							external_account_id: "some-account-id",
							limits: { disk_mb_per_deployment: 2000 },
						},
					})
				),
				http.get("*/applications", () =>
					HttpResponse.json({ success: true, result: [] })
				),
				http.post("*/applications", async ({ request }) => {
					createdApplication = (await request.json()) as Record<
						string,
						unknown
					>;
					return HttpResponse.json({
						success: true,
						result: { id: "app-id", ...createdApplication },
					});
				})
			);

			await runWrangler("preview --name feature/my-branch");

			expect(createdApplication).toMatchObject({
				name: "test-worker_feature-my-branch_MyContainer",
				durable_objects: { namespace_id: "preview-do-ns-id" },
			});
		});

		test("should not propagate top-level containers into the preview deployment", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					durable_objects: {
						bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
					},
					migrations: [{ tag: "v1", new_sqlite_classes: ["MyContainer"] }],
					containers: [
						{
							class_name: "MyContainer",
							image: "registry.cloudflare.com/some-account-id/test:latest",
						},
					],
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
					},
				})
			);
			let deploymentRequestBody: Record<string, unknown> | undefined;
			let listApplicationsCalls = 0;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-no-inherit",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as Record<string, unknown>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-no-inherit",
									preview_id: "preview-id-no-inherit",
									preview_name: "test-preview",
									urls: ["https://noinherit.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										MY_CONTAINER: {
											type: "durable_object_namespace",
											class_name: "MyContainer",
											namespace_id: "preview-do-ns-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.get("*/applications", () => {
					listApplicationsCalls++;
					return HttpResponse.json({ success: true, result: [] });
				})
			);
			await runWrangler("preview --name test-preview");
			expect(deploymentRequestBody).not.toHaveProperty("containers");
			expect(listApplicationsCalls).toBe(0);
		});

		test("should omit containers from deployment when none are configured", async ({
			expect,
		}) => {
			let deploymentRequestBody: Record<string, unknown> | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-no-containers",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as Record<string, unknown>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-no-containers",
									preview_id: "preview-id-no-containers",
									preview_name: "test-preview",
									urls: ["https://nocontainers.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview");
			expect(deploymentRequestBody).toBeDefined();
			expect(deploymentRequestBody).not.toHaveProperty("containers");
		});

		test("should exclude containers whose DO binding has script_name set", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [
								{
									name: "EXTERNAL_CONTAINER",
									class_name: "ExternalContainer",
									script_name: "owner-worker",
								},
							],
						},
						containers: [
							{
								class_name: "ExternalContainer",
								image:
									"registry.cloudflare.com/some-account-id/external:latest",
							},
						],
					},
				})
			);
			let deploymentRequestBody: Record<string, unknown> | undefined;
			let createApplicationCalls = 0;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-cross-script",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as Record<string, unknown>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-cross-script",
									preview_id: "preview-id-cross-script",
									preview_name: "test-preview",
									urls: ["https://crossscript.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post("*/applications", () => {
					createApplicationCalls++;
					return HttpResponse.json({
						success: true,
						result: { id: "app-id" },
					});
				})
			);
			await runWrangler("preview --name test-preview");
			expect(deploymentRequestBody).not.toHaveProperty("containers");
			expect(createApplicationCalls).toBe(0);
		});

		test("should fail before creating the preview deployment when a container's class_name matches no Durable Object class", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
						// Typo: no migration, export, or preview binding declares
						// "MyContainerTypo", so this entry resolves to nothing.
						containers: [
							{
								class_name: "MyContainerTypo",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			let createDeploymentCalls = 0;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-unmatched-class",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						createDeploymentCalls++;
						return HttpResponse.json(
							{ success: true, result: {} },
							{ status: 201 }
						);
					}
				)
			);

			let errorMessage = "";
			try {
				await runWrangler("preview --name test-preview");
			} catch (e) {
				errorMessage = (e as Error).message;
			}
			expect(errorMessage).toContain(
				'The container class_name "MyContainerTypo" in "previews.containers" does not match any Durable Object class in your wrangler.json file.'
			);
			expect(errorMessage).toContain(
				'Declare the class in "migrations" or "exports", or bind it under "previews.durable_objects".'
			);
			expect(createDeploymentCalls).toBe(0);
		});

		test("should fail before creating the preview deployment when a container omits class_name", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			// A Durable Object may name its container instead of the other way
			// around, but that reference resolves against the top level
			// `containers` array, so it cannot reach a preview container.
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					containers: [
						{
							name: "my-container",
							image: "registry.cloudflare.com/some-account-id/test:latest",
						},
					],
					exports: {
						MyContainer: {
							type: "durable-object",
							storage: "sqlite",
							container: "my-container",
						},
					},
					previews: {
						containers: [
							{
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			let createDeploymentCalls = 0;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-missing-class-name",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						createDeploymentCalls++;
						return HttpResponse.json(
							{ success: true, result: {} },
							{ status: 201 }
						);
					}
				)
			);

			let errorMessage = "";
			try {
				await runWrangler("preview --name test-preview");
			} catch (e) {
				errorMessage = (e as Error).message;
			}
			expect(errorMessage).toContain(
				'A container entry in "previews.containers" is missing "class_name".'
			);
			expect(createDeploymentCalls).toBe(0);
		});

		test("should throw a UserError when no Durable Object namespace can be found for a container's class", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
						containers: [
							{
								class_name: "MyContainer",
								image: "registry.cloudflare.com/some-account-id/test:latest",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-missing-ns",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-missing-ns",
									preview_id: "preview-id-missing-ns",
									preview_name: "test-preview",
									urls: ["https://missingns.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get("*/me", () =>
					HttpResponse.json({
						success: true,
						result: {
							external_account_id: "some-account-id",
							limits: { disk_mb_per_deployment: 2000 },
						},
					})
				),
				// The only namespace for this class belongs to a different preview,
				// so the fallback must reject it rather than attach the container to
				// another preview's storage.
				http.get(
					"*/accounts/:accountId/workers/durable_objects/namespaces",
					() =>
						HttpResponse.json({
							success: true,
							result: [
								{
									id: "other-preview-do-ns-id",
									class: "MyContainer",
									name: "test-worker_other-preview_MyContainer",
									script: "test-worker",
									useSqlite: true,
									preview: {
										id: "some-other-preview-id",
										slug: "other-preview",
										name: "other-preview",
									},
								},
							],
						})
				)
			);
			await expect(runWrangler("preview --name test-preview")).rejects.toThrow(
				/no Durable Object namespace was found for class "MyContainer" in preview "test-preview"/
			);
		});

		test("should fail before creating the preview deployment when a container's image belongs to a different account", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
						containers: [
							{
								class_name: "MyContainer",
								image:
									"registry.cloudflare.com/ffffffffffffffffffffffffffffffff/test:latest",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			let createDeploymentCalls = 0;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-bad-account",
									name: "test-preview",
									slug: "test-preview",
									urls: [],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						createDeploymentCalls++;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-bad-account",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await expect(runWrangler("preview --name test-preview")).rejects.toThrow(
				/does not belong to your account/
			);
			// Creating the (empty) Preview resource itself is harmless. The
			// deployment is what actually goes live and would advertise
			// container-backed DO classes, so it must never be created for a
			// config that fails container validation.
			expect(createDeploymentCalls).toBe(0);
		});

		test("should fail before creating the preview deployment when Docker cannot be launched for a container built from a Dockerfile", async ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/bad-docker-path");
			writeFileSync(
				"src/index.ts",
				"export class MyContainer { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync("Dockerfile", "FROM scratch");
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						durable_objects: {
							bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
						},
						containers: [
							{
								class_name: "MyContainer",
								image: "./Dockerfile",
							},
						],
					},
				})
			);
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			let createDeploymentCalls = 0;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-no-docker",
									name: "test-preview",
									slug: "test-preview",
									urls: [],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						createDeploymentCalls++;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-no-docker",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			let errorMessage = "";
			try {
				await runWrangler("preview --name test-preview");
			} catch (e) {
				errorMessage = (e as Error).message;
			}
			expect(errorMessage).not.toBe("");
			expect(errorMessage).toContain(
				"The Docker CLI is needed to build the configured image before creating a preview but could not be launched."
			);
			expect(errorMessage).toContain(
				'set "image" to a prebuilt registry image instead of a Dockerfile path'
			);
			expect(createDeploymentCalls).toBe(0);
		});

		test("should fail before creating the preview deployment when the API token lacks the containers scope", async ({
			expect,
		}) => {
			writeContainerPreviewConfig();
			// The other container tests grant `containers:write`. Withholding it is
			// the point of this one: applying containers checks the scope too, but
			// not until the deployment is already live.
			vi.spyOn(user, "getScopes").mockReturnValue(["workers:write"]);
			const onCreateDeployment = vi.fn();
			mockContainerPreview({
				previewId: "preview-id-no-scope",
				onCreateDeployment,
			});
			await expect(runWrangler("preview --name test-preview")).rejects.toThrow(
				/You need 'containers:write'/
			);
			expect(onCreateDeployment).not.toHaveBeenCalled();
		});

		test("should warn that the preview is live when its containers fail to deploy, and still surface the error", async ({
			expect,
		}) => {
			writeContainerPreviewConfig();
			vi.spyOn(user, "getScopes").mockReturnValue(["containers:write"]);
			mockContainerPreview({
				previewId: "preview-id-app-fails",
				deploymentEnv: {
					MY_CONTAINER: {
						type: "durable_object_namespace",
						class_name: "MyContainer",
						namespace_id: "preview-do-ns-id",
					},
				},
			});
			msw.use(
				http.get("*/me", () =>
					HttpResponse.json({
						success: true,
						result: {
							external_account_id: "some-account-id",
							limits: { disk_mb_per_deployment: 2000 },
						},
					})
				),
				http.get("*/applications", () =>
					HttpResponse.json({ success: true, result: [] })
				),
				http.post("*/applications", () =>
					HttpResponse.json(
						{
							success: false,
							result: null,
							errors: [{ code: 2000, message: "internal" }],
						},
						{ status: 500 }
					)
				)
			);
			// The deployment is already live once the container apply fails, so the
			// warning has to say so. The underlying error must still propagate, or
			// the command would exit 0 on a half-built preview.
			await expect(runWrangler("preview --name test-preview")).rejects.toThrow(
				/Error creating application/
			);
			// `logger.warn` wraps at 100 columns, so compare on collapsed
			// whitespace rather than the wrapped form.
			expect(std.warn.replace(/\s+/g, " ")).toContain(
				'The preview "test-preview" was created, but its containers did not come up.'
			);
		});

		test("should include source maps in deployment modules when upload_source_maps is enabled", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					upload_source_maps: true,
				})
			);

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						modules?: PreviewDeploymentModulePart[];
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-sourcemaps",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-sourcemaps",
									preview_id: "preview-id-sourcemaps",
									preview_name: "test-preview",
									urls: ["https://sourcemaps123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			const sourceMap = deploymentRequestBody?.modules?.find((module) =>
				module.name.endsWith(".map")
			);

			expect(sourceMap?.content_type).toBe("application/source-map");
			expect(JSON.parse(decodeModuleContent(sourceMap))).toEqual(
				expect.objectContaining({ version: 3 })
			);
		});

		test("should use previews.define for worker bundling", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response(PREVIEW_FLAG); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					define: { PREVIEW_FLAG: '"top-level"' },
					previews: {
						define: { PREVIEW_FLAG: '"preview-value"' },
					},
				})
			);

			let deploymentRequestBody:
				| {
						main_module?: string;
						modules?: PreviewDeploymentModulePart[];
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-define",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-define",
								preview_id: "preview-id-define",
								preview_name: "test-preview",
								urls: ["https://define123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			const mainModule = deploymentRequestBody?.modules?.find(
				(module) => module.name === deploymentRequestBody?.main_module
			);
			const code = decodeModuleContent(mainModule);
			expect(code).toContain("preview-value");
			expect(code).not.toContain("top-level");
		});

		test("should use previews durable_objects for export validation", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class PreviewCounter { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					durable_objects: {
						bindings: [{ name: "COUNTER", class_name: "MissingCounter" }],
					},
					previews: {
						durable_objects: {
							bindings: [{ name: "COUNTER", class_name: "PreviewCounter" }],
						},
					},
				})
			);

			let deploymentRequestBody:
				| {
						env?: Record<
							string,
							{ type: string; class_name?: string; script_name?: string }
						>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-do",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-do",
								preview_id: "preview-id-do",
								preview_name: "test-preview",
								urls: ["https://do123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.env?.COUNTER).toMatchObject({
				type: "durable_object_namespace",
				class_name: "PreviewCounter",
			});
			expect(deploymentRequestBody?.env?.COUNTER).not.toMatchObject({
				class_name: "MissingCounter",
			});
		});

		test("should use previews workflows for export validation", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class PreviewWorkflow {} export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					workflows: [
						{ binding: "WF", name: "top", class_name: "MissingWorkflow" },
					],
					previews: {
						workflows: [
							{ binding: "WF", name: "preview", class_name: "PreviewWorkflow" },
						],
					},
				})
			);

			let deploymentRequestBody:
				| {
						env?: Record<
							string,
							{ type: string; class_name?: string; workflow_name?: string }
						>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-workflow",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-workflow",
								preview_id: "preview-id-workflow",
								preview_name: "test-preview",
								urls: ["https://workflow123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.env?.WF).toMatchObject({
				type: "workflow",
				class_name: "PreviewWorkflow",
				workflow_name: "preview",
			});
			expect(deploymentRequestBody?.env?.WF).not.toMatchObject({
				class_name: "MissingWorkflow",
				workflow_name: "top",
			});
		});

		test("should include migrations in the deployment request", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					migrations: [
						{ tag: "v1", new_classes: ["Counter"] },
						{
							tag: "v2",
							renamed_classes: [{ from: "Counter", to: "CounterV2" }],
						},
					],
				})
			);

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						migrations?: {
							new_tag?: string;
							old_tag?: string;
							steps?: unknown[];
						};
				  })
				| undefined;
			let latestDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-migrations",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					({ request }) => {
						latestDeploymentUrl = request.url;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-current",
								preview_id: "preview-id-migrations",
								preview_name: "test-preview",
								migration_tag: "v1",
								urls: ["https://current.test-worker.cloudflare.app"],
								created_on: new Date().toISOString(),
							},
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-migrations",
									preview_id: "preview-id-migrations",
									preview_name: "test-preview",
									urls: ["https://mig123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(latestDeploymentUrl).toContain(
				"/accounts/some-account-id/workers/workers/test-worker/previews/preview-id-migrations/deployments/latest"
			);
			expect(deploymentRequestBody?.migrations).toMatchObject({
				old_tag: "v1",
				new_tag: "v2",
				steps: [{ renamed_classes: [{ from: "Counter", to: "CounterV2" }] }],
			});
		});

		test("should handle first preview deployment when latest deployment is missing", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					migrations: [{ tag: "v1", new_classes: ["Counter"] }],
				})
			);

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						migrations?: {
							new_tag?: string;
							old_tag?: string;
							steps?: unknown[];
						};
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-first-migration",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [
									{
										code: 10222,
										message:
											"This Worker has no versions, which means this Worker has no content or versioned settings.",
									},
								],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-first-migration",
									preview_id: "preview-id-first-migration",
									preview_name: "test-preview",
									urls: ["https://first123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.migrations).toMatchObject({
				new_tag: "v1",
				steps: [{ new_classes: ["Counter"] }],
			});
			expect(deploymentRequestBody?.migrations?.old_tag).toBeUndefined();
		});

		test("should include deployment annotations from metadata and args", async ({
			expect,
		}) => {
			vi.stubEnv(
				"CI_PROJECT_URL",
				"https://gitlab.example.com/acme/worker-project.git"
			);
			vi.stubEnv("CI_MERGE_REQUEST_IID", "13");
			vi.stubEnv("CI_MERGE_REQUEST_TITLE", "Add a cool new feature");
			vi.stubEnv("CI_COMMIT_SHA", "abc123def456");

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						annotations?: {
							"workers/commit_sha"?: string;
							"workers/message"?: string;
							"workers/pull_request_number"?: string;
							"workers/pull_request_title"?: string;
							"workers/pull_request_url"?: string;
							"workers/repository_url"?: string;
							"workers/tag"?: string;
						};
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-annotations",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-annotations",
									preview_id: "preview-id-annotations",
									preview_name: "test-preview",
									urls: ["https://annotations123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler(
				'preview --name test-preview --tag v1.2.3 --message "preview note"'
			);

			expect(deploymentRequestBody?.annotations).toEqual({
				"workers/commit_sha": "abc123def456",
				"workers/message": "preview note",
				"workers/pull_request_number": "13",
				"workers/pull_request_title": "Add a cool new feature",
				"workers/pull_request_url":
					"https://gitlab.example.com/acme/worker-project/-/merge_requests/13",
				"workers/repository_url":
					"https://gitlab.example.com/acme/worker-project",
				"workers/tag": "v1.2.3",
			});
			expect(std.out).toContain("Pull Request:");
			expect(std.out).toContain(
				"https://gitlab.example.com/acme/worker-project/-/merge_requests/13"
			);
			expect(std.out).not.toContain("repository_url");
			expect(std.out).not.toContain("pull_request_title");
			expect(std.out).not.toContain("Add a cool new feature");
		});

		test("should fall back to HEAD commit metadata for annotations in CI", async ({
			expect,
		}) => {
			vi.stubEnv("CI", "true");
			vi.mocked(childProcess.execSync)
				.mockImplementationOnce(() => Buffer.from("true"))
				.mockImplementationOnce(() => Buffer.from("abc123def456\n"))
				.mockImplementationOnce(() => Buffer.from("true"))
				.mockImplementationOnce(() => Buffer.from("my commit message\n"));

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						annotations?: Record<string, string>;
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-ci-annotations",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-ci-annotations",
									preview_id: "preview-id-ci-annotations",
									preview_name: "test-preview",
									urls: ["https://ci123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.annotations).toEqual({
				"workers/message": "my commit message",
				"workers/tag": "abc123def456",
			});
			vi.unstubAllEnvs();
		});

		test("should inherit top-level previews config into an environment when env.previews is absent", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					placement: { mode: "smart" },
					previews: {
						observability: { enabled: true },
						vars: { TOP_LEVEL_PREVIEW: "top-value" },
						kv_namespaces: [{ binding: "TOP_KV", id: "top-kv-id" }],
					},
					env: {
						staging: {},
					},
				})
			);

			let createPreviewRequestBody:
				| {
						observability?: { enabled?: boolean };
				  }
				| undefined;
			let deploymentRequestBody:
				| {
						compatibility_date?: string;
						placement?: { mode?: string };
						env?: Record<
							string,
							{ type: string; text?: string; namespace_id?: string }
						>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async ({ request }) => {
						createPreviewRequestBody =
							(await request.json()) as typeof createPreviewRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-env-inherit",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: true },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-env-inherit",
									preview_id: "preview-id-env-inherit",
									preview_name: "test-preview",
									urls: ["https://env-inherit.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: deploymentRequestBody?.env ?? {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --env staging --name test-preview");

			expect(createPreviewRequestBody?.observability).toEqual({
				enabled: true,
			});
			expect(deploymentRequestBody?.compatibility_date).toBe("2025-01-01");
			expect(deploymentRequestBody?.placement).toEqual({ mode: "smart" });
			expect(deploymentRequestBody?.env).toMatchObject({
				TOP_LEVEL_PREVIEW: { type: "plain_text", text: "top-value" },
				TOP_KV: { type: "kv_namespace", namespace_id: "top-kv-id" },
			});
		});

		test("should use env-specific previews config instead of top-level previews config", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					limits: { cpu_ms: 100, subrequests: 200 },
					previews: {
						observability: { enabled: true },
						vars: { TOP_LEVEL_PREVIEW: "top-value" },
						kv_namespaces: [{ binding: "TOP_KV", id: "top-kv-id" }],
						limits: { cpu_ms: 25, subrequests: 125 },
					},
					env: {
						staging: {
							previews: {
								observability: { enabled: false },
								vars: { STAGE_PREVIEW: "stage-value" },
								queues: {
									producers: [{ binding: "STAGE_QUEUE", queue: "jobs" }],
								},
								limits: { subrequests: 50 },
							},
						},
					},
				})
			);

			let createPreviewRequestBody:
				| {
						observability?: { enabled?: boolean };
				  }
				| undefined;
			let deploymentRequestBody:
				| {
						compatibility_date?: string;
						limits?: { cpu_ms?: number; subrequests?: number };
						env?: Record<
							string,
							{
								type: string;
								text?: string;
								queue_name?: string;
								namespace_id?: string;
							}
						>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async ({ request }) => {
						createPreviewRequestBody =
							(await request.json()) as typeof createPreviewRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-env-override",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: false },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-env-override",
									preview_id: "preview-id-env-override",
									preview_name: "test-preview",
									urls: ["https://env-override.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: deploymentRequestBody?.env ?? {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --env staging --name test-preview");

			expect(createPreviewRequestBody?.observability).toEqual({
				enabled: false,
			});
			expect(deploymentRequestBody?.compatibility_date).toBe("2025-01-01");
			expect(deploymentRequestBody?.limits).toEqual({ subrequests: 50 });
			expect(deploymentRequestBody?.env).toMatchObject({
				STAGE_PREVIEW: { type: "plain_text", text: "stage-value" },
				STAGE_QUEUE: { type: "queue", queue_name: "jobs" },
			});
			expect(deploymentRequestBody?.env).not.toHaveProperty(
				"TOP_LEVEL_PREVIEW"
			);
			expect(deploymentRequestBody?.env).not.toHaveProperty("TOP_KV");
		});

		test("should include previews.cache in deployment request, falling back to top-level cache", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					cache: { enabled: true },
					previews: {
						vars: { ENVIRONMENT: "preview" },
					},
				})
			);

			let deploymentRequestBody:
				| {
						cache?: { enabled?: boolean };
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async () => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-cache",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-cache",
									preview_id: "preview-id-cache",
									preview_name: "test-preview",
									urls: ["https://cache.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									cache: deploymentRequestBody?.cache,
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.cache).toEqual({ enabled: true });
		});

		test("should prefer previews.cache over top-level cache in deployment request", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					cache: { enabled: true },
					previews: {
						cache: { enabled: false },
					},
				})
			);

			let deploymentRequestBody:
				| {
						cache?: { enabled?: boolean };
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async () => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-cache-override",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await readPreviewDeploymentRequest(
							request
						)) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-cache-override",
									preview_id: "preview-id-cache-override",
									preview_name: "test-preview",
									urls: ["https://cache-override.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									cache: deploymentRequestBody?.cache,
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.cache).toEqual({ enabled: false });
		});

		test("should respect env-specific worker name for preview and deployment requests", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "top-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: {
						staging: {
							name: "staging-worker",
						},
					},
				})
			);

			let getPreviewUrl: string | undefined;
			let createDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						getPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-env-worker",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "staging-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					({ request }) => {
						createDeploymentUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-env-worker",
									preview_id: "preview-id-env-worker",
									preview_name: "test-preview",
									urls: ["https://env-worker.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --env staging --name test-preview");

			expect(getPreviewUrl).toContain(
				"/workers/workers/staging-worker/previews/"
			);
			expect(createDeploymentUrl).toContain(
				"/workers/workers/staging-worker/previews/preview-id-env-worker/deployments"
			);
		});

		test("should fail before making API calls when env-specific previews config is invalid", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: {
						staging: {
							previews: {
								browser: "not-an-object",
							},
						},
					},
				})
			);

			let requested = false;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						requested = true;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await expect(
				runWrangler("preview --env staging --name test-preview")
			).rejects.toThrow(/previews\.browser/);
			expect(requested).toBe(false);
		});
	});

	describe("preview delete", () => {
		beforeEach(() => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
				})
			);
			msw.resetHandlers();
		});

		test("should delete a preview with --skip-confirmation", async ({
			expect,
		}) => {
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				"preview delete --name my-feature --skip-confirmation --worker-name test-worker"
			);
			expect(deleteUrl).toContain("/previews/my-feature");
			expect(std.out).toContain('Preview "my-feature" deleted successfully');
		});

		test("should proceed with deletion in non-interactive mode (CI fallback)", async ({
			expect,
		}) => {
			// In non-interactive/CI mode, confirm() returns the fallback value (true),
			// so deletion proceeds without prompting.
			let deleteCalled = false;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						deleteCalled = true;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				"preview delete --name my-feature --worker-name test-worker"
			);
			expect(deleteCalled).toBe(true);
			expect(std.out).toContain('Preview "my-feature" deleted successfully');
		});

		test("should use --worker-name to target the correct worker", async ({
			expect,
		}) => {
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				"preview delete --name test-branch -y --worker-name custom-worker"
			);
			expect(deleteUrl).toContain("/workers/workers/custom-worker/previews/");
		});

		test("should URL-encode the preview name when deleting", async ({
			expect,
		}) => {
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				'preview delete --name "Feature Branch/One" -y --worker-name test-worker'
			);
			expect(deleteUrl).toContain("/previews/Feature%20Branch%2FOne");
		});

		test("should respect env-specific worker name when deleting", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "top-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: { staging: { name: "staging-worker" } },
				})
			);
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler("preview delete --env staging --name test-preview -y");
			expect(deleteUrl).toContain("/workers/workers/staging-worker/previews/");
		});
	});
});
