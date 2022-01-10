import fetchMock from "jest-fetch-mock";
import { fetchInternal, fetchKVGetValue } from "../cfetch/internal";
import { confirm, prompt } from "../dialogs";
import { mockFetchInternal, mockFetchKVGetValue } from "./helpers/mock-cfetch";

jest.mock("undici", () => {
  return {
    ...jest.requireActual("undici"),
    fetch: jest.requireActual("jest-fetch-mock"),
  };
});
// Outside of the Sentry tests themselves, we mock Sentry to ensure that it doesn't actually send any data and
// that it doesn't interfere with the rest of the tests.
jest.mock("../sentry");

jest.mock("node-fetch", () => jest.requireActual("jest-fetch-mock"));
fetchMock.doMock(() => {
  // Any un-mocked fetches should throw
  throw new Error("Unexpected fetch request");
});

jest.mock("../package-manager");

jest.mock("../cfetch/internal");
(fetchInternal as jest.Mock).mockImplementation(mockFetchInternal);
(fetchKVGetValue as jest.Mock).mockImplementation(mockFetchKVGetValue);

jest.mock("../dialogs");

// By default (if not configured by mockConfirm()) calls to `confirm()` should throw.
(confirm as jest.Mock).mockImplementation(() => {
  throw new Error(
    "Unexpected call to `confirm()`. You should use `mockConfirm()` to mock calls to `confirm()` with expectations. Search the codebase for `mockConfirm` to learn more."
  );
});

// By default (if not configured by mockPrompt()) calls to `prompt()` should throw.
(prompt as jest.Mock).mockImplementation(() => {
  throw new Error(
    "Unexpected call to `prompt()`. You should use `mockPrompt()` to mock calls to `prompt()` with expectations. Search the codebase for `mockPrompt` to learn more."
  );
});
