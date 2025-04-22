import { WorkerEntrypoint } from "cloudflare:workers";

export class LocalAnalyticsEngineDataset
	extends WorkerEntrypoint
	implements AnalyticsEngineDataset
{
	writeDataPoint(_event?: AnalyticsEngineDataPoint): void {
		// no op in dev
	}
}
