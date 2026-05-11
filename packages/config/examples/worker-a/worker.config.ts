import { defineConfig, bindings } from "@cloudflare/config";
import * as entrypoint from "./src" with { type: "cf-worker" };

// Type for queue message body
interface QueueMessage {
	userId: string;
	action: "create" | "update" | "delete";
}

// Type for KV keys
type KvKey = "user" | "session" | "config";

export default defineConfig({
	name: "worker-a",
	entrypoint,
	env: {
		MY_AI: bindings.ai(),
		MY_BUCKET: bindings.r2(),
		MY_DB: bindings.d1(),
		MY_JSON: bindings.json({ foo: "bar" }),
		MY_KV: bindings.kv<KvKey>(),
		MY_PIPELINE: bindings.pipeline<{ id: number }>({ name: "pipeline" }),
		MY_QUEUE: bindings.queue<QueueMessage>({ name: "my-queue" }),
		MY_SECRET: bindings.secret(),
		MY_TEXT: bindings.text("hello world"),
	},
	exports: {
		MyDurableObject: { type: "durable-object", storage: "sqlite" },
		MyWorkflow: { type: "workflow", name: "my-workflow" },
	},
});
