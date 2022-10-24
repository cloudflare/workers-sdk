// Because we have the `buffer` npm package installed, this shouldn't fail,
// as esbuild can resolve that instead:
// https://github.com/cloudflare/wrangler2/issues/2038
import { Buffer } from "buffer";

export default {
	fetch() {
		return new Response(Buffer.from("hello").toString("hex"));
	},
};
