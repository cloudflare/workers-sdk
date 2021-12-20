import { confirm } from "../dialogs";

jest.mock("../dialogs");

// By default (if not configured by mockConfirm()) calls to `confirm()` should throw.
(confirm as jest.Mock).mockImplementation(() => {
  throw new Error("Unexpected call to `confirm()`.");
});
