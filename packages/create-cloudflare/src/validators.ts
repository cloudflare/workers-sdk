import type { Arg } from "@cloudflare/cli/interactive";

export const validateQueueName = (value: Arg) => {
	const invalidChars = /[^a-z0-9-]/;
	const invalidStartEnd = /^-|-$/;

	const name = String(value);
	if (name.match(invalidStartEnd)) {
		return `Queue names cannot start or end with a dash.`;
	}

	if (name.match(invalidChars)) {
		return `Queue names must only contain lowercase characters, numbers, and dashes.`;
	}

	if (name.length > 63) {
		return `Queue name must be less than 64 characters`;
	}
};
