import { MyDurableObject } from "./src/worker";

export interface EnvWithDO {
	MY_KV: KVNamespace;
	MY_VAR: "my-var-value" | "my-PRODUCTION-var-value";
	MY_VAR_A: "my-var-a";
	MY_JSON_VAR: { test: true } | { test: true; production: true };
	DO: DurableObjectNamespace<MyDurableObject>;
	MY_BUCKET: R2Bucket;
	MY_D1: D1Database;
	MY_HYPERDRIVE: Hyperdrive;
}
