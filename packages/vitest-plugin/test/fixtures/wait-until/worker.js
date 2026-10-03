const NativePromise = Promise;

export default {
	async fetch(_request, env, ctx) {
		let releaseRequest;
		let registered = false;

		class JoinedPromise extends NativePromise {
			static get [Symbol.species]() {
				return NativePromise;
			}

			then(onFulfilled, onRejected) {
				releaseRequest ??= env.CONTROL.fetch(
					`https://control.invalid/release?registered=${registered}`
				).then(async (response) => {
					const body = await response.text();
					if (!response.ok) throw new Error(body);
				});
				return super.then(onFulfilled, onRejected);
			}
		}

		const operation = new JoinedPromise((resolve, reject) => {
			const work = async () => {
				const gate = await env.CONTROL.fetch("https://control.invalid/gate");
				const body = await gate.text();
				if (!gate.ok) throw new Error(body);
				await releaseRequest;

				const { sentinel } = await import("./late.js");
				const receipt = await env.CONTROL.fetch(
					"https://control.invalid/complete",
					{
						method: "POST",
						body: sentinel,
					}
				);
				const receiptBody = await receipt.text();
				if (!receipt.ok) throw new Error(receiptBody);
			};
			// This ordinary derived Promise only propagates settlement; it does not
			// subscribe to JoinedPromise or release the scheduling barrier.
			work().then(resolve, reject);
		});

		// Pre-existing removal of the per-file registered waitUntil drain:
		// https://github.com/cloudflare/workers-sdk/commit/a6ddbdb2b67978377dda1acda289fe21eb0892bd
		ctx.waitUntil(operation);
		registered = true;
		const ready = await env.CONTROL.fetch("https://control.invalid/ready");
		const readyBody = await ready.text();
		if (!ready.ok) throw new Error(readyBody);
		return new Response("registered");
	},
};
