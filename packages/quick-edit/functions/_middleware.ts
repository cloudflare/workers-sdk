export const onRequest = async ({
	env,
	request,
	next,
}: Parameters<PagesFunction>[0]) => {
	const url = new URL(request.url);

	const isLocalDev = url.hostname === "localhost";

	const values = {
		WORKBENCH_WEB_CONFIGURATION: JSON.stringify({
			configurationDefaults: {
				"workbench.colorTheme":
					url.searchParams.get("theme") === "dark"
						? "Solarflare Dark"
						: "Solarflare Light",
				"workbench.startupEditor": "none",
				"editor.minimap.autohide": true,
				"files.exclude": {
					"*.d.ts": true,
					"jsconfig.json": true,
				},
				"telemetry.telemetryLevel": "off",
				"window.menuBarVisibility": "hidden",
			},
			productConfiguration: {
				nameShort: "Quick Edit",
				nameLong: "Cloudflare Workers Quick Edit",
				applicationName: "workers-quick-edit",
				dataFolderName: ".quick-edit",
				version: "1.76.0",
				extensionEnabledApiProposals: {
					"cloudflare.quick-edit-extension": [
						"fileSearchProvider",
						"textSearchProvider",
						"ipc",
					],
				},
			},
			additionalBuiltinExtensions: [
				{
					scheme: url.protocol === "https:" ? "https" : "http",
					path: "/quick-edit-extension",
				},
				{
					scheme: url.protocol === "https:" ? "https" : "http",
					path: "/solarflare-theme",
				},
			],
		}).replace(/"/g, "&quot;"),
		WORKBENCH_AUTH_SESSION: "",
		WORKBENCH_WEB_BASE_URL: "/assets",
	};

	if (url.pathname === "/") {
		url.pathname = `${
			values.WORKBENCH_WEB_BASE_URL
		}/out/vs/code/browser/workbench/workbench${isLocalDev ? "-dev" : ""}`;
		const response = await env.ASSETS.fetch(url);
		let body = await response.text();
		body = body.replaceAll(
			/\{\{([^}]+)\}\}/g,
			(_, key) => values[key as keyof typeof values] ?? "undefined"
		);
		if (!isLocalDev) body = body.replace("/node_modules/", "/modules/");

		return new Response(body, {
			headers: {
				"Content-Type": "text/html",
			},
		});
	} else {
		return next();
	}
};
