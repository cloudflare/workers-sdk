import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "../../test-shared";

test("version-metadata: provides id, tag, and timestamp", async () => {
	const testId = "test-version-id-12345";
	const testTag = "test-tag";
	const testTimestamp = "2025-01-15T10:30:00.000Z";

	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		versionMetadata: {
			binding: "CF_VERSION_METADATA",
			id: testId,
			tag: testTag,
			timestamp: testTimestamp,
		},
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
	const result = await response.json();

	expect(result).toEqual({
		id: testId,
		tag: testTag,
		timestamp: testTimestamp,
	});
	expect(response.status).toBe(200);
});

test("version-metadata: works with custom binding name", async () => {
	const testId = "custom-id";
	const testTag = "custom-tag";
	const testTimestamp = "2025-01-20T15:45:00.000Z";

	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		versionMetadata: {
			binding: "MY_VERSION",
			id: testId,
			tag: testTag,
			timestamp: testTimestamp,
		},
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
	const result = await response.json();

	expect(result).toEqual({
		id: testId,
		tag: testTag,
		timestamp: testTimestamp,
	});
	expect(response.status).toBe(200);
});

test("version-metadata: works with empty tag", async () => {
	const testId = "version-with-empty-tag";
	const testTag = "";
	const testTimestamp = "2025-01-25T08:00:00.000Z";

	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		versionMetadata: {
			binding: "CF_VERSION_METADATA",
			id: testId,
			tag: testTag,
			timestamp: testTimestamp,
		},
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
	const result = await response.json();

	expect(result).toEqual({
		id: testId,
		tag: testTag,
		timestamp: testTimestamp,
	});
	expect(response.status).toBe(200);
});
