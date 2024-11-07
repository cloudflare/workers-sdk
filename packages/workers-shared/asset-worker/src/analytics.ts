import type { ReadyAnalytics } from "./types";

// This will allow us to make breaking changes to the analytic schema
const VERSION = 1;

// When adding new columns please update the schema
type Data = {
	// -- Doubles --
	// double1 - The time it takes for the whole request to complete in milliseconds
	requestTime?: number;
	// double2 - Colo ID
	coloId?: number;
	// double3 - Metal ID
	metalId?: number;
	// double4 - Colo tier (e.g. tier 1, tier 2, tier 3)
	coloTier?: number;

	// -- Blobs --
	// blob1 - Hostname of the request
	hostname?: string;
	// blob2 - User agent making the request
	userAgent?: string;
	// blob3 - Html handling option
	htmlHandling?: string;
	// blob4 - Not found handling option
	notFoundHandling?: string;
	// blob5 - Error message
	error?: string;
	// blob6 - The current version UUID of asset-worker
	version?: string;
	// blob7 - Region of the colo (e.g. WEUR)
	coloRegion?: string;
};

export class Analytics {
	private data: Data = {};
	private readyAnalytics?: ReadyAnalytics;

	constructor(readyAnalytics?: ReadyAnalytics) {
		this.readyAnalytics = readyAnalytics;
	}

	setData(newData: Partial<Data>) {
		this.data = { ...this.data, ...newData };
	}

	getData(key: keyof Data) {
		return this.data[key];
	}

	write() {
		if (!this.readyAnalytics) {
			return;
		}

		this.readyAnalytics.logEvent({
			version: VERSION,
			accountId: 0, // TODO: need to plumb through
			indexId: this.data.hostname?.substring(0, 96),
			doubles: [
				this.data.requestTime ?? -1, // double1
				this.data.coloId ?? -1, // double2
				this.data.metalId ?? -1, // double3
				this.data.coloTier ?? -1, // double4
			],
			blobs: [
				this.data.hostname?.substring(0, 256), // blob1 - trim to 256 bytes
				this.data.userAgent?.substring(0, 256), // blob2 - trim to 256 bytes
				this.data.htmlHandling, // blob3
				this.data.notFoundHandling, // blob4
				this.data.error?.substring(0, 256), // blob5 - trim to 256 bytes
				this.data.version, // blob6
				this.data.coloRegion, // blob7
			],
		});
	}
}
