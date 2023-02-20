import { sayHello } from "./say-hello.js";

import { johnSmith } from "./nested/index.js";
export default {
	async fetch(request, env, ctx) {
		return new Response(`${sayHello("Jane Smith")} and ${johnSmith}`);
	},
};
