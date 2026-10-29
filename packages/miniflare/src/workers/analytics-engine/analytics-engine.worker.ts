import type AnalyticsEngineClient from "./remote.worker";

interface Env {
	dataset: string;
	// Only set when the binding is configured to write to the remote dataset
	remote?: Service<AnalyticsEngineClient>;
}
class LocalAnalyticsEngineDataset implements AnalyticsEngineDataset {
	constructor(private env: Env) {}
	writeDataPoint(event?: AnalyticsEngineDataPoint): void {
		// Locally this is a no-op
		if (!this.env.remote) {
			return;
		}

		// `writeDataPoint()` is synchronous, so we can't wait for the remote write.
		// The remote client accepts the call straight away and keeps the write
		// alive itself (see `remote.worker.ts`), so this only fails if that call
		// can't be made at all.
		this.env.remote.writeDataPoint(event).catch((error: unknown) => {
			console.error(
				`Failed to write data point to Analytics Engine dataset "${this.env.dataset}":`,
				error
			);
		});
	}
}

export default function (env: Env) {
	return new LocalAnalyticsEngineDataset(env);
}
