export interface Env {
	DO_REQUEST: DurableObjectNamespace;
}

export interface ScheduledRequest {
	url: string; // URL of the request
	triggerEverySeconds?: number; // optional, reschedule to trigger every x seconds
	triggerAt?: number; // optional, unix timestamp in milliseconds, defaults to `new Date()`
	requestInit?: RequestInit; // optional, includes method, headers, body
}
