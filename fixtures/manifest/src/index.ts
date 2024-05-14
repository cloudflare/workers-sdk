"use wrangler bundle ./public/**/* Data";

import bin from "./my.bin";

export default {
	async fetch(request: Request) {
		try {
			const url = new URL(request.url);
			console.log(bin);
			return new Response((await import(url.pathname)).default);
		} catch (e) {
			return new Response(e.message);
		}
	},
};
