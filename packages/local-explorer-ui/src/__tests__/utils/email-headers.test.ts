import {
	EMAIL_HEADER_NAME_CASES,
	EMAIL_HEADER_VALUE_CASES,
	MANAGED_EMAIL_HEADER_CASES,
} from "@cloudflare/workers-utils/test-helpers";
import { test } from "vitest";
import {
	hasInvalidEmailHeaderValueCharacters,
	isEmailHeaderName,
	isManagedEmailHeaderName,
} from "../../utils/email-headers";

for (const [name, value, valid] of EMAIL_HEADER_NAME_CASES) {
	test(`header names: ${name}`, ({ expect }) => {
		expect(isEmailHeaderName(value)).toBe(valid);
	});
}

for (const [name, managed] of MANAGED_EMAIL_HEADER_CASES) {
	test(`managed headers: identifies ${name}`, ({ expect }) => {
		expect(isManagedEmailHeaderName(name)).toBe(managed);
	});
}

for (const [name, value, valid] of EMAIL_HEADER_VALUE_CASES) {
	test(`header values: ${name}`, ({ expect }) => {
		expect(hasInvalidEmailHeaderValueCharacters(value)).toBe(!valid);
	});
}
