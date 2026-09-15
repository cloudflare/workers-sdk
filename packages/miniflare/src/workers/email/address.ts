import { extractAddressFromString } from "./message-id";
import type { EmailAddress } from "./types";

function quoteDisplayName(name: string): string {
	return `"${name.replace(/["\\]/gu, (character) => `\\${character}`)}"`;
}

export function formatParsedAddress(address: {
	address?: string;
	name?: string;
}): string {
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
