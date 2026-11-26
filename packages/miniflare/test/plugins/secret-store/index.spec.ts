import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

test("single secret-store", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-01-01",
					env: {
						SECRET: {
							type: "secrets-store-secret",
							storeId: "test_store_id",
							secretName: "secret_name",
						},
					},
					manifest: singleModuleManifest(`
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
		`),
				},
			},
		],
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

test("multiple secret-store", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-01-01",
					env: {
						SECRET1: {
							type: "secrets-store-secret",
							storeId: "test_store_id_1",
							secretName: "secret_name_a",
						},
						// Same store id, different secret name
						SECRET2: {
							type: "secrets-store-secret",
							storeId: "test_store_id_1",
							secretName: "secret_name_b",
						},
						// Different store id, same secret name
						SECRET3: {
							type: "secrets-store-secret",
							storeId: "test_store_id_2",
							secretName: "secret_name_a",
						},
					},
					manifest: singleModuleManifest(`
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
		`),
				},
			},
		],
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

/** Configure a persistent store with bindings for an original and duplicated secret. */
function persistentStoreOptions(
	resourcePersistencePath: string
): MiniflareOptions {
	return {
		resourcePersistencePath,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-01-01",
					env: {
						SECRET: {
							type: "secrets-store-secret",
							storeId: "test_store_id",
							secretName: "original",
						},
						DUPLICATE: {
							type: "secrets-store-secret",
							storeId: "test_store_id",
							secretName: "duplicate",
						},
					},
					manifest: singleModuleManifest(`
						export default {
							async fetch(request, env) {
								const binding = new URL(request.url).pathname === "/duplicate"
									? env.DUPLICATE : env.SECRET;
								return new Response(await binding.get());
							},
						};
					`),
				},
			},
		],
	};
}

test.runIf(process.platform !== "win32").for([
	{ umask: 0o022, existing: false },
	{ umask: 0o022, existing: true },
	{ umask: 0o077, existing: false },
	{ umask: 0o077, existing: true },
])(
	"protects persisted secrets (umask $umask, existing store: $existing)",
	async ({ umask, existing }, { expect }) => {
		const previousUmask = process.umask(umask);
		try {
			const root = await useTmp();
			// A traversable parent must not expose the workerd-created blobs.
			await fs.chmod(root, 0o755);
			const storePath = path.join(root, "secrets-store");
			if (existing) {
				const previous = new Miniflare(persistentStoreOptions(root));
				useDispose(previous);
				const api = await previous.getSecretsStoreSecretAPI("SECRET");
				await api().create("dummy-existing-value");
				await previous.dispose();
				// Model a directory created by an older version.
				await fs.chmod(storePath, 0o755);
			}

			const mf = new Miniflare(persistentStoreOptions(root));
			useDispose(mf);
			await mf.ready;
			expect((await fs.stat(storePath)).mode & 0o777).toBe(0o700);
			expect((await fs.stat(root)).mode & 0o777).toBe(0o755);
			if (existing) {
				const response = await mf.dispatchFetch("http://localhost");
				expect(await response.text()).toBe("dummy-existing-value");
			}

			const api = await mf.getSecretsStoreSecretAPI("SECRET");
			const id = await api().create("dummy-created-value");
			let response = await mf.dispatchFetch("http://localhost");
			expect(await response.text()).toBe("dummy-created-value");
			await api().update("dummy-updated-value", id);
			response = await mf.dispatchFetch("http://localhost");
			expect(await response.text()).toBe("dummy-updated-value");
			await api().duplicate(id, "duplicate");
			response = await mf.dispatchFetch("http://localhost/duplicate");
			expect(await response.text()).toBe("dummy-updated-value");
			await mf.dispose();

			// The boundary protects blobs even when workerd gives them default modes,
			// and remains in place after the dev session ends.
			const blobs = path.join(storePath, "test_store_id", "blobs");
			const files = await fs.readdir(blobs);
			const values = await Promise.all(
				files.map((file) => fs.readFile(path.join(blobs, file), "utf8"))
			);
			expect(values).toContain("dummy-updated-value");
			expect((await fs.stat(storePath)).mode & 0o777).toBe(0o700);
			expect((await fs.stat(root)).mode & 0o777).toBe(0o755);
		} finally {
			process.umask(previousUmask);
		}
	}
);

test.runIf(process.platform !== "win32")(
	"refuses to start with a symlinked Secrets Store directory",
	async ({ expect }) => {
		const root = await useTmp();
		const target = path.join(root, "target");
		await fs.mkdir(target);
		await fs.chmod(target, 0o755);
		await fs.symlink(target, path.join(root, "secrets-store"));
		const mf = new Miniflare(persistentStoreOptions(root));
		await expect(mf.ready).rejects.toThrow("Unable to secure Secrets Store");
		// dispose() cleans up and propagates the same startup error.
		await expect(mf.dispose()).rejects.toThrow(
			"Unable to secure Secrets Store"
		);
		expect((await fs.stat(target)).mode & 0o777).toBe(0o755);
		expect(await fs.readdir(target)).toEqual([]);
	}
);
