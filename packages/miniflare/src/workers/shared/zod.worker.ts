import { Buffer } from "node:buffer";
import * as z from "zod/v4";

export const HEX_REGEXP = /^[0-9a-f]*$/i;
// https://github.com/capnproto/capnproto/blob/6b5bcc2c6e954bc6e167ac581eb628e5a462a469/c%2B%2B/src/kj/encoding.c%2B%2B#L719-L720
export const BASE64_REGEXP = /^[0-9a-z+/=]*$/i;
export const HexDataSchema = z
	.string()
	.regex(HEX_REGEXP)
	.transform((hex) => Buffer.from(hex, "hex"));
export const Base64DataSchema = z
	.string()
	.regex(BASE64_REGEXP)
	.transform((base64) => Buffer.from(base64, "base64"));

export { z };
