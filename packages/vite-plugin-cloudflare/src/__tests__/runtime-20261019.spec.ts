import { Miniflare } from "miniflare";
import { test } from "vitest";

test("streams Node.js crypto output at the October 19 compatibility date", async ({
	expect,
	onTestFinished,
}) => {
	const miniflare = new Miniflare({
		workers: [
			{
				config: {
					name: "october-19-runtime",
					compatibilityDate: "2026-10-19",
					compatibilityFlags: ["nodejs_compat"],
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"index.mjs": {
								type: "esm",
								contents: `
import { createHash } from "node:crypto";
export default {
 async fetch(request) {
  const digest = createHash("sha256").update(await request.text()).digest("hex");
  return new Response(new ReadableStream({
   start(controller) {
    controller.enqueue(new TextEncoder().encode(digest));
    controller.close();
   },
  }));
 },
};
`,
							},
						},
					},
				},
			},
		],
	});
	onTestFinished(() => miniflare.dispose());
	const response = await miniflare.dispatchFetch("http://example.com/", {
		method: "POST",
		body: "October 19 runtime",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe(
		"d07e2b604d0eb55650cbd4ea1d5832fefa582ea7089a83956ecdd0e0ca163311"
	);
});
