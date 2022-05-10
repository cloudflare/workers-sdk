import fetchMock from "jest-fetch-mock";
import {
  fetchInternal,
  fetchKVGetValue,
  getCloudflareAPIBaseURL,
} from "../cfetch/internal";
import { confirm, prompt } from "../dialogs";
import { mockFetchInternal, mockFetchKVGetValue } from "./helpers/mock-cfetch";
import { MockWebSocket } from "./helpers/mock-web-socket";

// Mock out getPort since we don't actually care about what ports are open in unit tests.
jest.mock("get-port", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(async (options) => options.port),
  };
});

jest.mock("ws", () => {
  return {
    __esModule: true,
    default: MockWebSocket,
  };
});

jest.mock("undici", () => {
  return {
    ...jest.requireActual("undici"),
    fetch: jest.requireActual("jest-fetch-mock"),
  };
});

fetchMock.doMock(() => {
  // Any un-mocked fetches should throw
  throw new Error("Unexpected fetch request");
});

jest.mock("../package-manager");

jest.mock("../cfetch/internal");
(fetchInternal as jest.Mock).mockImplementation(mockFetchInternal);
(fetchKVGetValue as jest.Mock).mockImplementation(mockFetchKVGetValue);
(getCloudflareAPIBaseURL as jest.Mock).mockReturnValue(
  "https://api.cloudflare.com/client/v4"
);

jest.mock("../dialogs");

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

jest.mock("../dev/dev", () => {
  const { useApp } = jest.requireActual("ink");
  const { useEffect } = jest.requireActual("react");
  return jest.fn().mockImplementation(() => {
    const { exit } = useApp();
    useEffect(() => {
      exit();
    });
    return null;
  });
});

// Make sure that we don't accidentally try to open a browser window when running tests.
// We will actually provide a mock implementation for `openInBrowser()` within relevant tests.
jest.mock("../open-in-browser");
