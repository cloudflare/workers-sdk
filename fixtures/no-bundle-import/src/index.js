import { sayHello } from "./say-hello.js";

import { johnSmith } from "./nested/index.js";
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname === "/dynamic") {
			return new Response(`${(await import("./dynamic.js")).default}`);
		}
		if (url.pathname === "/dynamic-var") {
			const name = "./dynamic-var.js";
			return new Response(`${(await import(name)).default}`);
		}
		return new Response(`${sayHello("Jane Smith")} and ${johnSmith}`);
	},
};
