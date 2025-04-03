import vitePackageJson from "vite/package.json?raw";
import url from "vite/package.json?url";

export default {
	async fetch() {
		const json = JSON.parse(vitePackageJson);
		return new Response(
			`Hello! This is an application built using ${json.name}@${json.version} (information retrieved from "${url}")`
		);
	},
} satisfies ExportedHandler;
