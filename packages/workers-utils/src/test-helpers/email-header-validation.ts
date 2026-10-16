export const EMAIL_HEADER_NAME_CASES = [
	["accepts RFC token characters", "X-Custom_Header.1", true],
	["rejects spaces", "X Header", false],
	["rejects colons", "X:Header", false],
	["rejects an empty name", "", false],
] as const;

export const EMAIL_HEADER_VALUE_CASES = [
	["accepts plain text", "custom value", true],
	["accepts LF-delimited lines", "first\nsecond", true],
	["accepts CRLF-delimited lines", "first\r\nsecond", true],
	[
		"accepts an injection-shaped line for safe folding",
		"safe\nBcc: victim@example.com",
		true,
	],
	["rejects a bare carriage return", "first\rsecond", false],
	["rejects a tab", "first\tsecond", false],
	["rejects DEL", "first\u007fsecond", false],
] as const;

export const MANAGED_EMAIL_HEADER_CASES = [
	["Bcc", true],
	["Cc", true],
	["Content-Transfer-Encoding", true],
	["CONTENT-TYPE", true],
	["Date", true],
	["From", true],
	["MIME-Version", true],
	["Reply-To", true],
	["Subject", true],
	["mEsSaGe-Id", true],
	["To", true],
	["X-Custom-Header", false],
] as const;
