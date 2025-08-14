import assert from "node:assert";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import dedent from "ts-dedent";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	onTestFinished,
	test,
	vi,
} from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	generateLeafCertificate,
	generateMtlsCertName,
	generateRootCertificate,
} from "../helpers/cert";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { fetchText } from "../helpers/fetch-text";
import { generateResourceName } from "../helpers/generate-resource-name";
import type { RawConfig } from "../../src/config";
import type { WranglerLongLivedCommand } from "../helpers/wrangler";
import type { ExpectStatic } from "vitest";

type TestCase<T = void> = {
	name: string;
	scriptPath: string;
	setup?: (helper: WranglerE2ETestHelper, workerName: string) => Promise<T> | T;
	generateWranglerConfig: (setupResult: T) => Omit<RawConfig, "name">;
	expectedResponseMatch: ExpectStatic;
	expectedOutputMatch?: ExpectStatic;
	// Flag for resources that can work without remote bindings opt-in
	worksWithoutRemoteBindings?: boolean;
};

const testCases: TestCase<Record<string, string>>[] = [
	{
		name: "Service Binding",
		scriptPath: "service-binding.js",
		setup: async (helper) => {
			const targetWorkerName = generateResourceName();
			await helper.seed({
				"target-worker.js": dedent/* javascript */ `
					import { WorkerEntrypoint } from "cloudflare:workers"
					export default {
						fetch(request) {
							return new Response("Hello from target worker")
						}
					}
					export class CustomEntrypoint extends WorkerEntrypoint {
						fetch(request) {
							return new Response("Hello from target worker entrypoint")
						}
						add(a, b) {
							return a + b;
						}
					}
					`,
			});
			const { stdout } = await helper.run(
				`wrangler deploy target-worker.js --name ${targetWorkerName} --compatibility-date 2025-01-01`
			);
			const match = stdout.match(
				/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
			);
			assert(match?.groups);
			const deployedUrl = match.groups.url;
			await vi.waitFor(
				async () => {
					const resp = await fetch(deployedUrl);
					expect(await resp.text()).toBe("Hello from target worker");
				},
				{ interval: 1_000, timeout: 40_000 }
			);
			onTestFinished(async () => {
				await helper.run(`wrangler delete --name ${targetWorkerName}`);
			});
			return { worker: targetWorkerName };
		},
		generateWranglerConfig: ({ worker: targetWorkerName }) => ({
			main: "service-binding.js",
			compatibility_date: "2025-01-01",
			services: [
				{
					binding: "SERVICE",
					service: targetWorkerName,
					experimental_remote: true,
				},
				{
					binding: "SERVICE_WITH_ENTRYPOINT",
					service: targetWorkerName,
					entrypoint: "CustomEntrypoint",
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching(
			JSON.stringify({
				default: "Hello from target worker",
				entrypoint: "Hello from target worker entrypoint",
				rpc: 3,
			})
		),
	},
	{
		name: "AI",
		scriptPath: "ai.js",
		generateWranglerConfig: () => ({
			main: "ai.js",
			compatibility_date: "2025-01-01",
			ai: {
				binding: "AI",
				experimental_remote: true,
			},
		}),
		expectedResponseMatch: expect.stringMatching(
			"This is a response from Workers AI"
		),
		// AI bindings work without opt in flag
		worksWithoutRemoteBindings: true,
	},
	{
		name: "Browser",
		scriptPath: "browser.js",
		generateWranglerConfig: () => ({
			main: "browser.js",
			compatibility_date: "2025-01-01",
			browser: {
				binding: "BROWSER",
				experimental_remote: true,
			},
		}),
		expectedResponseMatch: expect.stringMatching(/sessionId/),
		worksWithoutRemoteBindings: true,
	},
	{
		name: "Images",
		scriptPath: "images.js",
		generateWranglerConfig: () => ({
			main: "images.js",
			compatibility_date: "2025-01-01",
			images: {
				binding: "IMAGES",
				experimental_remote: true,
			},
		}),
		expectedResponseMatch: expect.stringMatching("image/avif"),
		// The Images binding "works" without opt in flag because the current default is an older remote binding implementation
		worksWithoutRemoteBindings: true,
	},
	{
		name: "Vectorize",
		scriptPath: "vectorize.js",
		setup: async (helper) => {
			const name = await helper.vectorize(
				32,
				"euclidean",
				"well-known-vectorize"
			);
			return { name };
		},
		generateWranglerConfig: ({ name }) => ({
			main: "vectorize.js",
			compatibility_date: "2025-01-01",
			vectorize: [
				{
					binding: "VECTORIZE_BINDING",
					index_name: name,
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching(
			/a44706aa-a366-48bc-8cc1-3feffd87d548/
		),
	},
	{
		name: "Dispatch Namespace",
		scriptPath: "dispatch-namespace.js",
		setup: async (helper) => {
			const namespace = await helper.dispatchNamespace(false);
			const customerWorkerName = "remote-bindings-test-customer-worker";
			await helper.seed({
				"customer-worker.js": dedent/* javascript */ `
					import {WorkerEntrypoint} from "cloudflare:workers"
					export default class W extends WorkerEntrypoint {
						fetch(request) {
							return new Response("Hello from customer worker")
						}
						add(a, b) {
							return a + b;
						}
					}
				`,
			});
			await helper.run(
				`wrangler deploy customer-worker.js --name ${customerWorkerName} --compatibility-date 2025-01-01 --dispatch-namespace ${namespace}`
			);
			return { namespace };
		},
		generateWranglerConfig: ({ namespace }) => ({
			main: "dispatch-namespace.js",
			compatibility_date: "2025-01-01",
			dispatch_namespaces: [
				{
					binding: "DISPATCH",
					namespace: namespace,
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching(
			JSON.stringify({
				worker: "Hello from customer worker",
				rpc: 3,
			})
		),
	},
	{
		name: "KV",
		scriptPath: "kv.js",
		setup: async (helper) => {
			const ns = await helper.kv(false);
			await helper.run(
				`wrangler kv key put --remote --namespace-id=${ns} test-remote-bindings-key existing-value`
			);
			return { id: ns };
		},
		generateWranglerConfig: ({ id: namespaceId }) => ({
			main: "kv.js",
			compatibility_date: "2025-01-01",
			kv_namespaces: [
				{
					binding: "KV_BINDING",
					id: namespaceId,
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching(
			"The pre-existing value is: existing-value"
		),
	},
	{
		name: "R2",
		scriptPath: "r2.js",
		setup: async (helper) => {
			await helper.seed({ "test.txt": "existing-value" });
			const name = await helper.r2(false);
			await helper.run(
				`wrangler r2 object put --remote ${name}/test-remote-bindings-key --file test.txt`
			);
			onTestFinished(async () => {
				await helper.run(
					`wrangler r2 object delete --remote ${name}/test-remote-bindings-key`
				);
			});
			return { name };
		},
		generateWranglerConfig: ({ name: bucketName }) => ({
			main: "r2.js",
			compatibility_date: "2025-01-01",
			r2_buckets: [
				{
					binding: "R2_BINDING",
					bucket_name: bucketName,
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching(
			"The pre-existing value is: existing-value"
		),
	},
	{
		name: "D1",
		scriptPath: "d1.js",
		setup: async (helper) => {
			await helper.seed({
				"schema.sql": dedent`
					CREATE TABLE entries (key TEXT PRIMARY KEY, value TEXT);
					INSERT INTO entries (key, value) VALUES ('test-remote-bindings-key', 'existing-value');
				`,
			});
			const { id, name } = await helper.d1(false);
			await helper.run(
				`wrangler d1 execute --remote ${name} --file schema.sql`
			);
			return { id, name };
		},
		generateWranglerConfig: ({ id, name }) => ({
			main: "d1.js",
			compatibility_date: "2025-01-01",
			d1_databases: [
				{
					binding: "DB",
					database_id: id,
					database_name: name,
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching("existing-value"),
	},
	{
		name: "mTLS",
		scriptPath: "mtls.js",
		setup: async (helper, workerName) => {
			// Generate root and leaf certificates
			const { certificate: rootCert, privateKey: rootKey } =
				generateRootCertificate();
			const { certificate: leafCert, privateKey: leafKey } =
				generateLeafCertificate(rootCert, rootKey);
			// Generate filenames for concurrent e2e test environment
			const mtlsCertName = generateMtlsCertName();
			// const caCertName = generateCaCertName();
			// locally generated certs/key
			await helper.seed({ "mtls_client_cert_file.pem": leafCert });
			await helper.seed({ "mtls_client_private_key_file.pem": leafKey });
			const output = await helper.run(
				`wrangler cert upload mtls-certificate --name ${mtlsCertName} --cert mtls_client_cert_file.pem --key mtls_client_private_key_file.pem`
			);
			const match = output.stdout.match(/ID:\s+(?<certId>.*)$/m);
			const certificateId = match?.groups?.certId;
			assert(certificateId);
			await helper.seed({
				"worker.js": dedent/* javascript */ `
								export default {
									fetch(request) { return new Response("Hello"); }
								}
							`,
			});
			const wranglerConfig: RawConfig = {
				name: workerName,
				mtls_certificates: [
					{
						certificate_id: certificateId,
						binding: "MTLS",
					},
				],
			};
			await helper.seed({
				"pre-deployment-wrangler.json": JSON.stringify(wranglerConfig, null, 2),
			});
			await helper.run(
				`wrangler deploy worker.js --name ${workerName} -c pre-deployment-wrangler.json --compatibility-date 2025-01-01`
			);
			onTestFinished(async () => {
				await helper.run(`wrangler delete --name ${workerName}`);
			});
			return { certificateId };
		},
		generateWranglerConfig: ({ certificateId }) => ({
			main: "mtls.js",
			compatibility_date: "2025-01-01",
			mtls_certificates: [
				{
					binding: "MTLS",
					certificate_id: certificateId,
					experimental_remote: true,
				},
			],
		}),
		// Note: in this test we are making sure that TLS negotiation does work by checking that we get an SSL certificate error
		expectedResponseMatch: expect.stringMatching(/The SSL certificate error/),
	},
	{
		name: "Pipelines",
		scriptPath: "pipelines.js",
		generateWranglerConfig: () => ({
			main: "pipelines.js",
			compatibility_date: "2025-01-01",
			pipelines: [
				{
					binding: "PIPELINE",
					pipeline: "preserve-e2e-pipelines",
					experimental_remote: true,
				},
			],
		}),
		expectedResponseMatch: expect.stringMatching(/Data sent to env.PIPELINE/),
		// Make sure we're not hitting the local simulator (which logs a "Request received" message)
		expectedOutputMatch: expect.not.stringMatching(/Request received/),
	},
	{
		name: "Email",
		scriptPath: "email.js",
		generateWranglerConfig: () => ({
			main: "email.js",
			compatibility_date: "2025-01-01",
			send_email: [
				{
					name: "EMAIL",
					experimental_remote: true,
				},
			],
		}),
		// This error message comes from the production binding, and so indicates that the binding has been called
		// successfully, which is all we care about. Full E2E testing of email sending would be _incredibly_ flaky
		expectedResponseMatch: expect.stringMatching(
			/email from example.com not allowed because domain is not owned by the same account/
		),
		// Make sure we're not hitting the local simulator (which logs a "send_email binding called" message)
		expectedOutputMatch: expect.not.stringMatching(/send_email binding called/),
	},
];

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"Wrangler Remote Bindings E2E Tests",
	() => {
		describe.each(testCases)("$name", (testCase) => {
			let helper: WranglerE2ETestHelper;
			let workerName: string;

			beforeEach(() => {
				helper = new WranglerE2ETestHelper();
				workerName = generateResourceName();
			});

			it("works with remote bindings enabled", async () => {
				await helper.seed(path.resolve(__dirname, "./workers"));

				await writeWranglerConfig(testCase, helper, workerName);

				const worker = helper.runLongLived("wrangler dev --x-remote-bindings");

				const { url } = await worker.waitForReady();

				const response = await fetchText(url);

				expect(response).toEqual(testCase.expectedResponseMatch);
				if (testCase.expectedOutputMatch) {
					expect(await worker.currentOutput).toEqual(
						testCase.expectedOutputMatch
					);
				}
			});

			it.skipIf(testCase.worksWithoutRemoteBindings)(
				"fails when remote bindings is disabled",
				// Turn off retries because this test is expected to fail
				{ retry: 0, fails: true },
				async () => {
					await helper.seed(path.resolve(__dirname, "./workers"));

					await writeWranglerConfig(testCase, helper, workerName);

					const worker = helper.runLongLived("wrangler dev");

					const { url } = await worker.waitForReady();

					const response = await fetchText(url);
					expect(response).toEqual(testCase.expectedResponseMatch);

					// Wait for async logging (e.g. pipeline messages received)
					await setTimeout(1_000);

					if (testCase.expectedOutputMatch) {
						expect(await worker.currentOutput).toEqual(
							testCase.expectedOutputMatch
						);
					}
				}
			);
		});

		describe.sequential(
			"Sequential remote bindings tests with worker reloads",
			() => {
				let worker: WranglerLongLivedCommand;
				let helper: WranglerE2ETestHelper;
				let workerName: string;

				let url: string;

				beforeAll(async () => {
					helper = new WranglerE2ETestHelper();
					workerName = generateResourceName();
					await helper.seed(path.resolve(__dirname, "./workers"));

					await helper.seed({
						"wrangler.json": JSON.stringify(
							{
								name: "remote-bindings-sequential-test",
								main: "placeholder.js",
								compatibility_date: "2025-01-01",
							},
							null,
							2
						),
						"placeholder.js":
							"export default { fetch() { return new Response('Ready to start tests') } }",
					});

					worker = helper.runLongLived("wrangler dev --x-remote-bindings", {
						stopOnTestFinished: false,
					});

					const ready = await worker.waitForReady();
					url = ready.url;
				});
				afterAll(async () => {
					await worker.stop();
				});

				it.each(testCases)("$name with worker reload", async (testCase) => {
					await writeWranglerConfig(testCase, helper, workerName);

					await worker.waitForReload();

					await vi.waitFor(
						async () => {
							const response = await fetchText(url);
							expect(response).toEqual(testCase.expectedResponseMatch);
							if (testCase.expectedOutputMatch) {
								expect(await worker.currentOutput).toEqual(
									testCase.expectedOutputMatch
								);
							}
						},
						{ interval: 1_000, timeout: 40_000 }
					);
				});
			}
		);
	}
);

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"Wrangler Mixed Remote resources E2E Tests",
	() => {
		test("the same KV (with the same id) can be used in the same dev session both in local and remote mode", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed(path.resolve(__dirname, "./workers"));

			const kvId = await helper.kv(false);
			await helper.run(
				`wrangler kv key put --remote --namespace-id=${kvId} test-key remote-value`
			);
			await helper.run(
				`wrangler kv key put --namespace-id=${kvId} test-key local-value`
			);

			await helper.seed({
				"wrangler.json": JSON.stringify(
					{
						name: "mixed-remote-bindings-test",
						main: "mixed-kvs.js",
						compatibility_date: "2025-01-01",
						kv_namespaces: [
							{
								binding: "KV_LOCAL_BINDING",
								id: kvId,
							},
							{
								binding: "KV_REMOTE_BINDING",
								id: kvId,
								experimental_remote: true,
							},
						],
					},
					null,
					2
				),
			});

			const worker = helper.runLongLived("wrangler dev --x-remote-bindings", {
				stopOnTestFinished: false,
			});

			const { url } = await worker.waitForReady();

			const response = await fetchText(url);
			expect(response).toMatchInlineSnapshot(`
				"The kv local value is: local-value
				The kv remote value is remote-value"
			`);

			await worker.stop();
		});
	}
);

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"Wrangler dev uses a provided account_id from the wrangler config file",
	() => {
		const remoteWorkerName = generateResourceName();
		const helper = new WranglerE2ETestHelper();

		beforeAll(async () => {
			await helper.seed(path.resolve(__dirname, "./workers"));
			await helper.run(
				`wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-01-01`
			);
		}, 35_000);

		afterAll(async () => {
			await helper.run(`wrangler delete --name ${remoteWorkerName}`);
		});

		test.each(["valid", "invalid"] as const)(
			"usage with a wrangler config file with an %s account id",
			async (accountIdValidity) => {
				await helper.seed({
					"wrangler.json": JSON.stringify({
						name: "remote-bindings-test",
						main: "simple-service-binding.js",
						account_id:
							accountIdValidity === "valid"
								? CLOUDFLARE_ACCOUNT_ID
								: "invalid account id",
						compatibility_date: "2025-05-07",
						services: [
							{
								binding: "REMOTE_WORKER",
								service: remoteWorkerName,
								experimental_remote: true,
							},
						],
					}),
				});

				const worker = helper.runLongLived("wrangler dev --x-remote-bindings", {
					env: {
						...process.env,
						CLOUDFLARE_ACCOUNT_ID: undefined,
					},
				});

				const { url } = await worker.waitForReady();

				const response = await fetchText(url, 5_000);

				await worker.stop();

				if (accountIdValidity === "valid") {
					expect(response).toEqual(
						"REMOTE<WORKER>: Hello from a remote worker"
					);
					expect(await worker.output).not.toMatch(
						/A request to the Cloudflare API \(.*?\) failed\./
					);
				} else {
					expect(response).toBeNull();
					expect(await worker.output).toMatch(
						/A request to the Cloudflare API \(\/accounts\/invalid account id\/workers\/subdomain\/edge-preview\) failed\./
					);
				}
			}
		);
	}
);

async function writeWranglerConfig(
	testCase: TestCase<Record<string, string>>,
	helper: WranglerE2ETestHelper,
	workerName: string
) {
	const setupResult = (await testCase.setup?.(helper, workerName)) ?? {};

	const wranglerConfig = testCase.generateWranglerConfig(setupResult);
	await helper.seed({
		"wrangler.json": JSON.stringify(
			{ name: workerName, ...wranglerConfig },
			null,
			2
		),
	});
}
