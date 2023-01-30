/**
 * Welcome to Cloudflare Workers! This is your first Email worker.
 *
 * Learn more at https://developers.cloudflare.com/email-routing/email-workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
}

export default {
	async email(
		message: EmailMessage,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		console.log(`Hello World!`);
	},
};
