interface Env {
	dataset: string;
	persistence: Fetcher;
}
class LocalAnalyticsEngineDataset implements AnalyticsEngineDataset {
	constructor(private env: Env) {}
	writeDataPoint(event?: AnalyticsEngineDataPoint): void {
		const indexes = event?.indexes ?? [];
		const blobs = event?.blobs ?? [];
		const doubles = event?.doubles ?? [];

		const payload = {
			dataset: this.env.dataset,
			timestamp: new Date().toISOString(),
			index1: indexes[0] ?? "",
			blobs: Array.from({ length: 20 }, (_, i) => {
				const val = i < blobs.length ? blobs[i] : null;
				if (val === null || val === undefined) {
					return "";
				}
				if (val instanceof ArrayBuffer) {
					return Array.from(new Uint8Array(val))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join("");
				}
				return String(val);
			}),
			doubles: Array.from({ length: 20 }, (_, i) =>
				i < doubles.length ? doubles[i] ?? 0 : 0
			),
		};

		// Fire-and-forget: workerd tracks this subrequest within the I/O context
		this.env.persistence
			.fetch("http://localhost/analytics-engine/write", {
				method: "POST",
				body: JSON.stringify(payload),
			})
			.catch(() => {
				// Silently swallow write errors in local dev
			});
	}
}

export default function (env: Env) {
	return new LocalAnalyticsEngineDataset(env);
}
