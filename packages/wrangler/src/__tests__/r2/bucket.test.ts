import { beforeEach, describe, expect, it, vi } from "vitest";
import { getR2Bucket, getR2BucketMetrics } from "../../r2/helpers";
import { requireAuth } from "../../user";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

vi.unmock("../../wrangler-banner");

vi.mock("../../r2/helpers");
vi.mock("../../user");

const logs = mockConsoleMethods();

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
			storage_class: "Standard",
		});
		mockGetR2BucketMetrics.mockResolvedValue({
			objectCount: 0,
			totalSize: "0 B",
		});
	});

	it("should output valid JSON format when --json flag is used", async () => {
		await runWrangler("r2 bucket info my-bucket-name --json");
		const json = JSON.parse(logs.out);
		expect(json.name).toBe("my-bucket-name");
	});
});
