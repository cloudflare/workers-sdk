export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);

		const configValues = {
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
						"package.json": true,
						"wrangler.toml": true,
					},
					"files.autoSave": "afterDelay",
					"files.autoSaveDelay": 200,
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
						"cloudflare.@cloudflare/quick-edit-extension": [
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
						authority: url.host,
					},
					{
						scheme: url.protocol === "https:" ? "https" : "http",
						path: "/solarflare-theme",
						authority: url.host,
					},
				],
			}).replace(/"/g, "&quot;"),
			WORKBENCH_AUTH_SESSION: "",
			WORKBENCH_WEB_BASE_URL: "/assets",
		};
		if (url.pathname !== "/") {
			return new Response(null, { status: 404 });
		}

		const workbench = await env.ASSETS.fetch(
			`http://fake.host${configValues.WORKBENCH_WEB_BASE_URL}/workbench.html`
		);

		// Replace configuration values
		const replacedWorkbenchText = (await workbench.text()).replaceAll(
			/\{\{([^}]+)\}\}/g,
			(_, key) => configValues[key as keyof typeof configValues] ?? "undefined"
		);

		return new Response(replacedWorkbenchText, {
			headers: {
				"Content-Type": "text/html",
			},
		});
	},
};
