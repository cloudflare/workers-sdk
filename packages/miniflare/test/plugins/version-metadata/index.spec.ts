import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "../../test-shared";

test("version-metadata: provides id, tag, and timestamp", async () => {
	const mf = new Miniflare({
		compatibilityDate: "2026-01-01",
		versionMetadata: "CF_VERSION_METADATA",
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
					const { id, tag, timestamp } = env.CF_VERSION_METADATA;
					return Response.json({ id, tag, timestamp });
				},
			}
		`,
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://placeholder");
	const result = (await response.json()) as {
		id: string;
		tag: string;
		timestamp: string;
	};

	expect(result.id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
	);
	expect(result.tag).toBe("");
	expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
	expect(response.status).toBe(200);
});

test("version-metadata: works with custom binding name", async () => {
	const mf = new Miniflare({
		compatibilityDate: "2026-01-01",
		versionMetadata: "MY_VERSION",
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
					const { id, tag, timestamp } = env.MY_VERSION;
					return Response.json({ id, tag, timestamp });
				},
			}
		`,
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://placeholder");
	const result = (await response.json()) as {
		id: string;
		tag: string;
		timestamp: string;
	};

	expect(result.id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
	);
	expect(result.tag).toBe("");
	expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
	expect(response.status).toBe(200);
});

test("version-metadata: timestamp is valid ISO date", async () => {
	const mf = new Miniflare({
		compatibilityDate: "2026-01-01",
		versionMetadata: "CF_VERSION_METADATA",
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
					const { id, tag, timestamp } = env.CF_VERSION_METADATA;
					return Response.json({ id, tag, timestamp });
				},
			}
		`,
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://placeholder");
	const result = (await response.json()) as {
		id: string;
		tag: string;
		timestamp: string;
	};

	const parsedDate = new Date(result.timestamp);
	expect(parsedDate.toString()).not.toBe("Invalid Date");
	expect(parsedDate.getTime()).toBeLessThanOrEqual(Date.now());
	expect(response.status).toBe(200);
});
