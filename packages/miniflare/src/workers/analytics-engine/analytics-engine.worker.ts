interface Env {
	dataset: string;
}
class LocalAnalyticsEngineDataset implements AnalyticsEngineDataset {
	constructor(private env: Env) {}
	writeDataPoint(_event?: AnalyticsEngineDataPoint): void {
		// no op in dev
	}
}

export default function (env: Env) {
	return new LocalAnalyticsEngineDataset(env);
}
