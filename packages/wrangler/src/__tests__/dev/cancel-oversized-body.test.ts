import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import { runWrangler } from "../helpers/run-wrangler";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { StartDevOptions } from "../../dev";

/**
 * Reproduces cloudflare/workers-sdk#15709: a Worker that cancels an
 * oversized request body mid-read and answers 413 leaves the ProxyWorker's
 * pooled connection to the UserWorker torn down by workerd (the unread
 * remainder exceeds kj's canceled-upload grace, so workerd closes the
 * connection). The very next request on the same dev session then meets a
 * dead pooled connection and fails with 500 "Network connection lost"
 * instead of reaching the Worker.
 */

let stopDev: (() => Promise<void>) | undefined;
vi.mock("../../dev/start-dev", async () => {
	const actual = await vi.importActual<typeof import("../../dev/start-dev")>(
		"../../dev/start-dev"
	);
	return {
		...actual,
		async startDev(options: StartDevOptions) {
			const result = await actual.startDev(options);
			stopDev = () => result.devEnv.teardown();
			return result;
		},
	};
});

const worker = `const MAX_PAYLOAD_BYTES = 2_000_000;
export default {
	async fetch(request) {
		if (request.method !== "PUT") {
			return new Response("method not allowed", { status: 405 });
		}
		const reader = request.body?.getReader();
		if (!reader) return Response.json({ ok: true });
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_PAYLOAD_BYTES) {
				await reader.cancel();
				return Response.json({ error: "payload_too_large" }, { status: 413 });
			}
		}
		return Response.json({ ok: true });
	},
};`;

const output = mockConsoleMethods();

/** Starting a real dev server and uploading megabytes can be slow on shared runners. */
const DEV_TEST_TIMEOUT = 150_000;

async function startLocalDev() {
	await seed({
		"wrangler.jsonc": JSON.stringify({
			name: "cancel-oversized-body-dev",
			main: "index.js",
			compatibility_date: "2026-09-03",
			no_bundle: true,
		}),
		"index.js": worker,
	});
	const previousOutput = output.out;
	const stopped = runWrangler("dev --port=0 --inspector-port=0", {
		WRANGLER_CI_DISABLE_CONFIG_WATCHING: "false",
		CLOUDFLARE_API_TOKEN: undefined,
		CLOUDFLARE_ACCOUNT_ID: undefined,
	});

	const match = await Promise.race([
		vi.waitUntil(
			() =>
				output.out
					.slice(previousOutput.length)
					.match(/Ready on (?<url>http:\/\/[^:]+:\d+)/),
			{ timeout: 45_000 }
		),
		stopped.then(() => {
			throw new Error("Wrangler dev exited before ready");
		}),
	]).catch((error: unknown) => {
		throw new Error(
			`Wrangler did not become ready: ${output.out}\n${output.err}`,
			{ cause: error }
		);
	});
	const url = match?.groups?.url;
	if (!url) {
		throw new Error(`No local dev URL: ${output.out}`);
	}
	return { url, stopped };
}

async function put(url: string, body: string) {
	const response = await fetch(url + "/", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body,
	});
	// consume the body fully before continuing, as the reporter's driver did
	await response.text().catch(() => {});
	return response;
}

describe("wrangler dev after a cancelled oversized request body", () => {
	runInTempDir();

	afterEach(async () => {
		await stopDev?.();
		stopDev = undefined;
	});

	it(
		"still serves the next request after a Worker cancels an oversized body and answers 413",
		{ timeout: DEV_TEST_TIMEOUT },
		async ({ expect }) => {
			const dev = await startLocalDev();
			try {
				const small = JSON.stringify({ hello: "world" });
				// ~2.2 MB: the Worker cancels after 2,000,000 bytes, leaving
				// ~200 KB unread, well past kj's 64 KiB canceled-upload grace.
				const oversized = JSON.stringify({
					data: "x".repeat(2_200_000),
				});

				const warmup = await put(dev.url, small);
				expect(warmup.status).toBe(200);

				const oversizedResponse = await put(dev.url, oversized);
				expect(oversizedResponse.status).toBe(413);

				const target = await put(dev.url, small);
				expect(target.status).toBe(200);
			} finally {
				await stopDev?.();
				stopDev = undefined;
				await dev.stopped;
			}
		}
	);
});
