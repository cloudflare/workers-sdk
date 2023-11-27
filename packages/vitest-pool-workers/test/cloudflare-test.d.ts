// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface CloudflareTestEnv {}

declare module "cloudflare:test" {
	export const env: CloudflareTestEnv;
}
