import { extractAddressFromString } from "./message-id";
import type { EmailAddress } from "./types";

function quoteDisplayName(name: string): string {
	return `"${name.replace(/["\\]/gu, (character) => `\\${character}`)}"`;
}

interface ParsedAddress {
	address?: string;
	group?: ParsedAddress[];
	name?: string;
}

export function formatParsedAddress(address: ParsedAddress): string {
	if (address.group !== undefined) {
		const members = address.group.map(formatParsedAddress).join(", ");
		if (address.name === undefined || address.name === "") {
			return members;
		}
		return `${quoteDisplayName(address.name)}:${members === "" ? "" : ` ${members}`};`;
	}
	const email = address.address ?? "";
	return address.name === undefined || address.name === ""
		? email
		: `${quoteDisplayName(address.name)} <${email}>`;
}

export function extractEmailAddress(address: string | EmailAddress): string {
	return typeof address === "string"
		? extractAddressFromString(address)
		: address.email;
}

export function formatEmailAddress(address: string | EmailAddress): string {
	return typeof address === "string"
		? address
		: `${quoteDisplayName(address.name)} <${address.email}>`;
}
