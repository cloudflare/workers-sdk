import { mockFetchInternal } from "./mock-cfetch";
import { confirm, prompt } from "../dialogs";
import { fetchInternal } from "../cfetch/internal";

jest.mock("../cfetch/internal");
(fetchInternal as jest.Mock).mockImplementation(mockFetchInternal);

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
