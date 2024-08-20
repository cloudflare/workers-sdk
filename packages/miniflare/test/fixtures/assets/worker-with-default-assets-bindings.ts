import { bytesToHex, hashPath } from "./asset-test-helpers.ts";

interface Env {
	//  this is the default kv binding name
	__STATIC_ASSETS_CONTENT: KVNamespace;
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const { pathname } = url;
		const pathHash = bytesToHex(await hashPath(pathname));
		const content = await env.__STATIC_ASSETS_CONTENT.get(pathHash);
		return new Response(content);
	},
};
