import { text } from "./another/another";

export default {
	async fetch() {
		return Response.json({ entry: "Nested config", import: text });
	},
};
