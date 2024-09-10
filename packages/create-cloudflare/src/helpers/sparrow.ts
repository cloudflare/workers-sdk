import { fetch } from "undici";

// The SPARROW_SOURCE_KEY will be provided at build time through esbuild's `define` option
// No events will be sent if the env `SPARROW_SOURCE_KEY` is not provided and the value will be set as an empty string instead.
declare const SPARROW_SOURCE_KEY: string;
const SPARROW_URL: string = "https://sparrow.cloudflare.com";

export type EventPayload = {
	event: string;
	deviceId: string;
	timestamp: number | undefined;
	properties: Record<string, unknown>;
};

export function hasSparrowSourceKey() {
	return SPARROW_SOURCE_KEY !== "";
}

export async function sendEvent(payload: EventPayload) {
	await fetch(`${SPARROW_URL}/api/v1/event`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
		},
		body: JSON.stringify(payload),
	});
}
