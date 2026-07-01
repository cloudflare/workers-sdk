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
//   (should be kept in sync with https://bitbucket.cfdata.org/projects/EW/repos/edgeworker/browse/src/edgeworker/internal-api/ratelimit.capnp)
const RatelimitOptionKeys = ["key", "limit", "period"];
const RatelimitPeriodValues = [10, 60];

// result from Ratelimit call
//   (should be kept in sync with https://bitbucket.cfdata.org/projects/EW/repos/edgeworker/browse/src/edgeworker/internal-api/ratelimit.capnp)
interface RatelimitResult {
	success: boolean;
}

function validate(test: boolean, message: string): asserts test {
	if (!test) {
		throw new Error(message);
	}
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
		} = options as Record<string, unknown>;
		validate(typeof key === "string", `invalid key: ${key}`);
		validate(typeof limit === "number", `limit must be a number: ${limit}`);
		validate(typeof period === "number", `period must be a number: ${period}`);
		validate(
			RatelimitPeriodValues.includes(period),
			`unsupported period: ${period}`
		);

		const res = await this.fetcher.fetch("http://ratelimit/limit", {
			method: "POST",
			body: JSON.stringify({ key, limit, period }),
		});
		return await res.json<RatelimitResult>();
	}
}

// create a new Ratelimit
export default function (env: RatelimitConfig) {
	return new Ratelimit(env);
}
