import { describe, it } from "vitest";
import {
	isValidStepConfig,
	isValidStepName,
	isValidWorkflowInstanceId,
	isValidWorkflowName,
	MAX_STEP_NAME_LENGTH,
	MAX_WORKFLOW_INSTANCE_ID_LENGTH,
	MAX_WORKFLOW_NAME_LENGTH,
} from "../src/lib/validators";

describe("Workflow name validation", () => {
	it.for([
		"",
		NaN,
		undefined,
		"   ",
		"\n\nhello",
		"w".repeat(MAX_WORKFLOW_NAME_LENGTH + 1),
		"#1231231!!!!",
		"-badName",
	])("should reject invalid names", (value, { expect }) => {
		expect(isValidWorkflowName(value as string)).toBe(false);
	});

	it.for([
		"abc",
		"NAME_123-hello",
		"a-valid-string",
		"w".repeat(MAX_WORKFLOW_NAME_LENGTH),
	])("should accept valid names", (value, { expect }) => {
		expect(isValidWorkflowName(value as string)).toBe(true);
	});
});

describe("Workflow instance ID validation", () => {
	it.for([
		"",
		NaN,
		undefined,
		"   ",
		"\n\nhello",
		"w".repeat(MAX_WORKFLOW_INSTANCE_ID_LENGTH + 1),
		"#1231231!!!!",
	])("should reject invalid IDs", (value, { expect }) => {
		expect(isValidWorkflowInstanceId(value as string)).toBe(false);
	});

	it.for([
		"abc",
		"NAME_123-hello",
		"a-valid-string",
		"w".repeat(MAX_WORKFLOW_INSTANCE_ID_LENGTH),
	])("should accept valid IDs", (value, { expect }) => {
		expect(isValidWorkflowInstanceId(value as string)).toBe(true);
	});
});

describe("Workflow instance step name validation", () => {
	it.for(["\x00", "w".repeat(MAX_STEP_NAME_LENGTH + 1)])(
		"should reject invalid names",
		(value, { expect }) => {
			expect(isValidStepName(value as string)).toBe(false);
		}
	);

	it.for([
		"abc",
		"NAME_123-hello",
		"a-valid-string",
		"w".repeat(MAX_STEP_NAME_LENGTH),
		"valid step name",
	])("should accept valid names", (value, { expect }) => {
		expect(isValidStepName(value as string)).toBe(true);
	});
});

describe("Workflow step config validation", () => {
	it.each([
		{ timeout: "5 years", retries: { limit: 1 } },
		{ timeout: "5 years", retries: { delay: 50 } },
		{ timeout: "5 years", retries: { backoff: "exponential" } },
		{
			timeout: "5 years",
			retries: {
				delay: "10 minutes",
				limit: 5,
				"i-like-trains": "yes".repeat(100),
			},
		},
	])("should reject invalid step configs", function (value) {
		expect(isValidStepConfig(value)).toBe(false);
	});

	it.each([
		{
			retries: { limit: 0, delay: 100000, backoff: "exponential" },
			timeout: "15 minutes",
		},
		{
			retries: { limit: 5, delay: 0, backoff: "constant" },
			timeout: "2 minutes",
		},
	])("should accept valid names", function (value) {
		expect(isValidStepConfig(value)).toBe(true);
	});
});
