/* eslint-disable @typescript-eslint/consistent-type-imports */
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
/* eslint-disable workers-sdk/no-vitest-import-expect -- it.each pattern and expect in vi.waitFor callbacks */
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	onTestFailed,
	vi,
} from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { Binding, StartRemoteProxySessionOptions } from "../../api";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
	mswZoneHandlers,
} from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { StartDevOptions } from "../../dev";
import type { RawConfig } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString, WorkerOptions } from "miniflare";

// Mock the startDev function to capture the devEnv so we can stop it later
// The `stopWrangler` function will be assigned in the startDev mock implementation where it has access to the `devEnv.teardown()` method.
let stopWrangler: () => Promise<void> = async () => {
	throw new Error("Stop worker not set");
};
vi.mock("../../dev/start-dev", async () => {
	const actual = await vi.importActual<typeof import("../../dev/start-dev")>(
		"../../dev/start-dev"
	);
	return {
		...actual,
		async startDev(args: StartDevOptions) {
			const result = await actual.startDev(args);
			stopWrangler = () => result.devEnv.teardown();
			return result;
		},
	};
});

// Mock the `startRemoteProxySession` function to prevent it from trying to hit the Cloudflare APIs
// The `proxyWorkerBindings` and `sessionOptions` will be assigned in the mock implementation.
const remoteProxyConnectionString = new URL(
	"http://localhost:52222/"
) as RemoteProxyConnectionString;
let proxyWorkerBindings: Record<string, Binding> | undefined;
let sessionOptions: StartRemoteProxySessionOptions | undefined;
vi.mock("../../api/remoteBindings/start-remote-proxy-session", async () => {
	const actual = await vi.importActual<
		typeof import("../../api/remoteBindings/start-remote-proxy-session")
	>("../../api/remoteBindings/start-remote-proxy-session");
	return {
		...actual,
		async startRemoteProxySession(
			remoteBindings: Record<string, Binding>,
			options: StartRemoteProxySessionOptions
		) {
			proxyWorkerBindings = remoteBindings;
			sessionOptions = options;
			return {
				ready: Promise.resolve(),
				async dispose() {},
				async updateBindings() {},
				remoteProxyConnectionString,
			};
		},
	};
});

// Mock the buildMiniflareOptions function to capture the WorkerOptions that would be passed to Miniflare
// The `workerOptions` variable will be assigned in the mock implementation.
let workerOptions: Omit<WorkerOptions, "modules">[] = [];
vi.mock("../../dev/miniflare/index.ts", async () => {
	const actual = await vi.importActual<
		typeof import("../../dev/miniflare/index.ts")
	>("../../dev/miniflare/index.ts");
	return {
		...actual,
		buildMiniflareOptions: vi
			.fn<typeof actual.buildMiniflareOptions>()
			.mockImplementation(async (...args) => {
				const options = await actual.buildMiniflareOptions(...args);
				workerOptions = options.workers.map(
					({ modules: _, modulesRoot: __, ...other }) => other
				);
				return options;
			}),
	};
});

describe("dev with remote bindings", { sequential: true, retry: 2 }, () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		msw.use(
			...mswZoneHandlers,
			...mswSuccessOauthHandlers,
			...mswSuccessUserHandlers
		);
	});

	afterEach(() => {
		// Reset the module level state between tests
		stopWrangler = async () => {
			throw new Error("Stop worker not set");
		};
		sessionOptions = undefined;
		proxyWorkerBindings = undefined;
		workerOptions = [];
	});

	// These test cases cover all the different types of remote bindings we support
	// Each one defines the Wrangler config to setup the remote binding,
	// and then the expected values for setting up the remote proxy session and Miniflare.
	const testCases: {
		name: string;
		config: RawConfig;
		expectedProxyWorkerBindings: Record<string, Binding>;
		expectedWorkerOptions: Omit<WorkerOptions, "modules">[];
	}[] = [
		{
			name: "service",
			config: {
				services: [
					{
						binding: "SERVICE",
						service: "remote-service-binding-worker",
						remote: true,
					},
					{
						binding: "SERVICE_WITH_ENTRYPOINT",
						service: "remote-service-binding-worker",
						entrypoint: "CustomEntrypoint",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				SERVICE: {
					remote: true,
					service: "remote-service-binding-worker",
					type: "service",
				},
				SERVICE_WITH_ENTRYPOINT: {
					entrypoint: "CustomEntrypoint",
					remote: true,
					service: "remote-service-binding-worker",
					type: "service",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					serviceBindings: {
						SERVICE: {
							entrypoint: undefined,
							name: "remote-service-binding-worker",
							props: undefined,
							remoteProxyConnectionString,
						},
						SERVICE_WITH_ENTRYPOINT: {
							entrypoint: "CustomEntrypoint",
							name: "remote-service-binding-worker",
							props: undefined,
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "ai",
			config: {
				ai: {
					binding: "AI",
					remote: true,
				},
			},
			expectedProxyWorkerBindings: {
				AI: {
					remote: true,
					type: "ai",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					ai: {
						binding: "AI",
						remoteProxyConnectionString,
					},
				}),
			],
		},
		{
			name: "browser render",
			config: {
				browser: {
					binding: "BROWSER",
					remote: true,
				},
			},
			expectedProxyWorkerBindings: {
				BROWSER: {
					remote: true,
					type: "browser",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					browserRendering: {
						binding: "BROWSER",
						remoteProxyConnectionString,
					},
				}),
			],
		},
		{
			name: "images",
			config: {
				images: {
					binding: "IMAGES",
					remote: true,
				},
			},
			expectedProxyWorkerBindings: {
				IMAGES: {
					remote: true,
					type: "images",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					images: {
						binding: "IMAGES",
						remoteProxyConnectionString,
					},
				}),
			],
		},
		{
			name: "vectorize",
			config: {
				vectorize: [
					{
						binding: "VECTORIZE_BINDING",
						index_name: "mock-vectorize-index",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				VECTORIZE_BINDING: {
					index_name: "mock-vectorize-index",
					remote: true,
					type: "vectorize",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					vectorize: {
						VECTORIZE_BINDING: {
							index_name: "mock-vectorize-index",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "dispatch namespace",
			config: {
				dispatch_namespaces: [
					{
						binding: "DISPATCH",
						namespace: "mock-dispatch-namespace",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				DISPATCH: {
					namespace: "mock-dispatch-namespace",
					remote: true,
					type: "dispatch_namespace",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					dispatchNamespaces: {
						DISPATCH: {
							namespace: "mock-dispatch-namespace",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "kv namespace",
			config: {
				kv_namespaces: [
					{
						binding: "KV_BINDING",
						id: "mock-kv-namespace",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				KV_BINDING: {
					id: "mock-kv-namespace",
					remote: true,
					type: "kv_namespace",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					kvNamespaces: {
						KV_BINDING: {
							id: "mock-kv-namespace",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "r2 bucket",
			config: {
				r2_buckets: [
					{
						binding: "R2_BINDING",
						bucket_name: "mock-r2-bucket",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				R2_BINDING: {
					bucket_name: "mock-r2-bucket",
					jurisdiction: undefined,
					remote: true,
					type: "r2_bucket",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					r2Buckets: {
						R2_BINDING: {
							id: "mock-r2-bucket",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "d1",
			config: {
				d1_databases: [
					{
						binding: "DB",
						database_id: "mock-d1-database-id",
						database_name: "mock-d1-database-name",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				DB: {
					database_id: "mock-d1-database-id",
					database_name: "mock-d1-database-name",
					remote: true,
					type: "d1",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					d1Databases: {
						DB: {
							id: "mock-d1-database-id",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "mtls",
			config: {
				mtls_certificates: [
					{
						binding: "MTLS",
						certificate_id: "mock-mtls-certificate-id",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				MTLS: {
					certificate_id: "mock-mtls-certificate-id",
					remote: true,
					type: "mtls_certificate",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					mtlsCertificates: {
						MTLS: {
							certificate_id: "mock-mtls-certificate-id",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "pipeline",
			config: {
				pipelines: [
					{
						binding: "PIPELINE",
						pipeline: "preserve-e2e-pipelines",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				PIPELINE: {
					pipeline: "preserve-e2e-pipelines",
					remote: true,
					type: "pipeline",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					pipelines: {
						PIPELINE: {
							pipeline: "preserve-e2e-pipelines",
							remoteProxyConnectionString,
						},
					},
				}),
			],
		},
		{
			name: "email",
			config: {
				send_email: [
					{
						name: "EMAIL",
						remote: true,
					},
				],
			},
			expectedProxyWorkerBindings: {
				EMAIL: {
					remote: true,
					type: "send_email",
				},
			},
			expectedWorkerOptions: [
				expect.objectContaining({
					email: {
						send_email: [
							{
								name: "EMAIL",
								remote: true,
								remoteProxyConnectionString,
							},
						],
					},
				}),
			],
		},
	];

	it.each(testCases)(
		"should attempt to setup remote $name bindings when starting `wrangler dev`",
		async ({ config, expectedProxyWorkerBindings, expectedWorkerOptions }) => {
			// Dump out the std out if the test fails for easier debugging
			onTestFailed(async () => console.error("Wrangler output:\n", std.out));

			await seed({
				"wrangler.jsonc": JSON.stringify(
					{
						name: "worker",
						main: "index.js",
						compatibility_date: "2025-01-01",
						...config,
					},
					null,
					2
				),
				"index.js": `export default { fetch() { return new Response("hello") } }`,
			});
			const wranglerStopped = runWrangler("dev --port=0 --inspector-port=0");

			await vi.waitFor(() => expect(std.out).toMatch(/Ready/), {
				timeout: 5_000,
			});
			expect(proxyWorkerBindings).toEqual(expectedProxyWorkerBindings);
			expect(workerOptions).toEqual(expectedWorkerOptions);
			await stopWrangler();
			await wranglerStopped;
		}
	);

	it("should attempt to setup remote $name bindings when updating config during a running `wrangler dev` session", async () => {
		const { config, expectedProxyWorkerBindings, expectedWorkerOptions } =
			testCases[0];
		await seed({
			// Start with an empty config
			"wrangler.jsonc": JSON.stringify(
				{
					name: "worker",
					main: "index.js",
					compatibility_date: "2025-01-01",
				},
				null,
				2
			),
			"index.js": `export default { fetch() { return new Response("hello") } }`,
		});
		const wranglerStopped = runWrangler("dev --port=0 --inspector-port=0", {
			// We need to turn off the WRANGLER_CI_DISABLE_CONFIG_WATCHING env var so that the ConfigController
			// enables watching for config changes, which is required to trigger reloading.
			WRANGLER_CI_DISABLE_CONFIG_WATCHING: "false",
		});
		const match = await vi.waitUntil(
			() => std.out.match(/Ready on (?<url>http:\/\/[^:]+:\d{4}.+)/),

			{ timeout: 5_000 }
		);

		// Check that there is initially no remote bindings proxy setup
		expect(proxyWorkerBindings).toEqual(undefined);

		// Let's make a fetch to the worker to prove it's running before we update the config to add the bindings
		// This also should give the config file watching time to settle.
		const url = match?.groups?.url;
		if (url === undefined) {
			throw new Error("No URL found in output");
		}
		expect((await fetch(url)).ok).toBe(true);

		// Now update the config to include the bindings
		await seed({
			"wrangler.jsonc": JSON.stringify(
				{
					name: "worker",
					main: "index.js",
					compatibility_date: "2025-01-01",
					...config,
				},
				null,
				2
			),
		});

		// Once we see the reloading message we know it has processed the config change
		await vi.waitFor(
			() => {
				expect(proxyWorkerBindings).toEqual(expectedProxyWorkerBindings);
				expect(workerOptions).toEqual(expectedWorkerOptions);
			},
			{ timeout: 5_000 }
		);

		await stopWrangler();
		await wranglerStopped;
	});

	it("should allow both local and remote KV bindings to the same namespace in a single dev session", async () => {
		await seed({
			"wrangler.jsonc": JSON.stringify(
				{
					name: "worker",
					main: "index.js",
					compatibility_date: "2025-01-01",
					kv_namespaces: [
						{
							binding: "KV_LOCAL_BINDING",
							id: "mock-kv-namespace",
						},
						{
							binding: "KV_REMOTE_BINDING",
							id: "mock-kv-namespace",
							remote: true,
						},
					],
				},
				null,
				2
			),
			"index.js": `export default { fetch() { return new Response("hello") } }`,
		});
		const wranglerStopped = runWrangler("dev --port=0 --inspector-port=0");
		await vi.waitFor(() => expect(std.out).toMatch(/Ready/), {
			timeout: 5_000,
		});
		expect(proxyWorkerBindings).toEqual({
			KV_REMOTE_BINDING: {
				id: "mock-kv-namespace",
				remote: true,
				type: "kv_namespace",
			},
		});
		expect(workerOptions).toEqual([
			expect.objectContaining({
				kvNamespaces: {
					KV_LOCAL_BINDING: {
						id: "mock-kv-namespace",
					},
					KV_REMOTE_BINDING: {
						id: "mock-kv-namespace",
						remoteProxyConnectionString,
					},
				},
			}),
		]);
		await stopWrangler();
		await wranglerStopped;
	});

	it("does not create remote bindings when `--local` is passed", async () => {
		await seed({
			"wrangler.jsonc": JSON.stringify(
				{
					name: "worker",
					main: "index.js",
					compatibility_date: "2025-01-01",
					kv_namespaces: [
						{
							binding: "KV_LOCAL_BINDING",
							id: "mock-kv-namespace",
						},
						{
							binding: "KV_REMOTE_BINDING",
							id: "mock-kv-namespace",
							remote: true,
						},
					],
				},
				null,
				2
			),
			"index.js": `export default { fetch() { return new Response("hello") } }`,
		});
		const wranglerStopped = runWrangler("dev --local");
		await vi.waitFor(() => expect(std.out).toMatch(/Ready/), {
			timeout: 5_000,
		});
		const bindingsPrintStart = std.out.indexOf(
			"Your Worker has access to the following bindings:"
		);
		const bindingsPrintEnd = std.out.indexOf("⎔ Starting local server...") - 1;
		expect(std.out.slice(bindingsPrintStart, bindingsPrintEnd))
			.toMatchInlineSnapshot(`
			"Your Worker has access to the following bindings:
			Binding                                        Resource          Mode
			env.KV_LOCAL_BINDING (mock-kv-namespace)       KV Namespace      local
			env.KV_REMOTE_BINDING (mock-kv-namespace)      KV Namespace      local
			"
		`);
		expect(proxyWorkerBindings).toEqual(undefined);
		expect(workerOptions).toEqual([
			expect.objectContaining({
				kvNamespaces: {
					KV_LOCAL_BINDING: {
						id: "mock-kv-namespace",
					},
					KV_REMOTE_BINDING: {
						id: "mock-kv-namespace",
					},
				},
			}),
		]);
		await stopWrangler();
		await wranglerStopped;
	});

	it("uses the provided api token and account id when starting the remote proxy session", async () => {
		await seed({
			"wrangler.jsonc": JSON.stringify(
				{
					name: "worker",
					main: "index.js",
					compatibility_date: "2025-01-01",
					services: [
						{
							binding: "REMOTE_WORKER",
							service: "remote-service-binding-worker",
							remote: true,
						},
					],
				},
				null,
				2
			),
			"index.js": `export default { fetch() { return new Response("hello") } }`,
		});
		const wranglerStopped = runWrangler("dev --port=0 --inspector-port=0");
		await vi.waitFor(() => expect(std.out).toMatch(/Ready/), {
			timeout: 5_000,
		});
		expect(sessionOptions).toEqual({
			auth: {
				accountId: "some-account-id",
				apiToken: {
					apiToken: "some-api-token",
				},
			},
			complianceRegion: undefined,
			workerName: "worker",
		});
		await stopWrangler();
		await wranglerStopped;
	});

	it("uses the account_id in the config when starting the remote proxy session", async () => {
		await seed({
			"wrangler.jsonc": JSON.stringify(
				{
					name: "worker",
					main: "index.js",
					compatibility_date: "2025-01-01",
					account_id: "mock-account-id",
					services: [
						{
							binding: "REMOTE_WORKER",
							service: "remote-service-binding-worker",
							remote: true,
						},
					],
				},
				null,
				2
			),
			"index.js": `export default { fetch() { return new Response("hello") } }`,
		});
		const wranglerStopped = runWrangler(
			"dev --x-provision=false --port=0 --inspector-port=0"
		);
		await vi.waitFor(() => expect(std.out).toMatch(/Ready/), {
			timeout: 5_000,
		});

		expect(sessionOptions).toEqual({
			auth: {
				accountId: "mock-account-id",
				apiToken: {
					apiToken: "some-api-token",
				},
			},
			complianceRegion: undefined,
			workerName: "worker",
		});

		await stopWrangler();

		await wranglerStopped;
	});
});
