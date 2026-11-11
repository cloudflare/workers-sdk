import { describe, test } from "vitest";
import { makeBinding } from "../../../src/workers/workflows/wrapped-binding.worker";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/16508
//
// `InstanceImpl` must not hold an RPC stub across an await of another RPC on
// it: if the call is cancelled (e.g. the calling instance is terminated
// mid-step), the pending await never settles, `using` never disposes the stub,
// and workerd logs "An RPC stub was not disposed properly".
describe("workflow instance binding", () => {
	const calls: [string, (instance: WorkflowInstance) => Promise<unknown>][] = [
		["pause", (i) => i.pause()],
		["resume", (i) => i.resume()],
		["terminate", (i) => i.terminate()],
		["restart", (i) => i.restart()],
		["status", (i) => i.status()],
		["sendEvent", (i) => i.sendEvent({ type: "x", payload: {} })],
	];

	test.each(calls)(
		"%s() holds no undisposed RPC stub while the call is pending",
		async (name, call) => {
			let outstandingStubs = 0;
			const never = new Promise<never>(() => {});
			const makeStub = (extra: Record<string, unknown>) => {
				outstandingStubs++;
				return {
					...extra,
					[Symbol.dispose]: () => {
						outstandingStubs--;
					},
				};
			};
			// Every RPC on an instance stub never settles, as when its context is
			// cancelled mid-call
			const instanceStub = () =>
				makeStub({
					id: "instance",
					pause: () => never,
					resume: () => never,
					terminate: () => never,
					restart: () => never,
					status: () => never,
					sendEvent: () => never,
				});
			const binding = {
				create: async () => makeStub({ id: "instance" }),
				get: async () => instanceStub(),
				// Calls by instance ID never settle, and return no stub
				pause: () => never,
				resume: () => never,
				terminate: () => never,
				restart: () => never,
				status: () => never,
				sendEvent: () => never,
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const workflow = makeBinding({ binding: binding as any });
			const instance = await workflow.create();

			void call(instance).catch(() => {});
			// Let the call get as far as it can
			await new Promise((r) => setTimeout(r, 50));

			if (outstandingStubs !== 0) {
				throw new Error(
					`${name}() awaits an RPC on a stub it has not disposed (${outstandingStubs} outstanding)`
				);
			}
		}
	);
});
