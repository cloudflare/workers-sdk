import { AssetsManifest } from "./assets-manifest";

interface Env {
	ASSETS_MANIFEST: ArrayBuffer;
	ASSETS_KV_NAMESPACE: KVNamespace;
}

export default {
	async fetch(request: Request, env: Env) {
		const {
			// ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
			// binary-encoded site manifest
			ASSETS_MANIFEST = new ArrayBuffer(0),

			// ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
			// assets are in.
			ASSETS_KV_NAMESPACE,
		} = env;

		const url = new URL(request.url);
		const { pathname } = url;

		const assetsManifest = new AssetsManifest(ASSETS_MANIFEST);
		const assetKey = await assetsManifest.get(pathname);
		if (!assetKey) {
			return new Response("Not Found", { status: 404 });
		}

		const content = await ASSETS_KV_NAMESPACE.get(assetKey);
		if (!content) {
			return new Response("Not Found", { status: 404 });
		}

		return new Response(content);
	},
};
