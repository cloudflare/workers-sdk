const REPORT_ID = 0x06;
const RPC_CHANNEL = 0x02;
const REPORT_HEADER_LENGTH = 3;
const MAX_PAYLOAD_LENGTH = 61;
const MAX_BUFFER_LENGTH = 64 * 1024;

export const CODEX_MICRO_VENDOR_ID = 0x303a;
export const CODEX_MICRO_PRODUCT_ID = 0x8360;
export const CODEX_MICRO_USAGE_PAGE = 0xff00;

export const CODEX_MICRO_KEYS = [
	"AG00",
	"AG01",
	"AG02",
	"AG03",
	"AG04",
	"AG05",
	"ENC_CW",
	"ENC_CC",
	"ENC",
] as const;

export type CodexMicroKey = (typeof CODEX_MICRO_KEYS)[number];

export interface CodexMicroKeyEvent {
	key: CodexMicroKey;
	action?: number;
	agent?: number;
}

interface JsonRpcNotification {
	method?: unknown;
	m?: unknown;
	params?: unknown;
	p?: unknown;
}

interface HidNotificationParams {
	k?: unknown;
	act?: unknown;
	ag?: unknown;
}

export class CodexMicroProtocol {
	#buffer = "";

	pushReport(report: Buffer): CodexMicroKeyEvent[] {
		const payload = readRpcPayload(report);
		if (payload === undefined) {
			return [];
		}

		this.#buffer += payload;
		if (this.#buffer.length > MAX_BUFFER_LENGTH) {
			this.#buffer = "";
			return [];
		}

		const lines = this.#buffer.split(/\r?\n/);
		this.#buffer = lines.pop() ?? "";

		const events: CodexMicroKeyEvent[] = [];
		for (const line of lines) {
			const event = parseKeyNotification(line);
			if (event !== undefined) {
				events.push(event);
			}
		}
		return events;
	}

	reset(): void {
		this.#buffer = "";
	}
}

function readRpcPayload(report: Buffer): string | undefined {
	if (
		report.length < REPORT_HEADER_LENGTH ||
		report[0] !== REPORT_ID ||
		report[1] !== RPC_CHANNEL
	) {
		return undefined;
	}

	const payloadLength = report[2];
	if (
		payloadLength === undefined ||
		payloadLength > MAX_PAYLOAD_LENGTH ||
		REPORT_HEADER_LENGTH + payloadLength > report.length
	) {
		return undefined;
	}

	return report
		.subarray(REPORT_HEADER_LENGTH, REPORT_HEADER_LENGTH + payloadLength)
		.toString("utf8");
}

function parseKeyNotification(line: string): CodexMicroKeyEvent | undefined {
	const trimmed = line.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	let notification: JsonRpcNotification;
	try {
		notification = JSON.parse(trimmed) as JsonRpcNotification;
	} catch {
		return undefined;
	}

	if ((notification.method ?? notification.m) !== "v.oai.hid") {
		return undefined;
	}

	const params = notification.params ?? notification.p;
	if (!isRecord(params)) {
		return undefined;
	}

	const hidParams = params as HidNotificationParams;
	if (!isCodexMicroKey(hidParams.k)) {
		return undefined;
	}

	return {
		key: hidParams.k,
		...(typeof hidParams.act === "number" ? { action: hidParams.act } : {}),
		...(typeof hidParams.ag === "number" ? { agent: hidParams.ag } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isCodexMicroKey(value: unknown): value is CodexMicroKey {
	return (
		typeof value === "string" && CODEX_MICRO_KEYS.some((key) => key === value)
	);
}
