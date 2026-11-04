import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker.js" with { type: "cf-worker" };
const scope = ["read"];
const resources = [
	{ origin: "https://api.identity.local", methods: ["GET"] as const },
];
const return_urls = ["http://127.0.0.1:5178/complete"];
export default defineConfig({
	worker: {
		name: "vite-identity",
		entrypoint,
		compatibilityDate: "2026-10-30",
		env: {
			ACCOUNT: bindings.identity({
				selection: "app",
				connection_management: true,
				scope,
				resources,
				return_urls,
				oauth: {
					grant: "authorization_code",
					authorization_server: "https://as.identity.local",
					resource: "https://api.identity.local",
					discovery: true,
					client_registration: { mode: "dynamic", authentication: "none" },
					permission_ceiling: { scope, resources, return_urls },
				},
			}),
		},
	},
});
