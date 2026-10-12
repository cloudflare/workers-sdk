import {
	EMAIL_HEADER_NAME_CASES,
	EMAIL_HEADER_VALUE_CASES,
	MANAGED_EMAIL_HEADER_CASES,
} from "@cloudflare/workers-utils/test-helpers";
import { test } from "vitest";
import {
	hasInvalidHeaderValueCharacters,
	isHeaderName,
	isManagedEmailHeaderName,
} from "../../src/workers/email/input-validation";

for (const [name, value, valid] of EMAIL_HEADER_NAME_CASES) {
	test(`header names: ${name}`, ({ expect }) => {
		expect(isHeaderName(value)).toBe(valid);
	});
}

for (const [name, managed] of MANAGED_EMAIL_HEADER_CASES) {
	test(`managed headers: identifies ${name}`, ({ expect }) => {
		expect(isManagedEmailHeaderName(name)).toBe(managed);
	});
}

for (const [name, value, valid] of EMAIL_HEADER_VALUE_CASES) {
	test(`header values: ${name}`, ({ expect }) => {
		expect(hasInvalidHeaderValueCharacters(value)).toBe(!valid);
	});
}
