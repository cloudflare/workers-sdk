function isLocalDev(url: URL) {
	return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export const onRequest = async ({
	env,
	request,
	next,
}: Parameters<PagesFunction>[0]) => {
	const url = new URL(request.url);
	const values = {
		WORKBENCH_WEB_CONFIGURATION: JSON.stringify({
			configurationDefaults: {
				"workbench.startupEditor": "none",
				"editor.minimap.autohide": true,
			},
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
				extensionEnabledApiProposals: {
					"cloudflare.cloudflare-logic": [
						"fileSearchProvider",
						"textSearchProvider",
						"ipc",
					],
				},
			},
			additionalBuiltinExtensions: [
				{
					scheme: url.protocol === "https:" ? "https" : "http",
					path: "/cloudflare-logic",
				},
			],
		}).replace(/"/g, "&quot;"),
		WORKBENCH_AUTH_SESSION: "",
		WORKBENCH_WEB_BASE_URL: isLocalDev(url) ? "/vscode" : "/assets",
	};

	console.log(url.host);
	if (url.pathname === "/") {
		url.pathname = `${
			values.WORKBENCH_WEB_BASE_URL
		}/out/vs/code/browser/workbench/workbench${isLocalDev(url) ? "-dev" : ""}`;
		const response = await env.ASSETS.fetch(url);
		let body = await response.text();
		body = body.replaceAll(
			/\{\{([^}]+)\}\}/g,
			(_, key) => values[key as keyof typeof values] ?? "undefined"
		);
		if (!isLocalDev(url)) body = body.replace("/node_modules/", "/modules/");

		return new Response(body, {
			headers: {
				"Content-Type": "text/html",
			},
		});
	} else {
		return next();
	}
};
