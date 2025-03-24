declare module 'cloudflare:test' {
	// extends Env in ../worker-configuration.d.ts
	interface ProvidedEnv extends Env {}

	// You can also
	//  interface ProvidedEnv {
	// 	KV_NAMESPACE: KVNamespace;
	// }
}
