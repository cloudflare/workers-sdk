import { parse } from "jsonc-parser";

export default {
	fetch() {
		return new Response(parse('"Hello World!"'));
	},
};
