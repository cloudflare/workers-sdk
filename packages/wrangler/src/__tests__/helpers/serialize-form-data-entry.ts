import type { FormDataEntryValue } from "undici";

export async function serialize(entry: FormDataEntryValue | null) {
	if (!entry) {
		return null;
	}
	return typeof entry === "string" ? entry : await entry.text();
}

export async function toString(entry: FormDataEntryValue | null) {
	return (await serialize(entry)) ?? "";
}

/**
 * Convert FormData to a plain object for consistent snapshotting across Node versions.
 * The internal representation of FormData varies between Node versions, so we convert
 * it to a simple array of {name, value} objects.
 */
export async function formDataToObject(
	formData: FormData
): Promise<Array<{ name: string; value: string }>> {
	const result: Array<{ name: string; value: string }> = [];
	for (const [name, value] of formData.entries()) {
		result.push({
			name,
			value: typeof value === "string" ? value : await value.text(),
		});
	}
	return result;
}
