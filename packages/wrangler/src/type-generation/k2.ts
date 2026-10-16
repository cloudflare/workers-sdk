// EWC and the Superpipe binding Worker provide the runtime binding independently
// of TypeScript declarations. This inline shape supports `wrangler types` until
// workerd publishes a public K2 type that we can reference like Pipelines.
// Keep generated declarations self-contained in the meantime.
export const K2_PRODUCER_TYPE = `{
		send(records:
			| { content: ArrayBuffer; headers?: Record<string, string> }[]
			| { content: Uint8Array; headers?: Record<string, string> }[]
		): Promise<
			| { success: true }
			| { success: false; error: { code: number; message: string; retryable: boolean } }
		>;
	}`;
