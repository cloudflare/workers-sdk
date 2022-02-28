import { fetch } from "undici";
import { vi } from "vitest";
import {
  fetchInternal,
  fetchKVGetValue,
  getCloudflareAPIBaseURL,
} from "../cfetch/internal";
import { confirm, prompt } from "../dialogs";
import { mockFetchInternal, mockFetchKVGetValue } from "./helpers/mock-cfetch";
import { MockWebSocket } from "./helpers/mock-web-socket";
import type { MockedFunction } from "vitest";

vi.mock("ws", () => {
  return {
    __esModule: true,
    default: MockWebSocket,
  };
});

vi.mock("undici");

// Outside of the Sentry tests themselves, we mock Sentry to ensure that it doesn't actually send any data and
// that it doesn't interfere with the rest of the tests.
vi.mock("../reporting");

(fetch as MockedFunction<typeof fetch>).mockImplementation(() => {
  // Any un-mocked fetches should throw
  throw new Error("Unexpected fetch request");
});

vi.mock("../package-manager");

vi.mock("../cfetch/internal");
(fetchInternal as MockedFunction<typeof fetchInternal>).mockImplementation(
  mockFetchInternal
);
(fetchKVGetValue as MockedFunction<typeof fetchKVGetValue>).mockImplementation(
  mockFetchKVGetValue
);
(
  getCloudflareAPIBaseURL as MockedFunction<typeof getCloudflareAPIBaseURL>
).mockReturnValue("https://api.cloudflare.com/client/v4");

vi.mock("../dialogs");

// By default (if not configured by mockConfirm()) calls to `confirm()` should throw.
(confirm as MockedFunction<typeof confirm>).mockImplementation(() => {
  throw new Error(
    "Unexpected call to `confirm()`. You should use `mockConfirm()` to mock calls to `confirm()` with expectations. Search the codebase for `mockConfirm` to learn more."
  );
});

// By default (if not configured by mockPrompt()) calls to `prompt()` should throw.
(prompt as MockedFunction<typeof prompt>).mockImplementation(() => {
  throw new Error(
    "Unexpected call to `prompt()`. You should use `mockPrompt()` to mock calls to `prompt()` with expectations. Search the codebase for `mockPrompt` to learn more."
  );
});
