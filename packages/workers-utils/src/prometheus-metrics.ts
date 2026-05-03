/**
 * Lightweight Prometheus metrics registry for push-based counter metrics.
 *
 * Designed for ephemeral per-request usage in Cloudflare Workers that push
 * metrics to a Prometheus push gateway. Replaces the deprecated `promjs` library.
 *
 * @example
 * ```ts
 * const metrics = new MetricsRegistry();
 * const reqCounter = metrics.createCounter(
 *   "service_request_total",
 *   "Total requests"
 * );
 * reqCounter.inc();
 *
 * // Push to Prometheus gateway
 * ctx.waitUntil(
 *   fetch(prometheusUrl, {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${token}` },
 *     body: metrics.metrics(),
 *   })
 * );
 * ```
 */

export interface Counter {
	/** Increment the counter by 1. */
	inc(): void;
	/** Increment the counter by the given non-negative amount. */
	add(amount: number): void;
}

interface CounterEntry {
	name: string;
	help: string;
	value: number;
}

export class MetricsRegistry {
	private counters: CounterEntry[] = [];

	/**
	 * Create and register a new counter metric.
	 *
	 * @param name - The metric name (e.g. "service_request_total")
	 * @param help - A human-readable description of the metric
	 * @returns A Counter that can be incremented
	 */
	createCounter(name: string, help: string): Counter {
		const entry: CounterEntry = { name, help, value: 0 };
		this.counters.push(entry);
		return {
			inc: () => {
				entry.value++;
			},
			add: (amount: number) => {
				if (amount < 0) {
					throw new Error("Counter value cannot decrease");
				}
				entry.value += amount;
			},
		};
	}

	/**
	 * Serialize all registered metrics in Prometheus text exposition format.
	 *
	 * @see https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format
	 */
	metrics(): string {
		return this.counters
			.map((c) => {
				let result = "";
				if (c.help.length > 0) {
					result += `# HELP ${c.name} ${c.help}\n`;
				}
				result += `# TYPE ${c.name} counter\n`;
				result += `${c.name} ${c.value}\n`;
				return result;
			})
			.join("");
	}
}
