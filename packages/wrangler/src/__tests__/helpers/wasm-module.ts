import { Buffer } from "node:buffer";

/**
 * Builds a WebAssembly module whose only section is a custom section: a
 * `sourceMappingURL` section holding `sourceMappingUrl` when given, or an
 * unrelated `producers` section otherwise.
 */
export function wasmModuleWithSourceMappingUrl(
	sourceMappingUrl?: string
): Buffer<ArrayBuffer> {
	const encodeName = (text: string) => {
		const bytes = Buffer.from(text);
		return [bytes.length, ...bytes];
	};
	const payload =
		sourceMappingUrl === undefined
			? [...encodeName("producers"), 0]
			: [...encodeName("sourceMappingURL"), ...encodeName(sourceMappingUrl)];
	return Buffer.from([
		...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
		0,
		payload.length,
		...payload,
	]);
}
