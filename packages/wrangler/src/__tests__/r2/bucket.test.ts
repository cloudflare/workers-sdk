import { vi, describe, it, expect, beforeEach } from "vitest";
import { runWrangler } from "../helpers/run-wrangler";
import { requireAuth } from "../../user";
import { getR2Bucket, getR2BucketMetrics } from "../../r2/helpers";

// Mock the dependencies
vi.mock("../../r2/helpers");
vi.mock("../../user");

// Type the mocked functions
const mockRequireAuth = vi.mocked(requireAuth);
const mockGetR2Bucket = vi.mocked(getR2Bucket);
const mockGetR2BucketMetrics = vi.mocked(getR2BucketMetrics);

describe("r2 bucket info", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockRequireAuth.mockResolvedValue("test-account-id");
    mockGetR2Bucket.mockResolvedValue({
      name: "my-bucket-name",
      creation_date: "2025-06-07T15:55:22.222Z",
      location: "APAC",
      storage_class: "Standard"
    });
    mockGetR2BucketMetrics.mockResolvedValue({
      objectCount: 0,
      totalSize: "0 B"
    });
  });

  it("should output valid JSON format when --json flag is used", async () => {
    let capturedOutput = "";

    const originalConsoleLog = console.log;
    console.log = (msg?: any) => {
      capturedOutput += msg + "\n";
    };

    try {
      await runWrangler("r2 bucket info my-bucket-name --json");
    } finally {
      console.log = originalConsoleLog; // restore
    }

    const jsonMatch = capturedOutput.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();

    try {
      const json = JSON.parse(jsonMatch![0]);
      expect(json.name).toBe("my-bucket-name"); // optional: verify JSON shape
    } catch (err) {
      throw new Error("Output contained invalid JSON");
    }
  });
});
