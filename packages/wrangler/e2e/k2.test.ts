import assert from "node:assert";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { getCloudflareApiBaseUrl } from "@cloudflare/workers-utils";
import Cloudflare from "cloudflare";
import { fetch } from "undici";
import { describe, it, onTestFinished, vi } from "vitest";
import { quote } from "../src/utils/shell-quote";
import {
	CLOUDFLARE_ACCOUNT_ID,
	E2E_ACCOUNT_WORKERS_DEV_DOMAIN,
} from "./helpers/account-id";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import type { K2Stream } from "../src/k2/client";
import type { K2Producer } from "@cloudflare/config";

const streamId = "stream-v2-example";
const workerSource = `const revision = "initial";
export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname !== "/produce") return new Response(revision);
		const invalid = new URL(request.url).searchParams.has("invalid");
		const isArrayBuffer = new URL(request.url).searchParams.has("array-buffer");
		const bytes = new Uint8Array(isArrayBuffer ? [99, 4, 5, 6, 255, 99] : [99, 0, 1, 2, 255, 99]).subarray(1, 5);
		const content = invalid ? "not bytes" : isArrayBuffer ? bytes.slice().buffer : bytes;
		const result = await env.ORDERS.send([{ content, headers: { source: "wrangler-e2e", representation: isArrayBuffer ? "array-buffer" : "uint8-array" } }]);
		return Response.json(result);
	}
}`;

async function seedProducer(
	helper: WranglerE2ETestHelper,
	stream: string,
	remote?: boolean
) {
	const name = generateResourceName("k2");
	await helper.seed({
		"wrangler.json": JSON.stringify({
			name,
			main: "src/index.js",
			compatibility_date: "2025-04-28",
			k2: [{ binding: "ORDERS", stream, remote }],
		}),
		"src/index.js": workerSource,
		"package.json": JSON.stringify({ name, version: "0.0.0", private: true }),
	});
	return name;
}

describe("K2 producer configuration", () => {
	it("creates, gets, lists and deletes streams through the built CLI and an isolated API server", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		const accountId = "a".repeat(32);
		const collection = `/client/v4/accounts/${accountId}/k2/streams`;
		let created: K2Stream | undefined;
		let deleted = false;
		const authorizations: boolean[] = [];
		const requests: string[] = [];
		const server = createServer(async (request, response) => {
			authorizations.push(
				request.headers.authorization === "Bearer k2-test-token"
			);
			requests.push(`${request.method} ${request.url}`);
			response.setHeader("Content-Type", "application/json");
			if (request.method === "POST" && request.url === collection) {
				const chunks: Buffer[] = [];
				for await (const chunk of request) {
					chunks.push(Buffer.from(chunk));
				}
				const input = JSON.parse(Buffer.concat(chunks).toString());
				created = {
					...input,
					id: streamId,
					endpoint: `https://${streamId}.k2.cloudflarestorage.com/produce`,
					created_at: "2026-09-16T00:00:00Z",
					modified_at: "2026-09-16T00:00:00Z",
				};
				response.end(JSON.stringify({ success: true, result: created }));
			} else if (
				request.method === "GET" &&
				request.url === `${collection}/${streamId}`
			) {
				response.end(JSON.stringify({ success: true, result: created }));
			} else if (
				request.method === "GET" &&
				request.url?.startsWith(`${collection}?`)
			) {
				response.end(JSON.stringify({ success: true, result: [created] }));
			} else if (
				request.method === "DELETE" &&
				request.url === `${collection}/${streamId}`
			) {
				deleted = true;
				response.end(JSON.stringify({ success: true, result: {} }));
			} else {
				response.statusCode = 404;
				response.end(JSON.stringify({ success: false }));
			}
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		onTestFinished(
			() =>
				new Promise<void>((resolve, reject) =>
					server.close((err) => (err ? reject(err) : resolve()))
				)
		);
		const address = server.address();
		assert(address && typeof address !== "string");
		const env = {
			...process.env,
			CLOUDFLARE_ACCOUNT_ID: accountId,
			CLOUDFLARE_API_TOKEN: "k2-test-token",
			CLOUDFLARE_API_BASE_URL: `http://127.0.0.1:${address.port}/client/v4`,
		};
		// The API server shares this process: use asynchronous CLI processes so
		// it can serve requests while Wrangler is running.
		for (const command of [
			"wrangler k2 streams create order_events --http-enabled --retention-seconds 7200 --json",
			`wrangler k2 streams get ${streamId} --json`,
			"wrangler k2 streams list --page 2 --per-page 10 --name order --json",
		]) {
			const cli = helper.runLongLived(command, {
				env,
				stopOnTestFinished: false,
			});
			expect(await cli.exitCode).toBe(0);
			expect(JSON.parse(cli.currentOutput)).toEqual(
				command.includes(" streams list") ? [created] : created
			);
		}
		const cancelled = helper.runLongLived(
			`wrangler k2 streams delete ${streamId}`,
			{ env, stopOnTestFinished: false }
		);
		expect(await cancelled.exitCode).toBe(0);
		expect(cancelled.currentOutput).toContain("Delete cancelled.");
		expect(deleted).toBe(false);
		const deletion = helper.runLongLived(
			`wrangler k2 streams delete ${streamId} --force --json`,
			{ env, stopOnTestFinished: false }
		);
		expect(await deletion.exitCode).toBe(0);
		expect(JSON.parse(deletion.currentOutput)).toEqual({
			id: streamId,
			deleted: true,
		});
		expect(deleted).toBe(true);
		expect(created).toMatchObject({
			name: "order_events",
			retention_seconds: 7200,
			http: { enabled: true, authentication: true },
			worker_binding: { enabled: true },
		});
		expect(requests).toEqual([
			`POST ${collection}`,
			`GET ${collection}/${streamId}`,
			`GET ${collection}?page=2&per_page=10&name=order`,
			`GET ${collection}/${streamId}`,
			`GET ${collection}/${streamId}`,
			`DELETE ${collection}/${streamId}`,
		]);
		expect(authorizations).toEqual([true, true, true, true, true, true]);
	});

	it("generates self-contained producer types and builds a dry-run deployment", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await seedProducer(helper, streamId);
		const types = await helper.run("wrangler types --include-runtime=false");
		expect(types.status).toBe(0);
		const declaration = await readFile(
			path.join(helper.tmpPath, "worker-configuration.d.ts"),
			"utf8"
		);
		expect(declaration).toContain("ORDERS:");
		expect(declaration).toContain("ArrayBuffer");
		expect(declaration).toContain("Uint8Array");
		expect(declaration).toContain("retryable: boolean");
		expect(declaration).not.toContain("cloudflare:pipelines");
		expect(declaration).not.toContain("superpipe-util");
		const deployment = await helper.run("wrangler deploy --dry-run");
		expect(deployment.status).toBe(0);
		expect(deployment.stdout).toContain("K2 Stream");
		expect(deployment.stdout).toContain(streamId);
	});

	it("rejects non-string stream identifiers before deployment", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await seedProducer(helper, 42 as unknown as string);
		const result = await helper.run("wrangler deploy --dry-run");
		expect(result.status).not.toBe(0);
		expect(result.output).toContain('must have a string "stream" field');
	});

	it("rejects remote: false before starting development", async ({
		expect,
	}) => {
		const helper = new WranglerE2ETestHelper();
		await seedProducer(helper, streamId, false);
		const result = await helper.run("wrangler dev");
		expect(result.status).not.toBe(0);
		expect(result.output).toContain(
			"K2 bindings always access remote resources"
		);
		expect(result.output).toContain("remote: true");
	});
});

type Stream = K2Stream & { endpoint: string };

/** Creates an isolated stream through the CLI and registers API cleanup. */
async function createStream(helper: WranglerE2ETestHelper) {
	assert(
		CLOUDFLARE_ACCOUNT_ID,
		"CLOUDFLARE_ACCOUNT_ID is required for live K2 E2E tests"
	);
	assert(
		process.env.CLOUDFLARE_API_TOKEN,
		"CLOUDFLARE_API_TOKEN is required for live K2 E2E tests"
	);
	const client = new Cloudflare({
		apiToken: process.env.CLOUDFLARE_API_TOKEN,
		baseURL: getCloudflareApiBaseUrl({}),
		maxRetries: 0,
	});
	const collection = `/accounts/${CLOUDFLARE_ACCOUNT_ID}/k2/streams`;
	const name = generateResourceName("k2").replaceAll("-", "_");
	const created = await helper.run(
		`wrangler k2 streams create ${name} --http-enabled --retention-seconds 3600 --json`
	);
	assert(created.status === 0, "K2 stream creation command failed");
	const stream = JSON.parse(created.stdout) as Stream;
	assert(
		typeof stream.id === "string" &&
			stream.id.length > 0 &&
			stream.name === name &&
			stream.endpoint,
		"K2 stream creation failed"
	);
	helper.onTeardown(async () => {
		try {
			await client.delete(`${collection}/${encodeURIComponent(stream.id)}`, {
				timeout: 20_000,
			});
		} catch (error) {
			if (!(error instanceof Cloudflare.NotFoundError)) {
				throw error;
			}
		}
	}, 30_000);
	return stream;
}

/** Add Access credentials only to the Worker URL for this E2E account. */
function workerAccessHeaders(workerName: string, url: string) {
	const clientId = process.env.CLOUDFLARE_ACCESS_CLIENT_ID;
	const clientSecret = process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET;
	if (clientId === undefined && clientSecret === undefined) {
		return;
	}
	assert(
		clientId && clientSecret,
		"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET are required"
	);
	assert(
		new URL(url).origin ===
			`https://${workerName}.${E2E_ACCOUNT_WORKERS_DEV_DOMAIN}`,
		"Unexpected Worker URL for Cloudflare Access authentication"
	);
	return {
		"CF-Access-Client-Id": clientId,
		"CF-Access-Client-Secret": clientSecret,
	};
}

async function readProducerJsonResponse(
	response: Awaited<ReturnType<typeof fetch>>
): Promise<unknown> {
	const contentType = response.headers.get("content-type");
	if (response.status !== 200 || !contentType?.includes("application/json")) {
		const title = (await response.text())
			.match(/<title>([^<]*)<\/title>/i)?.[1]
			.slice(0, 200);
		throw new Error(
			`Producer response: HTTP ${response.status}; content-type: ${contentType}; cf-ray: ${response.headers.get("cf-ray")}; page title: ${title ?? "none"}`
		);
	}
	return response.json();
}

// Follow the shared remote E2E account configuration for stream management.
// Missing permissions or unavailable management APIs must fail, not skip.
describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("K2 stream management live E2E", () => {
	it("creates, discovers and deletes a stream", async ({ expect }) => {
		const helper = new WranglerE2ETestHelper();
		const stream = await createStream(helper);
		const details = await helper.run(
			`wrangler k2 streams get ${quote([stream.id])} --json`
		);
		expect(details.status).toBe(0);
		expect(JSON.parse(details.stdout)).toMatchObject({
			id: stream.id,
			name: stream.name,
			retention_seconds: 3600,
		});
		const listed = await helper.run(
			`wrangler k2 streams list --name ${stream.name} --json`
		);
		expect(listed.status).toBe(0);
		expect(JSON.parse(listed.stdout)).toContainEqual(
			expect.objectContaining({ id: stream.id })
		);
		const deleted = await helper.run(
			`wrangler k2 streams delete ${quote([stream.id])} --force --json`
		);
		expect(deleted.status).toBe(0);
		expect(JSON.parse(deleted.stdout)).toEqual({
			id: stream.id,
			deleted: true,
		});
		const missing = await helper.run(
			`wrangler k2 streams get ${quote([stream.id])} --json`
		);
		expect(missing.status).not.toBe(0);
		expect(missing.output).toMatch(/not found|404/i);
		const remaining = await helper.run(
			`wrangler k2 streams list --name ${stream.name} --json`
		);
		expect(remaining.status).toBe(0);
		expect(JSON.parse(remaining.stdout)).toEqual([]);
	});
});

// Stream setup/cleanup needs K2 Config Write. Binding sends use the Worker's
// capability, not a K2 Produce token.
describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("K2 producer live E2E", () => {
	it("appends ArrayBuffers through getPlatformProxy", async ({ expect }) => {
		const helper = new WranglerE2ETestHelper();
		const stream = await createStream(helper);
		await seedProducer(helper, stream.id);
		const { getPlatformProxy } = await importWrangler();
		const proxy = await getPlatformProxy<{ ORDERS: K2Producer }>({
			configPath: path.join(helper.tmpPath, "wrangler.json"),
			remoteBindings: true,
		});
		helper.onTeardown(() => proxy.dispose());
		expect(
			await proxy.env.ORDERS.send([{ content: new Uint8Array([4, 5]).buffer }])
		).toEqual({ success: true });
	});

	it.for(["deploy", "versions", "dev"] as const)(
		"appends bytes through %s",
		async (mode, { expect }) => {
			const helper = new WranglerE2ETestHelper();
			const stream = await createStream(helper);
			const workerName = await seedProducer(helper, stream.id);
			let url: string;
			let accessHeaders: ReturnType<typeof workerAccessHeaders> = undefined;
			if (mode === "dev") {
				const worker = helper.runLongLived("wrangler dev");
				url = (await worker.waitForReady(30_000)).url;
			} else {
				const deployed = await helper.worker({ workerName });
				url = deployed.deployedUrl;
				accessHeaders = workerAccessHeaders(workerName, url);
				if (mode === "versions") {
					await helper.seed({
						"src/index.js": workerSource.replace(
							'revision = "initial"',
							'revision = "uploaded"'
						),
					});
					const upload = await helper.run("wrangler versions upload");
					expect(upload.status).toBe(0);
					const versionId = upload.stdout.match(
						/Version ID:\s+([a-f\d-]+)/
					)?.[1];
					assert(versionId, "Expected the uploaded version ID");
					const deploy = await helper.run(
						`wrangler versions deploy ${versionId}@100% --yes`
					);
					expect(deploy.status).toBe(0);
					await vi.waitFor(
						async () => {
							expect(
								await (
									await fetch(url, {
										headers: accessHeaders,
										redirect: "manual",
									})
								).text()
							).toBe("uploaded");
						},
						{ timeout: 15_000, interval: 500 }
					);
				}
			}
			const produced = await fetch(new URL("/produce", url), {
				method: "POST",
				headers: accessHeaders,
				redirect: "manual",
			});
			expect(await readProducerJsonResponse(produced)).toEqual({
				success: true,
			});
			const arrayBuffer = await fetch(new URL("/produce?array-buffer", url), {
				method: "POST",
				headers: accessHeaders,
				redirect: "manual",
			});
			expect(await readProducerJsonResponse(arrayBuffer)).toEqual({
				success: true,
			});
			const invalid = await fetch(new URL("/produce?invalid", url), {
				method: "POST",
				headers: accessHeaders,
				redirect: "manual",
			});
			expect(await readProducerJsonResponse(invalid)).toMatchObject({
				success: false,
				error: { code: 10204, retryable: false },
			});
		}
	);
});
