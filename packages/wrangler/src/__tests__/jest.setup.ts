import { confirm, prompt } from "../dialogs";

jest.mock("../dialogs");

// By default (if not configured by mockConfirm()) calls to `confirm()` should throw.
(confirm as jest.Mock).mockImplementation(() => {
  throw new Error("Unexpected call to `confirm()`.");
});

// By default (if not configured by mockPrompt()) calls to `prompt()` should throw.
(prompt as jest.Mock).mockImplementation(() => {
  throw new Error("Unexpected call to `prompt()`.");
});
