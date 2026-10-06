declare module "cloudflare:workers" {
	// ProvidedEnv controls the type of `import("cloudflare:workers").env`
	interface ProvidedEnv extends Env {}
}
