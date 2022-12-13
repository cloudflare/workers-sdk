import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { TextDecoder, TextEncoder } from "util";
import { Clock, sanitisePath } from "@miniflare/tre";
import { ExecutionContext } from "ava";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8Encode(value: string): Uint8Array {
	return encoder.encode(value);
}
export function utf8Decode(encoded?: Uint8Array): string {
	return decoder.decode(encoded);
}

// Stored expiration value to signal an expired key. Storages using actual
// time should interpret this as the current time.
export const TIME_EXPIRED = 500;
// Time in seconds the testClock always returns:
// TIME_EXPIRED < TIME_NOW < TIME_EXPIRING
export const TIME_NOW = 750;
// Stored expiration value to signal a key that will expire in the future.
// Storages using actual time should interpret this as the current time + 1hr.
// Tests will check the expiry is within 120s of this.
export const TIME_EXPIRING = 1000;

export const testClock: Clock = () => TIME_NOW * 1000;

const tmpRoot = path.resolve(".tmp");
export async function useTmp(t: ExecutionContext): Promise<string> {
	const filePath = path.join(
		tmpRoot,
		sanitisePath(t.title),
		crypto.randomBytes(4).toString("hex")
	);
	await fs.mkdir(filePath, { recursive: true });
	return filePath;
}
