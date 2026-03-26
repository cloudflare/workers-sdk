// The admin API key used by Miniflare's emulated secrets store binding.
// This must match the value in miniflare/src/workers/secrets-store/constants.ts.
const ADMIN_API = "SecretsStoreSecret::admin_api";

/**
 * Returns the admin API for a secrets store binding, allowing tests to
 * create, update, and delete secrets that would otherwise be read-only.
 *
 * ```ts
 * import { adminSecretsStore } from "cloudflare:test";
 *
 * const admin = adminSecretsStore(env.MY_SECRET);
 * await admin.create("my-secret-value");
 * ```
 */
export function adminSecretsStore(binding: unknown): SecretsStoreSecretAdmin {
	if (
		typeof binding !== "object" ||
		binding === null ||
		typeof (binding as Record<string, unknown>)[ADMIN_API] !== "function"
	) {
		throw new TypeError(
			"Failed to execute 'adminSecretsStore': parameter 1 is not a secrets store binding."
		);
	}

	return (binding as Record<string, (...args: unknown[]) => unknown>)[
		ADMIN_API
	]() as SecretsStoreSecretAdmin;
}

interface SecretsStoreSecretAdmin {
	create(value: string): Promise<string>;
	update(value: string, id: string): Promise<string>;
	duplicate(id: string, newName: string): Promise<string>;
	delete(id: string): Promise<void>;
	list(): Promise<{ name: string; metadata?: { uuid: string } }[]>;
	get(id: string): Promise<string>;
}
