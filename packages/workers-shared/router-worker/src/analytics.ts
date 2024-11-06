import type { ReadyAnalytics } from "./types";

// This will allow us to make breaking changes to the analytic schema
const VERSION = 1;

export enum DISPATCH_TYPE {
	ASSETS = "asset",
	WORKER = "worker",
}

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
	// blob2 - Dispatch type - what kind of thing did we dispatch
	dispatchtype?: DISPATCH_TYPE;
	// blob3 - Error message
	error?: string;
	// blob4 - The current version UUID of router-server
	version?: string;
	// blob5 - Region of the colo (e.g. WEUR)
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
				this.data.dispatchtype, // blob2
				this.data.error?.substring(0, 256), // blob3 - trim to 256 bytes
				this.data.version, // blob4
				this.data.coloRegion, // blob5
			],
		});
	}
}
