import { fileURLToPath } from "node:url";
import { createBuilder, preview } from "vite";
import { afterEach, beforeAll, describe, test } from "vitest";
import { cloudflare } from "../index";
import type { PreviewServer } from "vite";

const fixturePath = fileURLToPath(
	new URL("./fixtures/streaming-error", import.meta.url)
);

function pluginsWith(bufferPreviewResponses: boolean) {
	return [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			experimental: { bufferPreviewResponses },
		}),
	];
}

describe("preview response buffering", () => {
	// The build output is identical regardless of the flag (it only affects
	// preview), so build once up front.
	beforeAll(async () => {
		const builder = await createBuilder({
			root: fixturePath,
			logLevel: "silent",
			plugins: pluginsWith(false),
		});
		await builder.buildApp();
	});

	let previewServer: PreviewServer | undefined;

	afterEach(async () => {
		await previewServer?.close();
		previewServer = undefined;
	});

	async function startPreview(
		bufferPreviewResponses: boolean
	): Promise<string> {
		previewServer = await preview({
			root: fixturePath,
			logLevel: "silent",
			preview: { port: 0 },
			plugins: pluginsWith(bufferPreviewResponses),
		});
		const url = previewServer.resolvedUrls?.local[0];
		if (!url) {
			throw new Error("Preview server did not report a local URL");
		}
		return url.replace(/\/$/, "");
	}

	test("surfaces a mid-stream error as a 500 with the marker header when buffering is enabled", async ({
		expect,
	}) => {
		const base = await startPreview(true);
		const response = await fetch(`${base}/stream-error`);
		expect(response.status).toBe(500);
		expect(response.headers.get("x-vite-cloudflare-worker-error")).toBe("1");
	});

	test("silently truncates a mid-stream error as a 200 when buffering is disabled", async ({
		expect,
	}) => {
		const base = await startPreview(false);
		const response = await fetch(`${base}/stream-error`);
		expect(response.status).toBe(200);
		// The body is truncated to whatever was streamed before the error, with no
		// failure signalled — this is the bug the buffering option addresses.
		const text = await response.text();
		expect(text).toBe("<html><body>partial");
		expect(response.headers.get("x-vite-cloudflare-worker-error")).toBeNull();
	});

	test("passes an intentional 5xx response through unchanged (no marker header)", async ({
		expect,
	}) => {
		const base = await startPreview(true);
		const response = await fetch(`${base}/intentional-500`);
		expect(response.status).toBe(500);
		expect(await response.text()).toBe("nope");
		expect(response.headers.get("x-vite-cloudflare-worker-error")).toBeNull();
	});

	test("keeps named exports (Durable Objects) working through the wrapper", async ({
		expect,
	}) => {
		const base = await startPreview(true);
		const response = await fetch(`${base}/do`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("pong");
	});
});
