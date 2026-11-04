import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { syncAssets } from "../src/deploy/helpers/assets";
import { initDeployHelpersContext } from "../src/shared/context";
import type { FetchResultFetcher } from "@cloudflare/workers-utils";

// Number of files in the manifest, and of those how many hashes the server
// asks to upload. The asset upload session maps every requested hash back to
// its manifest entry; doing that with a linear scan of the manifest is
// O(filesToUpload * manifestEntries) before any upload starts.
const MANIFEST_ENTRIES = 25_000;
const REQUESTED_HASHES = 8_000;
const BUCKET_SIZE = 500;

describe("asset upload manifest lookup", () => {
	runInTempDir();
	const fetchResult = vi.fn<FetchResultFetcher>();
	// Filled in by the fetchResult mock below: when the initialize call
	// returned (the bucket mapping starts right after), and when the first
	// upload request arrived (the bucket mapping has finished by then).
	let initializeReturnedAt: number | undefined;
	let firstUploadStartedAt: number | undefined;

	beforeEach(async () => {
		initializeReturnedAt = undefined;
		firstUploadStartedAt = undefined;

		// Seed a large asset directory so the manifest has many entries whose
		// hashes differ, like a real project with an existing asset collection.
		const assetDirectory = "assets";
		await mkdir(assetDirectory, { recursive: true });
		const writes: Array<Promise<void>> = [];
		for (let i = 0; i < MANIFEST_ENTRIES; i++) {
			writes.push(
				writeFile(
					path.join(assetDirectory, `file-${i}.txt`),
					`content-${i}`
				)
			);
			// Write in modest batches to avoid opening too many files at once.
			if (writes.length === 500) {
				await Promise.all(writes);
				writes.length = 0;
			}
		}
		await Promise.all(writes);

		fetchResult.mockImplementation(
			async (_complianceConfig, resource, init) => {
				if (String(resource).endsWith("/assets-upload-session")) {
					// The server tells us which hashes it wants; request the
					// entries at the end of the manifest, which a linear scan
					// only finds after walking nearly the whole manifest.
					const { manifest } = JSON.parse(String(init?.body));
					const entries = Object.entries(manifest) as Array<
						[string, { hash: string; size: number }]
					>;
					const requested = entries
						.slice(-REQUESTED_HASHES)
						.map(([, entry]) => entry.hash);
					const buckets: string[][] = [];
					for (let i = 0; i < requested.length; i += BUCKET_SIZE) {
						buckets.push(requested.slice(i, i + BUCKET_SIZE));
					}
					// A plain token means bulk upload mode.
					initializeReturnedAt = performance.now();
					return { buckets, jwt: "completion-token" };
				}
				firstUploadStartedAt ??= performance.now();
				return { jwt: "uploaded-token" };
			}
		);

		initDeployHelpersContext({
			fetchResult: fetchResult as FetchResultFetcher,
			fetchListResult: vi.fn(),
			fetchPagedListResult: vi.fn(),
			fetchKVGetValue: vi.fn(),
			confirm: vi.fn(),
			prompt: vi.fn(),
			select: vi.fn(),
			logger: {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				log: vi.fn(),
				warn: vi.fn(),
			},
		});
	});

	it(
		"maps the requested hashes onto manifest entries without scanning the whole manifest per hash",
		async ({ expect }) => {
			await expect(
				syncAssets({}, "account", "assets", "worker")
			).resolves.toMatchObject({
				jwt: "uploaded-token",
				assetUploadStats: { assetUploadFileCount: REQUESTED_HASHES },
			});

			expect(
				fetchResult.mock.calls.filter(
					([, resource]) =>
						String(resource).endsWith("/assets-upload-session")
				).length
			).toBe(1);

			expect(initializeReturnedAt).toBeDefined();
			expect(firstUploadStartedAt).toBeDefined();
			// The bucket mapping happens between the initialize response and
			// the first upload request. With an indexed lookup this gap is
			// milliseconds; with a linear scan per requested hash it is
			// seconds.
			expect(firstUploadStartedAt! - initializeReturnedAt!).toBeLessThan(
				1500
			);
		},
		240_000
	);
});
