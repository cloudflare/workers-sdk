import { bindings, defineWorker } from "../public";
import type { InferEnv, K2Producer, K2ProduceResult } from "../public";

const config = defineWorker({
	name: "producer",
	compatibilityDate: "2025-04-28",
	env: {
		ORDERS: bindings.k2({
			stream: "0123456789abcdef0123456789abcdef",
		}),
	},
});

declare const env: InferEnv<typeof config>;
const producer: K2Producer = env.ORDERS;
const result: Promise<K2ProduceResult> = producer.send([
	{ content: new Uint8Array([1, 2]), headers: { event: "order" } },
]);
void result;
void producer.send([{ content: new ArrayBuffer(1) }]);
// @ts-expect-error K2 binding records use bytes, not HTTP base64 strings.
void producer.send([{ content: "aGVsbG8=" }]);
// @ts-expect-error Header values must be strings.
void producer.send([{ content: new Uint8Array([1]), headers: { event: 1 } }]);
// @ts-expect-error The current Worker binding is producer-only.
void producer.consume();
