import { fetch as remixFetch } from "remix-build/folder/main.js";
import { log } from "./other";
export default {
	async fetch(request: Request) {
		log("Hello World");
		return remixFetch(request);
	},
};
