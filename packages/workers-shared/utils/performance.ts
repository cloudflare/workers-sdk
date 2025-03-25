import type { UnsafePerformanceTimer } from "./types.js";

export class PerformanceTimer {
	private performanceTimer;

	constructor(performanceTimer?: UnsafePerformanceTimer) {
		this.performanceTimer = performanceTimer;
	}

	now() {
		if (this.performanceTimer) {
			return this.performanceTimer.timeOrigin + this.performanceTimer.now();
		}
		return Date.now();
	}
}
