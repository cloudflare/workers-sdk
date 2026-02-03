// imports from `node:fs`
import { pathExists } from "path-exists";

export default {
	async fetch() {
		return new Response(typeof pathExists === "function" ? "success" : "error");
	},
} satisfies ExportedHandler;
