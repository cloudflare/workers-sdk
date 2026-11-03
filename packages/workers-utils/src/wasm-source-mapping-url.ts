/**
 * Reads the URL in a WebAssembly module's `sourceMappingURL` custom section,
 * if it has one (https://tc39.es/ecma426/).
 *
 * @param bytes The module's bytes.
 * @returns The URL, or `undefined` if the module has no such section or isn't
 * a valid module.
 */
export function getWasmSourceMappingUrl(bytes: Uint8Array): string | undefined {
	const magic = [0x00, 0x61, 0x73, 0x6d];
	if (bytes.length < 8 || magic.some((byte, i) => bytes[i] !== byte)) {
		return undefined;
	}
	let pos = 8; // Skip the magic number and version.
	// Reads an unsigned LEB128 integer, as used for sizes and name lengths.
	const readU32 = () => {
		let result = 0;
		for (let shift = 0; shift < 35; shift += 7) {
			if (pos >= bytes.length) {
				return undefined;
			}
			const byte = bytes[pos++];
			result += (byte & 0x7f) * 2 ** shift;
			if ((byte & 0x80) === 0) {
				return result;
			}
		}
		return undefined;
	};
	const readName = (end: number) => {
		const length = readU32();
		if (length === undefined || pos + length > end) {
			return undefined;
		}
		const name = new TextDecoder().decode(bytes.subarray(pos, pos + length));
		pos += length;
		return name;
	};
	while (pos < bytes.length) {
		const id = bytes[pos++];
		const size = readU32();
		if (size === undefined || pos + size > bytes.length) {
			return undefined;
		}
		const end = pos + size;
		// Custom sections have id 0 and start with their name.
		if (id === 0 && readName(end) === "sourceMappingURL") {
			return readName(end);
		}
		pos = end;
	}
	return undefined;
}
