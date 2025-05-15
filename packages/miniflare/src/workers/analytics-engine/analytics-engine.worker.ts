export class LocalAnalyticsEngineDataset implements AnalyticsEngineDataset {
	writeDataPoint(_event?: AnalyticsEngineDataPoint): void {
		// no op in dev
	}
}

export default function () {
	return new LocalAnalyticsEngineDataset();
}
