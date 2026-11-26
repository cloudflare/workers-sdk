// Emulated Ratelimit Binding
//
// Thin client: keeps option validation local (so error messages surface
// synchronously in the caller's isolate), forwards each `.limit()` call to
// the `RateLimiterObject` Durable Object, which owns the bucket/epoch state.

// ENV configuration
interface RatelimitConfig {
	limit: number;
	period: number;
	fetcher: Fetcher;
}

// options for Ratelimit
//   (should be kept in sync with `RatelimitOptions` in https://gitlab.cfdata.org/cloudflare/ew/edgeworker/-/blob/master/src/edgeworker/internal-api/ratelimit.h)
const RatelimitOptionKeys = ["key", "limit", "period", "delta"];
const RatelimitPeriodValues = [10, 60];
const MAX_UINT32 = 0xffffffff;

// result from Ratelimit call
//   (should be kept in sync with `RatelimitResult` in https://gitlab.cfdata.org/cloudflare/ew/edgeworker/-/blob/master/src/edgeworker/internal-api/ratelimit.h)
interface RatelimitResult {
	success: boolean;
}

function validate(test: boolean, message: string): asserts test {
	if (!test) {
		throw new Error(message);
	}
}

/**
 * Converts `delta` to a non-zero `uint32`, truncating fractions. Values
 * outside the `uint32` range throw `TypeError` and zero throws `RangeError`,
 * matching the deployed binding's errors.
 *
 * @param delta The `delta` option passed to `limit()`.
 * @returns The weight to add to the counter.
 */
function toDelta(delta: unknown): number {
	// Unary `+` applies `ToNumber`, so a BigInt throws `TypeError` (whereas
	// `Number(2n)` would silently convert it)
	const value = +(delta as number);
	if (!Number.isFinite(value)) {
		throw new TypeError(
			"The value cannot be converted because it is not an integer."
		);
	}
	if (value < 0) {
		throw new TypeError(
			"The value cannot be converted because it is negative and this API expects a positive number."
		);
	}
	if (value > MAX_UINT32) {
		throw new TypeError(
			`Value out of range. Must be less than or equal to ${MAX_UINT32}.`
		);
	}
	const truncated = Math.trunc(value);
	if (truncated === 0) {
		throw new RangeError("delta must be non-zero");
	}
	return truncated;
}

class Ratelimit {
	fetcher: Fetcher;
	limitVal: number;
	period: number;

	constructor(config: RatelimitConfig) {
		this.fetcher = config.fetcher;
		this.limitVal = config.limit;
		this.period = config.period;
	}

	// method that counts and checks against the limit, delegating the actual
	// bucket/epoch bookkeeping to the `RateLimiterObject` Durable Object
	async limit(options: unknown): Promise<RatelimitResult> {
		// validate options input
		validate(
			typeof options === "object" && options !== null,
			"invalid rate limit options"
		);
		const invalidProps = Object.keys(options ?? {}).filter(
			(key) => !RatelimitOptionKeys.includes(key)
		);
		validate(
			invalidProps.length == 0,
			`bad rate limit options: [${invalidProps.join(",")}]`
		);
		const {
			key = "",
			limit = this.limitVal,
			period = this.period,
			delta = 1,
		} = options as Record<string, unknown>;
		validate(typeof key === "string", `invalid key: ${key}`);
		validate(typeof limit === "number", `limit must be a number: ${limit}`);
		validate(typeof period === "number", `period must be a number: ${period}`);
		validate(
			RatelimitPeriodValues.includes(period),
			`unsupported period: ${period}`
		);
		const weight = toDelta(delta);

		const res = await this.fetcher.fetch("http://ratelimit/limit", {
			method: "POST",
			body: JSON.stringify({ key, limit, period, delta: weight }),
		});
		return await res.json<RatelimitResult>();
	}
}

// create a new Ratelimit
export default function (env: RatelimitConfig) {
	return new Ratelimit(env);
}
