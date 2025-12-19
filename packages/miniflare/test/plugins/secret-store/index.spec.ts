import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "../../test-shared";

test("single secret-store", async () => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		secretsStoreSecrets: {
			SECRET: {
				store_id: "test_store_id",
				secret_name: "secret_name",
			},
		},
		secretsStorePersist: false,
		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				try {
					const value = await env.SECRET.get();
					return new Response(value);
				} catch (e) {
					return new Response(e.message, { status: 404 });
				}
			},
		}
		`,
	});
	useDispose(mf);

	const response1 = await mf.dispatchFetch("http://localhost");

	expect(await response1.text()).toBe('Secret "secret_name" not found');
	expect(response1.status).toBe(404);

	const api = await mf.getSecretsStoreSecretAPI("SECRET");

	await api().create("example");

	const response2 = await mf.dispatchFetch("http://localhost");

	expect(await response2.text()).toBe("example");
	expect(response2.status).toBe(200);
});

test("multiple secret-store", async () => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		secretsStoreSecrets: {
			SECRET1: {
				store_id: "test_store_id_1",
				secret_name: "secret_name_a",
			},
			// Same store id, different secret name
			SECRET2: {
				store_id: "test_store_id_1",
				secret_name: "secret_name_b",
			},
			// Different store id, same secret name
			SECRET3: {
				store_id: "test_store_id_2",
				secret_name: "secret_name_a",
			},
		},
		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const [result1, result2, result3] = await Promise.allSettled([
					env.SECRET1.get(),
					env.SECRET2.get(),
					env.SECRET3.get(),
				]);

				return Response.json({
					secret1: result1.status === "fulfilled" ? result1.value : null,
					secret2: result2.status === "fulfilled" ? result2.value : null,
					secret3: result3.status === "fulfilled" ? result3.value : null,
				});
			},
		}
		`,
	});
	useDispose(mf);

	const response1 = await mf.dispatchFetch("http://localhost");

	expect(await response1.json()).toEqual({
		secret1: null,
		secret2: null,
		secret3: null,
	});

	const api1 = await mf.getSecretsStoreSecretAPI("SECRET1");
	const api2 = await mf.getSecretsStoreSecretAPI("SECRET2");

	await api1().create("example_a");
	await api2().create("example_b");

	const response2 = await mf.dispatchFetch("http://localhost");

	expect(await response2.json()).toEqual({
		secret1: "example_a",
		secret2: "example_b",
		secret3: null,
	});

	const api3 = await mf.getSecretsStoreSecretAPI("SECRET3");

	await api3().create("example_c");

	const response3 = await mf.dispatchFetch("http://localhost");

	expect(await response3.json()).toEqual({
		secret1: "example_a",
		secret2: "example_b",
		secret3: "example_c",
	});
});
