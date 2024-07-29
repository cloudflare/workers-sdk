declare module "cloudflare:test" {
	// Controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv extends Env {}

	// Ensure RPC properties and methods can be accessed with `SELF`
	export const SELF: Service<import("../src/index").default>;
}
