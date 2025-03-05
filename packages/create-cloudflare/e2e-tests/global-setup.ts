import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";

export default async () =>
	startMockNpmRegistry("create-cloudflare", "@cloudflare/vite-plugin");
