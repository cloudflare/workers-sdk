import fetchMock from "jest-fetch-mock";
import {
	mockFetchInternal,
	mockFetchKVGetValue,
} from "wrangler/src/__tests__/helpers/mock-cfetch";
import {
	fetchInternal,
	fetchKVGetValue,
	getCloudflareAPIBaseURL,
} from "wrangler/src/cfetch/internal";
import { confirm, prompt } from "wrangler/src/dialogs";

jest.mock("undici", () => {
	return {
		...jest.requireActual("undici"),
		fetch: jest.requireActual("jest-fetch-mock"),
	};
});

// Outside of the Sentry tests themselves, we mock Sentry to ensure that it doesn't actually send any data and
// that it doesn't interfere with the rest of the tests.
jest.mock("wrangler/src/reporting");

fetchMock.doMock(() => {
	// Any un-mocked fetches should throw
	throw new Error("Unexpected fetch request");
});

jest.mock("wrangler/src/package-manager");

jest.mock("wrangler/src/cfetch/internal");
(fetchInternal as jest.Mock).mockImplementation(mockFetchInternal);
(fetchKVGetValue as jest.Mock).mockImplementation(mockFetchKVGetValue);
(getCloudflareAPIBaseURL as jest.Mock).mockReturnValue(
	"https://api.cloudflare.com/client/v4"
);

jest.mock("wrangler/src/dialogs");

// By default (if not configured by mockConfirm()) calls to `confirm()` should throw.
(confirm as jest.Mock).mockImplementation((text: string) => {
	throw new Error(
		`Unexpected call to \`confirm("${text}")\`.\nYou should use \`mockConfirm()\` to mock calls to \`confirm()\` with expectations. Search the codebase for \`mockConfirm\` to learn more.`
	);
});

// By default (if not configured by mockPrompt()) calls to `prompt()` should throw.
(prompt as jest.Mock).mockImplementation((text: string) => {
	throw new Error(
		`Unexpected call to \`prompt(${text}, ...)\`.\nYou should use \`mockPrompt()\` to mock calls to \`prompt()\` with expectations. Search the codebase for \`mockPrompt\` to learn more.`
	);
});
