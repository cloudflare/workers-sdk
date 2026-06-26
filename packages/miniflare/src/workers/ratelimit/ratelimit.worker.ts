// Emulated Ratelimit Binding

// ENV configuration
interface RatelimitConfig {
	namespaceId: number;
	limit: number;
	period: number;
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
	namespaceId: number;
	limitVal: number;
	period: number;
	buckets: Map<string, number>;
	epoch: number;

	constructor(config: RatelimitConfig) {
		this.namespaceId = config.namespaceId;
		this.limitVal = config.limit;
		this.period = config.period;

		this.buckets = new Map<string, number>();
		this.epoch = 0;
	}

	// Resets the in-memory bucket state so tests start from a clean slate.
	reset(): void {
		this.buckets.clear();
		this.epoch = 0;
	}

	// method that counts and checks against the limit in in-memory buckets
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

		const epoch = Math.floor(Date.now() / (period * 1000));
		if (epoch != this.epoch) {
			// clear counters
			this.epoch = epoch;
			this.buckets.clear();
		}
		const val = this.buckets.get(key) || 0;
		if (val >= limit) {
			return {
				success: false,
			};
		}
		this.buckets.set(key, val + 1);
		return {
			success: true,
		};
	}
}

// Module-level set tracking all instances created during this Worker lifetime.
// The ratelimit extension module is marked `internal: true` in workerd, making
// direct import impossible from outside. We expose a single reset function via
// globalThis so vitest-pool-workers' reset() can invoke it without a global
// variable that leaks to user code (the function is set once on module load).
const instances = new Set<Ratelimit>();
(globalThis as { __cfRatelimitReset__?: () => void }).__cfRatelimitReset__ =
	() => {
		for (const instance of instances) {
			instance.reset();
		}
	};

// create a new Ratelimit
export default function (env: RatelimitConfig) {
	const instance = new Ratelimit(env);
	instances.add(instance);
	return instance;
}
