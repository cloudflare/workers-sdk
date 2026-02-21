import { createNotImplementedError } from "unenv/_internal/utils";
import type nodePerfHooks from "node:perf_hooks";

const _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();

const _performanceNow = globalThis.performance?.now
	? globalThis.performance.now.bind(globalThis.performance)
	: () => Date.now() - _timeOrigin;

const nodeTiming = {
	name: "node",
	entryType: "node" as const,
	startTime: 0,
	duration: 0,
	nodeStart: 0,
	v8Start: 0,
	bootstrapComplete: 0,
	environment: 0,
	loopStart: 0,
	loopExit: 0,
	idleTime: 0,
	uvMetricsInfo: { loopCount: 0, events: 0, eventsWaiting: 0 },
	// only present in Node.js 18.x
	detail: undefined,
	toJSON() {
		return this;
	},
} satisfies nodePerfHooks.PerformanceNodeTiming;

// PerformanceEntry
export class PerformanceEntry implements nodePerfHooks.PerformanceEntry {
	readonly __unenv__ = true;
	detail: nodePerfHooks.NodeGCPerformanceDetail | unknown | undefined;
	entryType = "event" as nodePerfHooks.EntryType; // abstract
	name: string;
	startTime: number;
	constructor(name?: string, options?: PerformanceMarkOptions) {
		if (name === undefined) {
			throw new TypeError(
				"Failed to construct 'PerformanceEntry': the `name` parameter is required."
			);
		}
		this.name = name;
		this.startTime = options?.startTime || _performanceNow();
		this.detail = options?.detail;
	}
	get duration(): number {
		return _performanceNow() - this.startTime;
	}
	toJSON() {
		return {
			name: this.name,
			entryType: this.entryType,
			startTime: this.startTime,
			duration: this.duration,
			detail: this.detail,
		};
	}
}

// PerformanceMark
export const PerformanceMark: typeof nodePerfHooks.PerformanceMark = class PerformanceMark
	extends PerformanceEntry
	implements nodePerfHooks.PerformanceMark
{
	entryType = "mark" as const;

	constructor() {
		super(
			// eslint-disable-next-line prefer-rest-params
			...(arguments as unknown as ConstructorParameters<
				typeof PerformanceEntry
			>)
		);
	}

	get duration() {
		return 0 as const;
	}
};

// PerformanceMark
export class PerformanceMeasure
	extends PerformanceEntry
	implements nodePerfHooks.PerformanceMeasure
{
	entryType = "measure" as const;
}

// PerformanceResourceTiming
export class PerformanceResourceTiming
	extends PerformanceEntry
	implements nodePerfHooks.PerformanceResourceTiming
{
	entryType = "resource" as const;
	serverTiming: readonly PerformanceServerTiming[] = [];
	connectEnd: number = 0;
	connectStart: number = 0;
	decodedBodySize: number = 0;
	domainLookupEnd: number = 0;
	domainLookupStart: number = 0;
	encodedBodySize: number = 0;
	fetchStart: number = 0;
	initiatorType = "";
	name = "";
	nextHopProtocol = "";
	redirectEnd: number = 0;
	redirectStart: number = 0;
	requestStart: number = 0;
	responseEnd: number = 0;
	responseStart: number = 0;
	secureConnectionStart: number = 0;
	startTime: number = 0;
	transferSize: number = 0;
	workerStart: number = 0;
	responseStatus: number = 0;
}

// PerformanceObserverEntryList
export class PerformanceObserverEntryList
	implements nodePerfHooks.PerformanceObserverEntryList
{
	readonly __unenv__ = true;

	getEntries(): nodePerfHooks.PerformanceEntry[] {
		return [];
	}

	getEntriesByName(
		_name: string,
		_type?: string | undefined
	): nodePerfHooks.PerformanceEntry[] {
		return [];
	}

	getEntriesByType(_type: string): nodePerfHooks.PerformanceEntry[] {
		return [];
	}
}

// Performance
export class Performance implements nodePerfHooks.Performance {
	readonly __unenv__ = true;

	timeOrigin: number = _timeOrigin;

	eventCounts: EventCounts = new Map<string, number>();

	_entries: PerformanceEntry[] = [];

	_resourceTimingBufferSize = 0;

	navigation = undefined;
	timing = undefined;

	timerify<T extends (...params: unknown[]) => unknown>(
		_fn: T,
		_options?: nodePerfHooks.TimerifyOptions | undefined
	): T {
		throw createNotImplementedError("Performance.timerify");
	}

	get nodeTiming(): nodePerfHooks.PerformanceNodeTiming {
		return nodeTiming;
	}

	eventLoopUtilization() {
		return {} as nodePerfHooks.EventLoopUtilization;
	}

	markResourceTiming(): nodePerfHooks.PerformanceResourceTiming {
		// TODO: create a new PerformanceResourceTiming entry
		// so that performance.getEntries, getEntriesByName, and getEntriesByType return it
		// see: https://nodejs.org/api/perf_hooks.html#performancemarkresourcetimingtiminginfo-requestedurl-initiatortype-global-cachemode-bodyinfo-responsestatus-deliverytype
		return new PerformanceResourceTiming("");
	}

	onresourcetimingbufferfull:
		| ((this: Performance, ev: Event) => unknown)
		| null = null;

	now(): number {
		// https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
		if (this.timeOrigin === _timeOrigin) {
			return _performanceNow();
		}
		return Date.now() - this.timeOrigin;
	}

	clearMarks(markName?: string | undefined): void {
		this._entries = markName
			? this._entries.filter(
					(e) => !(e.name === markName && e.entryType === "mark")
				)
			: this._entries.filter((e) => e.entryType !== "mark");
	}

	clearMeasures(measureName?: string | undefined): void {
		this._entries = measureName
			? this._entries.filter(
					(e) => !(e.name === measureName && e.entryType === "measure")
				)
			: this._entries.filter((e) => e.entryType !== "measure");
	}

	clearResourceTimings(): void {
		this._entries = this._entries.filter(
			(e) =>
				e.entryType !== "resource" || (e.entryType as string) !== "navigation"
		);
	}

	getEntries() {
		return this._entries;
	}

	getEntriesByName(name: string, type?: string | undefined) {
		return this._entries.filter(
			(e) => e.name === name && (!type || e.entryType === type)
		);
	}

	getEntriesByType(type: string) {
		return this._entries.filter((e) => e.entryType === type);
	}

	mark(name: string, options?: PerformanceMarkOptions | undefined) {
		// @ts-expect-error constructor is not protected
		const entry = new PerformanceMark(name, options);
		this._entries.push(entry);
		return entry;
	}

	measure(
		measureName: string,
		startOrMeasureOptions?: string | PerformanceMeasureOptions,
		endMark?: string
	) {
		let start: number;
		let end: number;
		if (typeof startOrMeasureOptions === "string") {
			start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]
				?.startTime;
			if (endMark === undefined) {
				throw new TypeError(
					"Performance.measure: endMark must be provided when startOrMeasureOptions is a string"
				);
			}
			end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
		} else {
			start = Number.parseFloat(startOrMeasureOptions?.start as string);
			if (Number.isNaN(start)) {
				start = this.now();
			}
			end = Number.parseFloat(startOrMeasureOptions?.end as string);
			if (Number.isNaN(end)) {
				end = this.now();
			}
		}
		const entry = new PerformanceMeasure(measureName, {
			startTime: start,
			detail: { start, end },
		});
		this._entries.push(entry);
		return entry;
	}

	setResourceTimingBufferSize(maxSize: number): void {
		this._resourceTimingBufferSize = maxSize;
	}

	addEventListener<K extends "resourcetimingbufferfull">(
		type: K,
		listener: (this: Performance, ev: PerformanceEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions | undefined
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions | undefined
	): void;
	addEventListener(
		_type: unknown,
		_listener: unknown,
		_options?: unknown
	): void {
		throw createNotImplementedError("Performance.addEventListener");
	}

	removeEventListener<K extends "resourcetimingbufferfull">(
		type: K,
		listener: (this: Performance, ev: PerformanceEventMap[K]) => unknown,
		options?: boolean | EventListenerOptions | undefined
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions | undefined
	): void;
	removeEventListener(
		_type: unknown,
		_listener: unknown,
		_options?: unknown
	): void {
		throw createNotImplementedError("Performance.removeEventListener");
	}

	dispatchEvent(_event: Event): boolean {
		throw createNotImplementedError("Performance.dispatchEvent");
	}

	toJSON() {
		return this;
	}
}

// PerformanceObserver
export class PerformanceObserver implements nodePerfHooks.PerformanceObserver {
	readonly __unenv__ = true;

	static supportedEntryTypes: ReadonlyArray<string> = [];

	_callback: nodePerfHooks.PerformanceObserverCallback | null = null;

	constructor(callback: nodePerfHooks.PerformanceObserverCallback) {
		this._callback = callback;
	}

	takeRecords() {
		return [];
	}

	disconnect(): void {
		throw createNotImplementedError("PerformanceObserver.disconnect");
	}

	observe(_options: unknown) {
		throw createNotImplementedError("PerformanceObserver.observe");
	}

	bind<Func extends (...args: unknown[]) => unknown>(fn: Func): Func {
		return fn;
	}

	runInAsyncScope<This, Result>(
		fn: (this: This | undefined, ...args: unknown[]) => Result,
		thisArg?: This | undefined,
		...args: unknown[]
	) {
		return fn.call(thisArg, ...args);
	}

	asyncId(): number {
		return 0;
	}

	triggerAsyncId(): number {
		return 0;
	}

	emitDestroy(): this {
		return this;
	}
}

export const performance: nodePerfHooks.Performance = new Performance();
