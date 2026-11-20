import { KVHeaders, KVParams } from "../../kv/constants";
import { SharedHeaders } from "../../shared/constants";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { SecretsStoreCreateSecretObjectWritable } from "../generated";

/** Local write-only setup uses the same namespace and metadata as secret bindings. */
export async function createSecrets(
	c: AppContext,
	body: SecretsStoreCreateSecretObjectWritable[]
) {
	const storeId = c.req.param("store_id");
	if (
		!storeId ||
		!/^[a-f0-9]{32}$/.test(storeId) ||
		body.length < 1 ||
		body.length > 100
	) {
		return errorResponse(400, 10001, "Invalid local Secrets Store request");
	}
	const encoder = new TextEncoder();
	const names = new Set<string>();
	for (const secret of body) {
		// The local backing namespace accepts keys up to 512 bytes. Scope is workers-only.
		if (
			!secret.name ||
			/[\x00-\x20\x7f]/.test(secret.name) ||
			encoder.encode(secret.name).length > 512 ||
			encoder.encode(secret.value).length > 65536 ||
			!secret.scopes.length ||
			secret.scopes.some((scope) => scope !== "workers") ||
			names.has(secret.name)
		) {
			return errorResponse(
				400,
				10001,
				"Local secrets require unique names up to 512 bytes, values up to 64 KiB, and workers scope only"
			);
		}
		names.add(secret.name);
	}
	const service = c.env.MINIFLARE_SECRETS_STORE;
	const urlFor = (name: string) => {
		const url = new URL(`http://secrets-store/${encodeURIComponent(name)}`);
		url.searchParams.set(KVParams.URL_ENCODED, "true");
		return url;
	};
	const headers = new Headers({ [SharedHeaders.NAMESPACE]: storeId });
	try {
		for (const secret of body) {
			const existing = await service.fetch(urlFor(secret.name), { headers });
			await existing.body?.cancel();
			if (existing.ok) {
				return errorResponse(
					409,
					10001,
					"A local secret already exists with this name"
				);
			}
			if (existing.status !== 404) {
				return errorResponse(500, 10000, "Local secret storage is unavailable");
			}
		}
		const result = [];
		for (const secret of body) {
			const id = crypto.randomUUID().replaceAll("-", "");
			const writeHeaders = new Headers(headers);
			writeHeaders.set(KVHeaders.METADATA, JSON.stringify({ uuid: id }));
			const response = await service.fetch(urlFor(secret.name), {
				method: "PUT",
				headers: writeHeaders,
				body: secret.value,
			});
			await response.body?.cancel();
			if (!response.ok) {
				return errorResponse(500, 10000, "Local secret storage is unavailable");
			}
			const timestamp = new Date().toISOString();
			result.push({
				id,
				name: secret.name,
				store_id: storeId,
				scopes: secret.scopes,
				comment: secret.comment,
				created: timestamp,
				modified: timestamp,
				status: "active" as const,
			});
		}
		return c.json(wrapResponse(result));
	} catch {
		return errorResponse(500, 10000, "Local secret storage is unavailable");
	}
}
