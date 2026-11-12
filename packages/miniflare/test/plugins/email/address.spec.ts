import { test } from "vitest";
import {
	extractEmailAddress,
	formatEmailAddress,
	formatParsedAddress,
} from "../../../src/workers/email/address";

test("formatEmailAddress preserves string addresses", ({ expect }) => {
	expect(formatEmailAddress("user@example.com")).toBe("user@example.com");
	expect(formatEmailAddress('"User" <user@example.com>')).toBe(
		'"User" <user@example.com>'
	);
});

test("formatEmailAddress formats named EmailAddress objects", ({ expect }) => {
	expect(
		formatEmailAddress({ name: "Jane Smith", email: "jane@example.com" })
	).toBe('"Jane Smith" <jane@example.com>');
	expect(
		formatEmailAddress({
			name: 'Reply "Sender" \\ Team',
			email: "reply@example.com",
		})
	).toBe('"Reply \\"Sender\\" \\\\ Team" <reply@example.com>');
});

test("formatEmailAddress preserves EmailAddress objects without name", ({
	expect,
}) => {
	expect(formatEmailAddress({ email: "user@example.com" })).toBe(
		"user@example.com"
	);
	expect(formatEmailAddress({ name: "", email: "user@example.com" })).toBe(
		"user@example.com"
	);
});

test("extractEmailAddress reads email from string or object", ({ expect }) => {
	expect(extractEmailAddress("user@example.com")).toBe("user@example.com");
	expect(extractEmailAddress('"User" <user@example.com>')).toBe(
		"user@example.com"
	);
	expect(extractEmailAddress({ email: "user@example.com" })).toBe(
		"user@example.com"
	);
	expect(
		extractEmailAddress({ name: "User", email: "user@example.com" })
	).toBe("user@example.com");
});

test("formatParsedAddress omits empty display names", ({ expect }) => {
	expect(formatParsedAddress({ address: "user@example.com" })).toBe(
		"user@example.com"
	);
	expect(
		formatParsedAddress({ name: "", address: "user@example.com" })
	).toBe("user@example.com");
	expect(
		formatParsedAddress({ name: "User", address: "user@example.com" })
	).toBe('"User" <user@example.com>');
});
