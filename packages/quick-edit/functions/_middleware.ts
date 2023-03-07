const values = {
	WORKBENCH_WEB_CONFIGURATION: JSON.stringify({
		productConfiguration: {
			nameShort: "Quick Edit",
			nameLong: "Cloudflare Workers Quick Edit",
			applicationName: "workers-quick-edit",
			dataFolderName: ".quick-edit",
			version: "1.76.0",
			extensionsGallery: {
				serviceUrl: "https://open-vsx.org/vscode/gallery",
				itemUrl: "https://open-vsx.org/vscode/item",
				resourceUrlTemplate:
					"https://openvsxorg.blob.core.windows.net/resources/{publisher}/{name}/{version}/{path}",
			},
		},
	}).replace(/"/g, "&quot;"),
	WORKBENCH_AUTH_SESSION: "",
	WORKBENCH_WEB_BASE_URL: "/assets",
};
export const onRequest = async ({ env, request, next }) => {
	const url = new URL(request.url);
	console.log(url.pathname);
	if (url.pathname === "/") {
		url.pathname = "/assets/out/vs/code/browser/workbench/workbench";
		const response = await env.ASSETS.fetch(url);
		let body = await response.text();
		body = body.replaceAll(
			/\{\{([^}]+)\}\}/g,
			(_, key) => values[key] ?? "undefined"
		);
		body = body.replace("/node_modules/", "/modules/");

		return new Response(body, {
			headers: {
				"Content-Type": "text/html",
			},
		});
	} else {
		return next();
	}
};
