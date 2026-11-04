import { Miniflare } from "miniflare";
import { test } from "vitest";
import { zSecretsStoreSecretCreateResponse } from "../../../src/workers/local-explorer/generated/zod.gen";
import { singleModuleManifest, useDispose } from "../../test-shared";

const storeId = "a".repeat(32);
const apiUrl = (id = storeId) =>
	`http://localhost/cdn-cgi/local/explorer/api/secrets_store/stores/${id}/secrets`;
const payload = (name = "API_SECRET") => [
	{ name, value: "local-value", scopes: ["workers"] },
];
function instance() {
	const mf = new Miniflare({
		cf: false,
		enableDevRegistry: false,
		unsafeLocalExplorer: true,
		workers: [
			{
				config: {
					name: "app",
					compatibilityDate: "2026-10-01",
					env: {
						SECRET: {
							type: "secrets-store-secret",
							storeId,
							secretName: "API_SECRET",
						},
					},
					manifest: singleModuleManifest(
						"export default {async fetch(request,env){return new Response(await env.SECRET.get());}}"
					),
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}
test("local API writes the secret binding namespace and returns only metadata", async ({
	expect,
}) => {
	const mf = instance();
	const response = await mf.dispatchFetch(apiUrl(), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload()),
	});
	expect(response.status).toBe(200);
	const text = await response.text();
	expect(text).not.toContain("local-value");
	const parsed = zSecretsStoreSecretCreateResponse.parse(JSON.parse(text));
	expect(parsed.result?.[0]).toMatchObject({
		name: "API_SECRET",
		store_id: storeId,
		status: "active",
		scopes: ["workers"],
	});
	expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
		"local-value"
	);
	const duplicate = await mf.dispatchFetch(apiUrl(), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify([{ ...payload()[0], value: "replacement" }]),
	});
	await duplicate.text();
	expect(duplicate.status).toBe(409);
	expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
		"local-value"
	);
	const anotherStore = await mf.dispatchFetch(apiUrl("b".repeat(32)), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload()),
	});
	await anotherStore.text();
	expect(anotherStore.status).toBe(200);
});
test.for(
	[
		[],
		[{ name: "API_SECRET", value: "test", scopes: [] }],
		[{ name: "API_SECRET", value: "test", scopes: ["ai_gateway"] }],
		[
			{ name: "API_SECRET", value: "test", scopes: ["workers"] },
			{ name: "API_SECRET", value: "test", scopes: ["workers"] },
		],
		[{ name: "API_SECRET", value: "é".repeat(32769), scopes: ["workers"] }],
		[{ name: "bad name", value: "test", scopes: ["workers"] }],
	].map((body) => ({ body }))
)("rejects unsupported local secret input %#", async ({ body }, { expect }) => {
	const mf = instance();
	const response = await mf.dispatchFetch(apiUrl(), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	await response.text();
	expect(response.status).toBe(400);
});
