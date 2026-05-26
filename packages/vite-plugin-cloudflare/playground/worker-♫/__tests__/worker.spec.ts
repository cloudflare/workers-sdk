import * as fs from "node:fs";
import * as path from "node:path";
import { test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	rootDir,
	serverLogs,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

test("basic hello-world functionality", async ({ expect }) => {
	await vi.waitFor(
		async () => expect(await getTextResponse()).toEqual("Hello World!"),
		WAIT_FOR_OPTIONS
	);
});

test("the project path can contain a non-ascii character", async ({
	expect,
}) => {
	// For context see https://github.com/cloudflare/workers-sdk/issues/10717
	expect(rootDir).toContain("♫");
});

test("preserves entry signatures", async ({ expect }) => {
	expect(serverLogs.info.join()).toContain("__preserves-entry-signatures__");
});

test("basic dev logging (with the default logLevel: info)", async ({
	expect,
}) => {
	expect(serverLogs.info.join()).toContain("__console log__");
	expect(serverLogs.info.join()).toContain("__console debug__");
	expect(serverLogs.errors.join()).toContain("__console error__");
	expect(serverLogs.warns.join()).toContain("__console warn__");

	// Historically we've been printing warnings as errors, that's why we also include the following check
	expect(serverLogs.errors.join()).not.toContain("__console warn__");
});

test("receives the original `x-forwarded-host` header if it is set", async ({
	expect,
}) => {
	const response = await fetch(`${viteTestUrl}/x-forwarded-host`, {
		headers: { "x-forwarded-host": "example.com:8080" },
	});

	expect(await response.text()).toBe("example.com:8080");
});

test("receives the Vite server host as the `x-forwarded-host` header if the `x-forwarded-host` header is not set", async ({
	expect,
}) => {
	const testUrl = new URL(viteTestUrl);
	await vi.waitFor(
		async () =>
			expect(await getTextResponse("/x-forwarded-host")).toEqual(testUrl.host),
		WAIT_FOR_OPTIONS
	);
});

test("receives the original Host header", async ({ expect }) => {
	const testUrl = new URL(viteTestUrl);
	await vi.waitFor(async () => {
		expect(await getTextResponse("/host-header")).toBe(testUrl.host);
	}, WAIT_FOR_OPTIONS);
});

// https://github.com/cloudflare/workers-sdk/issues/13801
test("honors `X-Forwarded-Proto: https` when constructing `request.url`", async ({
	expect,
}) => {
	const response = await fetch(`${viteTestUrl}/request-url`, {
		headers: { "x-forwarded-proto": "https" },
	});
	const url = new URL(await response.text());
	expect(url.protocol).toBe("https:");
});

test("falls back to `http://` for `request.url` when no proxy header is set", async ({
	expect,
}) => {
	await vi.waitFor(async () => {
		const url = new URL(await getTextResponse("/request-url"));
		expect(url.protocol).toBe("http:");
	}, WAIT_FOR_OPTIONS);
});

test("does not cause unhandled rejection", async ({ expect }) => {
	expect(serverLogs.errors.join()).not.toContain("__unhandled rejection__");
});

test.runIf(!isBuild)(
	"updates using HMR code in Worker entry file",
	async ({ expect }) => {
		// Touch the worker entry file to trigger a HMR update.
		const workerEntryPath = path.join(rootDir, "src", "index.ts");
		const originalContent = fs.readFileSync(workerEntryPath, "utf-8");
		fs.writeFileSync(workerEntryPath, originalContent);

		await vi.waitFor(() => {
			expect(serverLogs.info.join()).toContain("[vite] hot updated");
		}, WAIT_FOR_OPTIONS);
	}
);

test.runIf(isBuild)(
	"does not set `upload_source_maps` when `build.sourcemap` is disabled",
	({ expect }) => {
		const wranglerConfig = JSON.parse(
			fs.readFileSync(
				path.join(rootDir, "dist", "worker", "wrangler.json"),
				"utf-8"
			)
		);
		expect(wranglerConfig.upload_source_maps).toBeUndefined();
	}
);
