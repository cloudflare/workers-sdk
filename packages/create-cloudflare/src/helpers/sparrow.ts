import { fetch } from "undici";

// The SPARROW_SOURCE_KEY will be provided at build time through esbuild's `define` option
// No events will be sent if the env `SPARROW_SOURCE_KEY` is not provided and the value will be set to an empty string instead.
const SPARROW_SOURCE_KEY = process.env.SPARROW_SOURCE_KEY ?? "";
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

export async function sendEvent(payload: EventPayload, enableLog?: boolean) {
	if (enableLog) {
		console.log("[telemetry]", JSON.stringify(payload, null, 2));
	}

	try {
		await fetch(`${SPARROW_URL}/api/v1/event`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
			},
			body: JSON.stringify(payload),
		});
	} catch (error) {
		// Ignore any network errors
		if (enableLog) {
			console.log("[telemetry]", error);
		}
	}
}
