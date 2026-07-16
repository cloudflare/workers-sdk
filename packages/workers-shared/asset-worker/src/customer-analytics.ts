import type { ReadyAnalytics } from "./types";

const VERSION = 1;

type Data = {
	accountId?: number;
	scriptId?: number;
	coloId?: number;
	status?: number;
	hostname?: string;
	cacheStatus?: string;
	scriptVersionId?: string;
};

/**
 * Customer-facing request analytics. Keep this payload limited to fields that
 * are intentionally exposed through the Workers Analytics GraphQL API.
 */
export class CustomerAnalytics {
	private data: Data = {};

	constructor(private readyAnalytics?: ReadyAnalytics) {}

	setData(newData: Partial<Data>) {
		this.data = { ...this.data, ...newData };
	}

	write() {
		if (!this.readyAnalytics) {
			return;
		}

		this.readyAnalytics.logEvent({
			version: VERSION,
			accountId: this.data.accountId,
			indexId: this.data.scriptId?.toString(),
			doubles: [
				undefined, // double1
				this.data.coloId, // double2
				undefined, // double3
				undefined, // double4
				this.data.status, // double5
			],
			blobs: [
				this.data.hostname?.substring(0, 256), // blob1
				undefined, // blob2
				undefined, // blob3
				undefined, // blob4
				undefined, // blob5
				undefined, // blob6
				undefined, // blob7
				this.data.cacheStatus, // blob8
				undefined, // blob9
				undefined, // blob10
				undefined, // blob11
				this.data.scriptVersionId, // blob12
			],
		});
	}
}
