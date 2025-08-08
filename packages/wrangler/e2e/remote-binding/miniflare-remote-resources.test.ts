import assert from "node:assert";
import path from "node:path";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	generateLeafCertificate,
	generateMtlsCertName,
	generateRootCertificate,
} from "../helpers/cert";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import type { startRemoteProxySession } from "../../src/api";
import type { RawConfig } from "../../src/config";
import type { RemoteProxyConnectionString, WorkerOptions } from "miniflare";
import type { ExpectStatic } from "vitest";

type TestCase<T = void> = {
	name: string;
	scriptPath: string;
	remoteProxySessionConfig:
		| Parameters<typeof startRemoteProxySession>
		| ((setup: T) => Parameters<typeof startRemoteProxySession>);
	miniflareConfig: (
		connection: RemoteProxyConnectionString,
		setup: T
	) => Partial<WorkerOptions>;
	setup?: (helper: WranglerE2ETestHelper) => Promise<T> | T;
	matches: ExpectStatic[];
	// Flag for resources that can work without remote bindings opt-in
	worksWithoutRemoteBindings?: boolean;
};
const testCases: TestCase<string>[] = [
	{
		name: "AI",
		scriptPath: "ai.js",
		remoteProxySessionConfig: [
			{
				AI: {
					type: "ai",
				},
			},
		],
		miniflareConfig: (connection) => ({
			ai: {
				binding: "AI",
				remoteProxyConnectionString: connection,
			},
		}),
		matches: [expect.stringMatching(/This is a response from Workers AI/)],
	},
	{
		name: "Browser",
		scriptPath: "browser.js",
		remoteProxySessionConfig: [
			{
				BROWSER: {
					type: "browser",
				},
			},
		],
		miniflareConfig: (connection) => ({
			browserRendering: {
				binding: "BROWSER",
				remoteProxyConnectionString: connection,
			},
		}),
		matches: [expect.stringMatching(/sessionId/)],
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
			await helper.run(
				`wrangler deploy target-worker.js --name ${targetWorkerName} --compatibility-date 2025-01-01`
			);
			onTestFinished(async () => {
				await helper.run(`wrangler delete --name ${targetWorkerName}`);
			});
			return targetWorkerName;
		},
		remoteProxySessionConfig: (target) => [
			{
				SERVICE: {
					type: "service",
					service: target,
				},
				SERVICE_WITH_ENTRYPOINT: {
					type: "service",
					entrypoint: "CustomEntrypoint",
					service: target,
				},
			},
		],
		miniflareConfig: (connection, target) => ({
			serviceBindings: {
				SERVICE: {
					name: target,
					remoteProxyConnectionString: connection,
				},
				SERVICE_WITH_ENTRYPOINT: {
					name: target,
					entrypoint: "CustomEntrypoint",
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [
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
			return ns;
		},
		remoteProxySessionConfig: (ns) => [
			{
				KV_BINDING: {
					type: "kv_namespace",
					id: ns,
				},
			},
		],
		miniflareConfig: (connection, ns) => ({
			kvNamespaces: {
				KV_BINDING: {
					id: ns,
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [
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
			onTestFinished(async () => {
				await helper.run(
					`wrangler r2 object delete --remote ${name}/test-remote-bindings-key`
				);
			});
			return name;
		},
		remoteProxySessionConfig: (name) => [
			{
				R2_BINDING: {
					type: "r2_bucket",
					bucket_name: name,
				},
			},
		],
		miniflareConfig: (connection, name) => ({
			r2Buckets: {
				R2_BINDING: {
					id: name,
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [
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
			return id;
		},
		remoteProxySessionConfig: (id) => [
			{
				DB: {
					type: "d1",
					database_id: id,
				},
			},
		],
		miniflareConfig: (connection, id) => ({
			d1Databases: {
				DB: {
					id: id,
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [expect.stringMatching("existing-value")],
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
			return name;
		},
		remoteProxySessionConfig: (name) => [
			{
				VECTORIZE_BINDING: {
					type: "vectorize",
					index_name: name,
				},
			},
		],
		miniflareConfig: (connection, name) => ({
			vectorize: {
				VECTORIZE_BINDING: {
					index_name: name,
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [
			expect.stringContaining(
				`[{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","namespace":null,"metadata":{"text":"Peter Piper picked a peck of pickled peppers"},"values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]`
			),
		],
	},
	{
		name: "Images",
		scriptPath: "images.js",
		remoteProxySessionConfig: [
			{
				IMAGES: {
					type: "images",
				},
			},
		],
		miniflareConfig: (connection) => ({
			images: {
				binding: "IMAGES",
				remoteProxyConnectionString: connection,
			},
		}),
		matches: [expect.stringContaining(`image/avif`)],
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

			return namespace;
		},
		remoteProxySessionConfig: (namespace) => [
			{
				DISPATCH: {
					type: "dispatch_namespace",
					namespace: namespace,
				},
			},
		],
		miniflareConfig: (connection, namespace) => ({
			dispatchNamespaces: {
				DISPATCH: {
					namespace: namespace,
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [
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
		remoteProxySessionConfig: [
			{
				PIPELINE: {
					type: "pipeline",
					pipeline: "preserve-e2e-pipelines",
				},
			},
		],
		miniflareConfig: (connection) => ({
			pipelines: {
				PIPELINE: {
					pipeline: "preserve-e2e-pipelines",
					remoteProxyConnectionString: connection,
				},
			},
		}),
		matches: [expect.stringContaining(`Data sent to env.PIPELINE`)],
		worksWithoutRemoteBindings: true,
	},
	{
		name: "Email",
		scriptPath: "email.js",
		remoteProxySessionConfig: [
			{
				EMAIL: {
					type: "send_email",
				},
			},
		],
		miniflareConfig: (connection) => ({
			email: {
				send_email: [
					{ name: "EMAIL", remoteProxyConnectionString: connection },
				],
			},
		}),
		matches: [
			// This error message comes from the production binding, and so indicates that the binding has been called
			// successfully, which is all we care about. Full E2E testing of email sending would be _incredibly_ flaky
			expect.stringContaining(
				`email from example.com not allowed because domain is not owned by the same account`
			),
		],
	},
];

const mtlsTest: TestCase<{ certificateId: string; workerName: string }> = {
	name: "mTLS",
	scriptPath: "mtls.js",
	setup: async (helper) => {
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

		const workerName = generateResourceName();
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

		return { certificateId, workerName };
	},
	remoteProxySessionConfig: ({ certificateId, workerName }) => [
		{
			MTLS: {
				type: "mtls_certificate",
				certificate_id: certificateId,
			},
		},
		{
			workerName,
		},
	],
	miniflareConfig: (connection, { certificateId }) => ({
		mtlsCertificates: {
			MTLS: {
				certificate_id: certificateId,
				remoteProxyConnectionString: connection,
			},
		},
	}),
	matches: [
		// Note: in this test we are making sure that TLS negotiation does work by checking that we get an SSL certificate error
		expect.stringMatching(/The SSL certificate error/),
		expect.not.stringMatching(/No required SSL certificate was sent/),
	],
};

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID).each([...testCases, mtlsTest])(
	"Remote bindings test for $name",
	(testCase) => {
		let helper: WranglerE2ETestHelper;
		beforeEach(() => {
			helper = new WranglerE2ETestHelper();
		});
		it("enabled", async () => {
			await runTestCase(testCase as TestCase<unknown>, helper);
		});
		// Ensure the test case _relies_ on remote bindings, and fails in regular local dev
		it.skipIf(testCase.worksWithoutRemoteBindings)(
			"fails when disabled",
			// Turn off retries because this test is expected to fail
			{ retry: 0, fails: true },
			async () => {
				await runTestCase(testCase as TestCase<unknown>, helper, {
					disableRemoteBindings: true,
				});
			}
		);
	}
);

async function runTestCase<T>(
	testCase: TestCase<T>,
	helper: WranglerE2ETestHelper,
	{ disableRemoteBindings } = { disableRemoteBindings: false }
) {
	const { experimental_startRemoteProxySession } =
		await helper.importWrangler();
	const { Miniflare } = await helper.importMiniflare();
	await helper.seed(path.resolve(__dirname, "./workers"));
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const setupResult = (await testCase.setup?.(helper))!;

	const remoteProxySessionConfig =
		typeof testCase.remoteProxySessionConfig === "function"
			? testCase.remoteProxySessionConfig(setupResult)
			: testCase.remoteProxySessionConfig;

	const remoteProxySession = await experimental_startRemoteProxySession(
		...remoteProxySessionConfig
	);

	const miniflareConfig = disableRemoteBindings
		? // @ts-expect-error Deliberately passing in undefined here to turn off remote bindings
			testCase.miniflareConfig(undefined)
		: testCase.miniflareConfig(
				remoteProxySession.remoteProxyConnectionString,
				setupResult
			);

	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		// @ts-expect-error TS doesn't like the spreading of miniflareConfig
		modules: true,
		scriptPath: path.resolve(helper.tmpPath, testCase.scriptPath),
		modulesRoot: helper.tmpPath,
		...miniflareConfig,
	});
	const resp = await mf.dispatchFetch("http://example.com");
	const respText = await resp.text();
	testCase.matches.forEach((match) => {
		expect(respText).toEqual(match);
	});
}
