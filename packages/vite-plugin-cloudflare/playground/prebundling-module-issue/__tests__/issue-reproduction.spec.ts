import { rmSync } from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { getTextResponse, viteServer } from "../../__test-utils__";

test("prebundling module issue reproduction", async () => {
	const viteCacheDir = path.resolve(
		fileURLToPath(import.meta.url),
		"../../node_modules/.vite"
	);

	rmSync(viteCacheDir, { recursive: true });

	await viteServer.close();
	await viteServer.restart();

	const result = await getTextResponse();
	expect(result).not.toContain("context mismatch");
	expect(result).toBe('Message from virtual module: "Hello from lib-b"');
});
