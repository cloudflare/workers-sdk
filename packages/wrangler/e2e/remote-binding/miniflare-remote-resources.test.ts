import path from "node:path";
import dedent from "ts-dedent";
import { afterAll, assert, beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	importMiniflare,
	importWrangler,
	WranglerE2ETestHelper,
} from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import type { StartDevWorkerInput } from "../../src/api";
import type { StartRemoteProxySessionOptions } from "../../src/cli";
import type { RawConfig } from "@cloudflare/workers-utils";
import type {
	Awaitable,
	MiniflareOptions,
	Miniflare as MiniflareType,
	RemoteProxyConnectionString,
	WorkerOptions,
} from "miniflare";
import type { ExpectStatic } from "vitest";

const { startRemoteProxySession } = await importWrangler();
const { Miniflare } = await importMiniflare();

/**
 * Defines the configuration and expectations for a remote binding test case.
 */
interface TestCase {
	/** The name to display in test results */
	name: string;
	/** Whether to skip the test */
	skip?: boolean;
	/**
	 * The path to the Worker script that exercises the remote binding.
	 *
	 * This path is relative to the `workers` directory alongside this test file.
	 */
	scriptPath: string;
	/**
	 * Whether the resource can work without remote bindings opt-in
	 *
	 * When this is true this test case is also run without remote bindings configured.
	 */
	worksWithoutRemoteBindings?: boolean;
	/**
	 * We do a fetch against the Worker defined by `scriptPath` and then check the response matches all these expectations.
	 */
	expectFetchToMatch: ExpectStatic[];
	/**
	 * Setup the test case by creating any necessary resources and returning the configuration
	 * for both the remote proxy session and Miniflare.
	 *
	 * @param helper - the e2e test helper that can be used to create resources, etc.
	 * @returns the test configuration for this test case
	 */
	setup: (helper: WranglerE2ETestHelper) => Awaitable<TestConfig>;
}

/**
 * The configuration for creating a remote proxy sessions and for creating a Miniflare instance for this test case.
 */
interface TestConfig {
	/**
	 * These bindings and options objects will be merged with all the other test cases to create a single remote proxy session for all tests.
	 */
	remoteProxySessionConfig: {
		bindings: StartDevWorkerInput["bindings"];
		options?: StartRemoteProxySessionOptions;
	};
	/**
	 * The Miniflare config (mostly bindings) for this test case. This will be merged with all other test cases to create a single Miniflare instance for all tests.
	 * @param connection The URL to the remote proxy session
	 */
	miniflareConfig(
		connection: RemoteProxyConnectionString | undefined
	): Partial<WorkerOptions>;
}

const testCases: TestCase[] = [
	{
		name: "AI",
		scriptPath: "ai.js",
		setup: () => ({
			remoteProxySessionConfig: {
				bindings: {
					AI: {
						type: "ai",
					},
				},
			},
			miniflareConfig: (connection) => ({
				ai: {
					binding: "AI",
					remoteProxyConnectionString: connection,
				},
			}),
		}),
		expectFetchToMatch: [
			expect.stringMatching(/This is a response from Workers AI/),
		],
	},
	{
		name: "Browser",
		scriptPath: "browser.js",
		setup: () => ({
			remoteProxySessionConfig: {
				bindings: {
					BROWSER: {
						type: "browser",
					},
				},
			},
			miniflareConfig: (connection) => ({
				browserRendering: {
					binding: "BROWSER",
					remoteProxyConnectionString: connection,
				},
			}),
		}),
		expectFetchToMatch: [expect.stringMatching(/sessionId/)],
		worksWithoutRemoteBindings: true,
	},
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
			await helper.worker({
				entryPoint: "target-worker.js",
				workerName: targetWorkerName,
			});

			return {
				remoteProxySessionConfig: {
					bindings: {
						SERVICE: {
							type: "service",
							service: targetWorkerName,
						},
						SERVICE_WITH_ENTRYPOINT: {
							type: "service",
							entrypoint: "CustomEntrypoint",
							service: targetWorkerName,
						},
					},
				},

				miniflareConfig: (connection) => ({
					serviceBindings: {
						SERVICE: {
							name: targetWorkerName,
							remoteProxyConnectionString: connection,
						},
						SERVICE_WITH_ENTRYPOINT: {
							name: targetWorkerName,
							entrypoint: "CustomEntrypoint",
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [
			expect.stringMatching(
				JSON.stringify({
					default: "Hello from target worker",
					entrypoint: "Hello from target worker entrypoint",
					rpc: 3,
				})
			),
		],
	},
	{
		name: "KV",
		scriptPath: "kv.js",
		setup: async (helper) => {
			const ns = await helper.kv(false);
			await helper.run(
				`wrangler kv key put --remote --namespace-id=${ns} test-remote-bindings-key existing-value`
			);
			return {
				remoteProxySessionConfig: {
					bindings: {
						KV_BINDING: {
							type: "kv_namespace",
							id: ns,
						},
					},
				},
				miniflareConfig: (connection) => ({
					kvNamespaces: {
						KV_BINDING: {
							id: ns,
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [
			expect.stringMatching("The pre-existing value is: existing-value"),
		],
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
			helper.onTeardown(async () => {
				await helper.run(
					`wrangler r2 object delete --remote ${name}/test-remote-bindings-key`
				);
			});
			return {
				remoteProxySessionConfig: {
					bindings: {
						R2_BINDING: {
							type: "r2_bucket",
							bucket_name: name,
						},
					},
				},
				miniflareConfig: (connection) => ({
					r2Buckets: {
						R2_BINDING: {
							id: name,
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [
			expect.stringMatching("The pre-existing value is: existing-value"),
		],
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
			return {
				remoteProxySessionConfig: {
					bindings: {
						DB: {
							type: "d1",
							database_id: id,
						},
					},
				},
				miniflareConfig: (connection) => ({
					d1Databases: {
						DB: {
							id: id,
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [expect.stringMatching("existing-value")],
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
			return {
				remoteProxySessionConfig: {
					bindings: {
						VECTORIZE_BINDING: {
							type: "vectorize",
							index_name: name,
						},
					},
				},
				miniflareConfig: (connection) => ({
					vectorize: {
						VECTORIZE_BINDING: {
							index_name: name,
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [
			expect.stringContaining(
				`[{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","namespace":null,"metadata":{"text":"Peter Piper picked a peck of pickled peppers"},"values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]`
			),
		],
	},
	{
		name: "Images",
		scriptPath: "images.js",
		setup: () => ({
			remoteProxySessionConfig: {
				bindings: {
					IMAGES: {
						type: "images",
					},
				},
			},
			miniflareConfig: (connection) => ({
				images: {
					binding: "IMAGES",
					remoteProxyConnectionString: connection,
				},
			}),
		}),
		expectFetchToMatch: [expect.stringContaining(`image/avif`)],
	},
	{
		name: "Media",
		scriptPath: "media.js",
		setup: () => ({
			remoteProxySessionConfig: {
				bindings: {
					MEDIA: {
						type: "media",
					},
				},
			},
			miniflareConfig: (connection) => ({
				media: {
					binding: "MEDIA",
					remoteProxyConnectionString: connection,
				},
			}),
		}),
		expectFetchToMatch: [expect.stringContaining(`image/jpeg`)],
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
			// Deploy a customer's worker to the dispatch namespace
			// This doesn't need to be cleaned up, since it will be removed when the dispatch namespace is cleaned up.
			await helper.run(
				`wrangler deploy customer-worker.js --name ${customerWorkerName} --compatibility-date 2025-01-01 --dispatch-namespace ${namespace}`
			);
			return {
				remoteProxySessionConfig: {
					bindings: {
						DISPATCH: {
							type: "dispatch_namespace",
							namespace: namespace,
						},
					},
				},
				miniflareConfig: (connection) => ({
					dispatchNamespaces: {
						DISPATCH: {
							namespace: namespace,
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [
			expect.stringMatching(
				JSON.stringify({
					worker: "Hello from customer worker",
					rpc: 3,
				})
			),
		],
	},
	{
		name: "Pipelines",
		scriptPath: "pipelines.js",
		setup: () => ({
			remoteProxySessionConfig: {
				bindings: {
					PIPELINE: {
						type: "pipeline",
						pipeline: "preserve-e2e-pipelines",
					},
				},
			},
			miniflareConfig: (connection) => ({
				pipelines: {
					PIPELINE: {
						pipeline: "preserve-e2e-pipelines",
						remoteProxyConnectionString: connection,
					},
				},
			}),
		}),
		expectFetchToMatch: [expect.stringContaining(`Data sent to env.PIPELINE`)],
		worksWithoutRemoteBindings: true,
	},
	{
		name: "Email",
		scriptPath: "email.js",
		setup: () => ({
			remoteProxySessionConfig: {
				bindings: {
					EMAIL: {
						type: "send_email",
					},
				},
			},
			miniflareConfig: (connection) => ({
				email: {
					send_email: [
						{ name: "EMAIL", remoteProxyConnectionString: connection },
					],
				},
			}),
		}),
		expectFetchToMatch: [
			// This error message comes from the production binding, and so indicates that the binding has been called
			// successfully, which is all we care about. Full E2E testing of email sending would be _incredibly_ flaky
			expect.stringContaining(
				`email from example.com not allowed because domain is not owned by the same account`
			),
		],
	},
	{
		name: "VPC Service",
		scriptPath: "vpc-service.js",
		// TODO: Enable post VPC announcement
		skip: true,
		setup: async (helper) => {
			const serviceName = generateResourceName();

			// Create a real Cloudflare tunnel for testing
			const tunnelId = await helper.tunnel();

			const output = await helper.run(
				`wrangler vpc service create ${serviceName} --type http --ipv4 10.0.0.1 --http-port 8080 --tunnel-id ${tunnelId}`
			);

			// Extract service_id from output
			const match = output.stdout.match(
				/Created VPC service:\s+(?<serviceId>[\w-]+)/
			);
			const serviceId = match?.groups?.serviceId;
			assert(
				serviceId,
				"Failed to extract service ID from VPC service creation output"
			);

			helper.onTeardown(async () => {
				await helper.run(`wrangler vpc service delete ${serviceId}`);
			});

			return {
				remoteProxySessionConfig: {
					bindings: {
						VPC_SERVICE: {
							type: "vpc_service",
							service_id: serviceId,
						},
					},
				},
				miniflareConfig: (connection) => ({
					vpcServices: {
						VPC_SERVICE: {
							service_id: serviceId,
							remoteProxyConnectionString: connection,
						},
					},
				}),
			};
		},
		expectFetchToMatch: [
			// Since we're using a real tunnel but no actual network connectivity, Iris will report back an error
			// but this is considered an effective test for wrangler and vpc service bindings
			expect.stringMatching(/CONNECT failed: 503 Service Unavailable/),
		],
	},
];

if (!CLOUDFLARE_ACCOUNT_ID) {
	describe.skip(
		"Skipping remote bindings E2E tests because CLOUDFLARE_ACCOUNT_ID is not set"
	);
} else {
	describe("Remote bindings (remote proxy session enabled)", () => {
		let helper: WranglerE2ETestHelper;
		let mf: MiniflareType;
		const onTeardown = useTeardown({ timeout: testCases.length * 15_000 });
		const activeTestCases = testCases.filter((testCase) => !testCase.skip);

		beforeAll(async () => {
			helper = new WranglerE2ETestHelper(onTeardown);
			await helper.seed(path.resolve(__dirname, "./workers"));
			const testConfigs: TestConfig[] = [];
			for (const testCase of activeTestCases) {
				testConfigs.push(await testCase.setup(helper));
			}
			const remoteProxySession = await startRemoteProxySession(
				Object.assign(
					{},
					...testConfigs.map(
						(config) => config.remoteProxySessionConfig.bindings
					)
				),
				Object.assign(
					{},
					...testConfigs.map(
						(config) => config.remoteProxySessionConfig.options
					)
				)
			);

			const testCaseModules = activeTestCases.map((testCase) => ({
				type: "ESModule" as const,
				path: path.resolve(helper.tmpPath, testCase.scriptPath),
			}));

			const miniflareConfig: MiniflareOptions = Object.assign(
				{
					compatibilityDate: "2025-09-06",
					modules: [
						{
							type: "ESModule",
							path: path.resolve(helper.tmpPath, "index.js"),
						},
						...testCaseModules,
					],
					modulesRoot: helper.tmpPath,
				} satisfies MiniflareOptions,
				...testConfigs.map((config) =>
					config.miniflareConfig(remoteProxySession.remoteProxyConnectionString)
				)
			);
			mf = new Miniflare(miniflareConfig);
		}, activeTestCases.length * 15_000);

		for (const testCase of activeTestCases) {
			it("should work for " + testCase.name, async () => {
				const resp = await mf.dispatchFetch("http://example.com/", {
					headers: { "x-test-module": testCase.scriptPath },
				});
				const respText = await resp.text();
				testCase.expectFetchToMatch.forEach((match) => {
					expect(respText).toEqual(match);
				});
			});
		}
	});

	// Separate describe block for mTLS since it needs a custom remote-binding proxy worker deployment
	describe("Remote bindings (mtls)", () => {
		const mtlsTestCase: TestCase = {
			name: "mTLS",
			scriptPath: "mtls.js",
			setup: async (helper) => {
				const certificateId = await helper.cert();
				// We need to override the standard Wrangler remote proxy worker with one that has the mTLS configured.
				const workerName = generateResourceName();
				const wranglerConfig: RawConfig = {
					name: workerName,
					main: "worker.js",
					mtls_certificates: [
						{
							certificate_id: certificateId,
							binding: "MTLS",
						},
					],
				};
				await helper.seed({
					"worker.js": dedent/* javascript */ `
						export default {
							fetch(request) { return new Response("Hello"); }
						}
					`,
					"pre-deployment-wrangler.json": JSON.stringify(
						wranglerConfig,
						null,
						2
					),
				});
				// Deploy the custom remote proxy worker for this tests
				await helper.worker({
					workerName,
					configPath: "pre-deployment-wrangler.json",
				});
				return {
					remoteProxySessionConfig: {
						bindings: {
							MTLS: {
								type: "mtls_certificate",
								certificate_id: certificateId,
							},
						},
						// This is the big difference that means we cannot use the standard remote proxy worker
						// This worker needs to have mTLS certificates configured.
						options: {
							workerName,
						},
					},
					miniflareConfig: (connection) => ({
						mtlsCertificates: {
							MTLS: {
								certificate_id: certificateId,
								remoteProxyConnectionString: connection,
							},
						},
					}),
				};
			},
			expectFetchToMatch: [
				// Note: in this test we are making sure that TLS negotiation does work by checking that we get an SSL certificate error
				expect.stringMatching(/The SSL certificate error/),
				expect.not.stringMatching(/No required SSL certificate was sent/),
			],
		};

		it("should work for mTLS bindings", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed(path.resolve(__dirname, "./workers"));
			const testConfig = await mtlsTestCase.setup(helper);
			const remoteProxySession = await startRemoteProxySession(
				testConfig.remoteProxySessionConfig.bindings,
				testConfig.remoteProxySessionConfig.options
			);
			const miniflareConfig: MiniflareOptions = Object.assign(
				{
					compatibilityDate: "2025-09-06",
					modules: [
						{
							type: "ESModule",
							path: path.resolve(helper.tmpPath, mtlsTestCase.scriptPath),
						},
					],
					modulesRoot: helper.tmpPath,
				} satisfies MiniflareOptions,
				testConfig.miniflareConfig(
					remoteProxySession.remoteProxyConnectionString
				)
			);
			const mf = new Miniflare(miniflareConfig);
			const resp = await mf.dispatchFetch("http://example.com/");
			const respText = await resp.text();
			mtlsTestCase.expectFetchToMatch.forEach((match) => {
				expect(respText).toEqual(match);
			});
		});
	});
}

describe("Remote bindings (remote proxy session disabled)", () => {
	let helper: WranglerE2ETestHelper;
	let mf: MiniflareType;
	const onTeardown = useTeardown({ timeout: testCases.length * 15_000 });
	const activeTestCases = testCases.filter(
		(testCase) => !testCase.skip && testCase.worksWithoutRemoteBindings
	);

	beforeAll(async () => {
		helper = new WranglerE2ETestHelper(onTeardown);
		await helper.seed(path.resolve(__dirname, "./workers"));
		const testConfigs: TestConfig[] = [];
		for (const testCase of activeTestCases) {
			testConfigs.push(await testCase.setup(helper));
		}

		const testCaseModules = activeTestCases.map((testCase) => ({
			type: "ESModule" as const,
			path: path.resolve(helper.tmpPath, testCase.scriptPath),
		}));

		const miniflareConfig: MiniflareOptions = Object.assign(
			{
				compatibilityDate: "2025-09-06",
				modules: [
					{
						type: "ESModule",
						path: path.resolve(helper.tmpPath, "index.js"),
					},
					...testCaseModules,
				],
				modulesRoot: helper.tmpPath,
			} satisfies MiniflareOptions,
			...testConfigs.map((config) => config.miniflareConfig(undefined))
		);
		mf = new Miniflare(miniflareConfig);
	}, activeTestCases.length * 15_000);

	for (const testCase of activeTestCases) {
		it("should work for " + testCase.name, async () => {
			const resp = await mf.dispatchFetch("http://example.com/", {
				headers: { "x-test-module": testCase.scriptPath },
			});
			const respText = await resp.text();
			testCase.expectFetchToMatch.forEach((match) => {
				expect(respText).toEqual(match);
			});
		});
	}
});

function useTeardown(options: { timeout?: number } = {}) {
	const tearDownCallbacks: Array<() => Awaitable<void>> = [];
	function onTeardown(fn: () => Awaitable<void>) {
		tearDownCallbacks.push(fn);
	}
	afterAll(async () => {
		for (const fn of tearDownCallbacks.reverse()) {
			await fn();
		}
		tearDownCallbacks.length = 0;
	}, options.timeout);
	return onTeardown;
}
