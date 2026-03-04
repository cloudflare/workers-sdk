/**
 * A lightweight metrics registry that produces Prometheus text exposition format.
 * This is a drop-in replacement for the most basic usage of `promjs`.
 */
export class MetricsRegistry {
	private counters = new Map<string, { help: string; value: number }>();

	/**
	 * Creates a new metric. Currently only supports counters.
	 */
	create(type: "counter", name: string, help: string) {
		if (type !== "counter") {
			throw new Error(`Unsupported metric type: ${type}`);
		}

		let counter = this.counters.get(name);
		if (!counter) {
			counter = { help, value: 0 };
			this.counters.set(name, counter);
		}

		return {
			inc: (val = 1) => {
				counter!.value += val;
			},
		};
	}

	/**
	 * Returns the metrics in Prometheus text exposition format.
	 */
	metrics(): string {
		let output = "";
		for (const [name, { help, value }] of this.counters) {
			output += `# HELP ${name} ${help}\n`;
			output += `# TYPE ${name} counter\n`;
			output += `${name} ${value}\n`;
		}
		return output;
	}
}
