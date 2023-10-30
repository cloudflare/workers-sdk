import { Buffer } from "node:buffer";
import { EmailMessage } from "cloudflare:email";

export default {
	async fetch() {
		console.log("EmailMessage", EmailMessage);
		return new Response(Buffer.from("test", "utf8"));
	},
};
