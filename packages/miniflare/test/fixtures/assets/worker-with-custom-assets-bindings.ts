import { bytesToHex, hashPath } from "./asset-test-helpers.ts";

interface Env {
	//  custom kv binding name
	CUSTOM_ASSETS_NAMESPACE: KVNamespace;
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const { pathname } = url;

		const pathHash = bytesToHex(await hashPath(pathname));
		const content = await env.CUSTOM_ASSETS_NAMESPACE.get(pathHash);
		return new Response(content);
	},
};
