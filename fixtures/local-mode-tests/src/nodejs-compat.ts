import { Buffer } from "node:buffer";

export default (<ExportedHandler>{
	async fetch() {
		return new Response(Buffer.from("test").toString("base64"));
	},
});
