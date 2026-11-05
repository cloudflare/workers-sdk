import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env, waitUntil } from "cloudflare:workers";
import { it } from "vitest";

it("waits for work passed to the imported waitUntil()", async ({ expect }) => {
	const log: string[] = [];
	const worker = {
		async fetch(_request, _env, _ctx) {
			waitUntil(
				new Promise((resolve) => setTimeout(resolve, 100)).then(() => {
					log.push("done");
				})
			);
			return new Response("ok");
		},
	} satisfies ExportedHandler;

	const ctx = createExecutionContext();
	await worker.fetch(new Request("https://example.com"), env, ctx);
	await waitOnExecutionContext(ctx);

	expect(log).toEqual(["done"]);
});

it("waits for imported waitUntil() calls made by waitUntil() work", async ({
	expect,
}) => {
	const log: string[] = [];
	const ctx = createExecutionContext();
	waitUntil(
		Promise.resolve().then(() => {
			waitUntil(
				new Promise((resolve) => setTimeout(resolve, 100)).then(() => {
					log.push("done");
				})
			);
		})
	);

	await waitOnExecutionContext(ctx);

	expect(log).toEqual(["done"]);
});

it("rethrows rejections from the imported waitUntil()", async ({ expect }) => {
	const ctx = createExecutionContext();
	waitUntil(Promise.reject(new Error("waitUntil() failed")));

	await expect(waitOnExecutionContext(ctx)).rejects.toThrow(
		"waitUntil() failed"
	);
});
