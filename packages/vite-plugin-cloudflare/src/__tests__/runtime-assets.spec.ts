import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { test } from "vitest";

test("serves nested assets with encoded path names through the installed runtime", async ({
	expect,
	onTestFinished,
}) => {
	const directory = await mkdtemp(join(tmpdir(), "vite-v1-runtime-assets-"));
	onTestFinished(() => removeDir(directory));
	await mkdir(join(directory, "nested"));
	await writeFile(join(directory, "nested", "[fünky].txt"), "nested asset");
	const miniflare = new Miniflare({
		workers: [
			{
				config: {
					name: "asset-test",
					compatibilityDate: "2026-10-16",
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: directory,
						modules: {
							"index.mjs": {
								type: "esm",
								contents:
									"export default { fetch() { return new Response('user worker'); } };",
							},
						},
					},
					assets: { directory },
				},
			},
		],
	});
	onTestFinished(() => miniflare.dispose());
	const response = await miniflare.dispatchFetch(
		"http://example.com/nested/%5Bf%C3%BCnky%5D.txt"
	);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("nested asset");
});
