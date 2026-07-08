// Durable Object backing the emulated Ratelimit binding. Moving bucket/epoch
// state here (instead of an in-memory object behind a `wrapped` binding)
// means it's automatically torn down by `deleteAllDurableObjects()`, so
// vitest-pool-workers' `reset()` clears it for free.
import { MiniflareDurableObject, POST } from "miniflare:shared";
import type { RouteHandler } from "miniflare:shared";

interface LimitRequestBody {
	key: string;
	limit: number;
	period: number;
}

interface LimitResult {
	success: boolean;
}

export class RateLimiterObject extends MiniflareDurableObject {
	#buckets = new Map<string, number>();
	#epoch = 0;

	@POST("/limit")
	limit: RouteHandler = async (req) => {
		const { key, limit, period } = await req.json<LimitRequestBody>();

		const epoch = Math.floor(Date.now() / (period * 1000));
		if (epoch !== this.#epoch) {
			this.#epoch = epoch;
			this.#buckets.clear();
		}

		const value = this.#buckets.get(key) ?? 0;
		if (value >= limit) {
			return Response.json({ success: false } satisfies LimitResult);
		}
		this.#buckets.set(key, value + 1);
		return Response.json({ success: true } satisfies LimitResult);
	};
}
