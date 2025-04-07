import test from "ava";
import { Miniflare } from "miniflare";

test("single secret-store", async (t) => {
	const mf = new Miniflare({
		verbose: true,
		compatibilityDate: "2025-01-01",
		secretsStoreSecrets: {
			SECRET: {
				store_id: "test_store_id",
				secret_name: "secret_name",
			},
		},
		secretsStorePersist:
			"../../fixtures/secrets-store/.wrangler/state/v3/secrets-store",
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
	t.teardown(() => mf.dispose());

	const response1 = await mf.dispatchFetch("http://localhost");

	t.is(await response1.text(), 'Secret "secret_name" not found');
	t.is(response1.status, 404);

	const write = await mf.getSecretsStoreSecretWrite("SECRET");

	await write("example");

	const response2 = await mf.dispatchFetch("http://localhost");

	t.is(await response2.text(), "example");
	t.is(response2.status, 200);
});

test("multiple secret-store", async (t) => {
	const mf = new Miniflare({
		verbose: true,
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
	t.teardown(() => mf.dispose());

	const response1 = await mf.dispatchFetch("http://localhost");

	t.deepEqual(await response1.json(), {
		secret1: null,
		secret2: null,
		secret3: null,
	});

	const write1 = await mf.getSecretsStoreSecretWrite("SECRET1");
	const write2 = await mf.getSecretsStoreSecretWrite("SECRET2");

	await write1("example_a");
	await write2("example_b");

	const response2 = await mf.dispatchFetch("http://localhost");

	t.deepEqual(await response2.json(), {
		secret1: "example_a",
		secret2: "example_b",
		secret3: null,
	});

	const write3 = await mf.getSecretsStoreSecretWrite("SECRET3");

	await write3("example_c");

	const response3 = await mf.dispatchFetch("http://localhost");

	t.deepEqual(await response3.json(), {
		secret1: "example_a",
		secret2: "example_b",
		secret3: "example_c",
	});
});
