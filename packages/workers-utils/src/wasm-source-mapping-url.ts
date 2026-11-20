/**
 * Reads the URL in a WebAssembly module's `sourceMappingURL` custom section,
 * if it has one (https://tc39.es/ecma426/).
 *
 * @param bytes The module's bytes.
 * @returns The URL, or `undefined` if the module has no such section or isn't
 * a valid module.
 */
export function getWasmSourceMappingUrl(bytes: Uint8Array): string | undefined {
	return findSourceMappingUrlSection(bytes)?.url;
}

/**
 * Points a WebAssembly module's `sourceMappingURL` custom section at `url`,
 * replacing the module's section or appending one.
 *
 * @param bytes The module's bytes.
 * @param url The URL to write.
 * @returns The updated module's bytes.
 * @throws If `bytes` isn't a valid module.
 */
export function setWasmSourceMappingUrl(
	bytes: Uint8Array,
	url: string
): Uint8Array {
	const section = findSourceMappingUrlSection(bytes);
	if (section === null) {
		throw new Error("Expected a WebAssembly module.");
	}
	const payload = [...encodeName("sourceMappingURL"), ...encodeName(url)];
	const replacement = [0, ...encodeU32(payload.length), ...payload];
	const start = section?.start ?? bytes.length;
	const end = section?.end ?? bytes.length;
	const result = new Uint8Array(
		start + replacement.length + (bytes.length - end)
	);
	result.set(bytes.subarray(0, start), 0);
	result.set(replacement, start);
	result.set(bytes.subarray(end), start + replacement.length);
	return result;
}

/**
 * Finds a WebAssembly module's `sourceMappingURL` custom section.
 *
 * @returns The section's byte range and URL, `undefined` if the module has no
 * such section, or `null` if `bytes` isn't a valid module.
 */
function findSourceMappingUrlSection(
	bytes: Uint8Array
): { start: number; end: number; url: string } | undefined | null {
	const magic = [0x00, 0x61, 0x73, 0x6d];
	if (bytes.length < 8 || magic.some((byte, i) => bytes[i] !== byte)) {
		return null;
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
		const start = pos;
		const id = bytes[pos++];
		const size = readU32();
		if (size === undefined || pos + size > bytes.length) {
			return null;
		}
		const end = pos + size;
		// Custom sections have id 0 and start with their name.
		if (id === 0 && readName(end) === "sourceMappingURL") {
			const url = readName(end);
			return url === undefined ? null : { start, end, url };
		}
		pos = end;
	}
	return undefined;
}

/** Encodes `value` as an unsigned LEB128 integer. */
function encodeU32(value: number): number[] {
	const bytes = [];
	do {
		let byte = value & 0x7f;
		value >>>= 7;
		if (value !== 0) {
			byte |= 0x80;
		}
		bytes.push(byte);
	} while (value !== 0);
	return bytes;
}

/** Encodes `text` as a WebAssembly name: its UTF-8 length, then its bytes. */
function encodeName(text: string): number[] {
	const bytes = new TextEncoder().encode(text);
	return [...encodeU32(bytes.length), ...bytes];
}
