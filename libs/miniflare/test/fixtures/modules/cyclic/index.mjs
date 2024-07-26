import * as cyclic1 from "./cyclic1.mjs";

export default {
	async fetch() {
		return new Response(cyclic1.ping());
	},
};
