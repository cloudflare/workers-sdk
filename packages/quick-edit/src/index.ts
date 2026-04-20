// Origins that are allowed to embed quick-edit in an iframe and
// communicate with it via postMessage.
// This list is used for both the Content-Security-Policy frame-ancestors
// directive (server-side) and postMessage origin validation (client-side).
const ALLOWED_PARENT_ORIGINS = [
	"https://dash.cloudflare.com",
	"https://workers.cloudflare.com",
	"https://workers-playground.pages.dev",
	"https://workers-playground.workers.dev",
	"http://localhost:7445",
];

// Origin patterns using wildcards, for preview deployments etc.
// Supported in CSP frame-ancestors and matched manually in the client.
const ALLOWED_PARENT_ORIGIN_WILDCARDS = [
	"https://*.workers-playground.pages.dev",
	"https://*.workers-playground.workers.dev",
];

// During local development (wrangler dev), the playground runs on localhost.
// We detect this from the request URL and add localhost origins dynamically.
// The wildcard port "http://localhost:*" allows any port in CSP frame-ancestors,
// and "http://localhost" is matched as a prefix in the client-side origin check.
const LOCALHOST_ORIGIN_WILDCARDS = ["http://localhost:*"];

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);

		// When Quick Edit is accessed through a proxy (e.g., on devprod.cloudflare.dev),
		// the browser sees the proxy's host, but the Worker receives its own host in the URL.
		// The additionalBuiltinExtensions config tells VS Code where to load extensions from,
		// so we need to use the proxy's host for the browser to load them correctly.
		// We validate the X-Forwarded-Host matches *.devprod.cloudflare.dev for security.
		const forwardedHost = request.headers.get("X-Forwarded-Host");
		const isValidForwardedHost =
			forwardedHost?.endsWith(".devprod.cloudflare.dev") ?? false;
		const authority = isValidForwardedHost ? forwardedHost : url.host;

		const isLocalDev = url.hostname === "localhost";

		const allOrigins = [...ALLOWED_PARENT_ORIGINS];
		const allWildcards = [...ALLOWED_PARENT_ORIGIN_WILDCARDS];
		if (isLocalDev) {
			allWildcards.push(...LOCALHOST_ORIGIN_WILDCARDS);
		}

		const configValues = {
			// Allowed parent origins are injected into the HTML so the client-side
			// postMessage handler can validate message origins.
			ALLOWED_PARENT_ORIGINS: JSON.stringify([
				...allOrigins,
				...allWildcards,
			]).replace(/"/g, "&quot;"),
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
						authority,
					},
					{
						scheme: url.protocol === "https:" ? "https" : "http",
						path: "/solarflare-theme",
						authority,
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

		// Build the frame-ancestors CSP directive to prevent embedding by
		// untrusted origins.
		const frameAncestors = [...allOrigins, ...allWildcards].join(" ");

		return new Response(replacedWorkbenchText, {
			headers: {
				"Content-Type": "text/html",
				"Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
			},
		});
	},
};
