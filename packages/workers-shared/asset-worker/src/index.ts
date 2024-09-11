import { WorkerEntrypoint } from "cloudflare:workers";
import { AssetsManifest } from "./assets-manifest";
import { applyConfigurationDefaults } from "./configuration";
import { getIntent, handleRequest } from "./handler";
import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
} from "./responses";
import { getAssetWithMetadataFromKV } from "./utils/kv";
import type { AssetConfig } from "../../utils/types";

type Env = {
	// ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
	// binary-encoded site manifest
	ASSETS_MANIFEST: ArrayBuffer;

	// ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
	// assets are in.
	ASSETS_KV_NAMESPACE: KVNamespace;

	CONFIG: AssetConfig;
};

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		try {
			return handleRequest(
				request,
				applyConfigurationDefaults(this.env.CONFIG),
				this.exists.bind(this),
				this.getByETag.bind(this)
			);
		} catch (err) {
			return new InternalServerErrorResponse(err as Error);
		}
	}

	async unstable_canFetch(request: Request): Promise<boolean | Response> {
		const url = new URL(request.url);
		const method = request.method.toUpperCase();
		const intent = await getIntent(
			url.pathname,
			{
				...applyConfigurationDefaults(this.env.CONFIG),
				not_found_handling: "none",
			},
			this.exists.bind(this)
		);
		// if asset exists but non GET/HEAD method, 405
		if (intent && ["GET", "HEAD"].includes(method)) {
			return new MethodNotAllowedResponse();
		}
		if (intent === null) {
			return false;
		}
		return true;
	}

	async getByETag(
		eTag: string
	): Promise<{ readableStream: ReadableStream; contentType: string }> {
		const asset = await getAssetWithMetadataFromKV(
			this.env.ASSETS_KV_NAMESPACE,
			eTag
		);

		if (!asset || !asset.value) {
			throw new Error(
				`Requested asset ${eTag} exists in the asset manifest but not in the KV namespace.`
			);
		}

		return {
			readableStream: asset.value,
			contentType: asset.metadata?.contentType ?? "application/octet-stream",
		};
	}

	async getByPathname(
		pathname: string
	): Promise<{ readableStream: ReadableStream; contentType: string } | null> {
		const eTag = await this.exists(pathname);
		if (!eTag) {
			return null;
		}

		return this.getByETag(eTag);
	}

	async exists(pathname: string): Promise<string | null> {
		const assetsManifest = new AssetsManifest(this.env.ASSETS_MANIFEST);
		return await assetsManifest.get(pathname);
	}
}
