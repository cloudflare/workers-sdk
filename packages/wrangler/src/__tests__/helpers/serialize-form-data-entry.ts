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
