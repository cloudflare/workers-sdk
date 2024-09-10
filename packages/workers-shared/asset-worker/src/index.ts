import { WorkerEntrypoint } from "cloudflare:workers";
import { AssetsManifest } from "./assets-manifest";
import { applyConfigurationDefaults } from "./configuration";
import { getIntent, handleRequest } from "./handler";
import { InternalServerErrorResponse } from "./responses";
import { getAssetWithMetadataFromKV } from "./utils/kv";
import type { Configuration } from "./configuration";

type Env = {
	// ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
	// binary-encoded site manifest
	ASSETS_MANIFEST: ArrayBuffer;

	// ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
	// assets are in.
	ASSETS_KV_NAMESPACE: KVNamespace;

	CONFIG: Partial<Configuration>;
};

export type FetchMethod = (request: Request) => Promise<Response>;
export type UnstableCanFetchMethod = (request: Request) => Promise<boolean>;
export type GetByETagMethod = (
	eTag: string
) => Promise<{ readableStream: ReadableStream; contentType: string }>;
export type GetByPathnameMethod = (
	pathname: string
) => Promise<Awaited<ReturnType<GetByETagMethod>> | null>;
export type ExistsMethod = (pathname: string) => Promise<string | null>;

export default class extends WorkerEntrypoint<Env> {
	async fetch(...[request]: Parameters<FetchMethod>): ReturnType<FetchMethod> {
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

	async unstable_canFetch(...[request]: Parameters<UnstableCanFetchMethod>) {
		const url = new URL(request.url);
		const intent = await getIntent(
			url.pathname,
			{
				...applyConfigurationDefaults(this.env.CONFIG),
				notFoundHandling: "none",
			},
			this.exists.bind(this)
		);
		if (intent === null) {
			return false;
		}
		return true;
	}

	async getByETag(
		...[eTag]: Parameters<GetByETagMethod>
	): ReturnType<GetByETagMethod> {
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
		...[pathname]: Parameters<GetByPathnameMethod>
	): ReturnType<GetByPathnameMethod> {
		const eTag = await this.exists(pathname);
		if (!eTag) {
			return null;
		}

		return this.getByETag(eTag);
	}

	async exists(
		...[pathname]: Parameters<ExistsMethod>
	): ReturnType<ExistsMethod> {
		const assetsManifest = new AssetsManifest(this.env.ASSETS_MANIFEST);
		return await assetsManifest.get(pathname);
	}
}
