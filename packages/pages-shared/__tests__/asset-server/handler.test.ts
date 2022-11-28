import { generateHandler } from "../../asset-server/handler";
import { createMetadataObject } from "../../metadata-generator/createMetadataObject";
import type { Metadata } from "../../asset-server/metadata";

describe("asset-server handler", () => {
	test("Returns a redirect without duplicating the hash component", async () => {
		const spies = {
			fetchAsset: 0,
			findAssetEntryForPath: 0,
			getAssetKey: 0,
			negotiateContent: 0,
		};
		const request = new Request("https://foo.com/bar");
		const metadata = createMetadataObject({
			redirects: {
				invalid: [],
				rules: [
					{
						from: "/bar",
						to: "https://foobar.com/##heading-7",
						lineNumber: 0,
						status: 301,
					},
				],
			},
		}) as Metadata;

		const response = await generateHandler<string>({
			request,
			metadata,
			xServerEnvHeader: "dev",
			logError: console.error,
			findAssetEntryForPath: async (_path) => {
				spies.findAssetEntryForPath++;
				return null;
			},
			getAssetKey: (assetEntry) => {
				spies.getAssetKey++;
				return assetEntry;
			},
			negotiateContent: (_contentRequest) => {
				spies.negotiateContent++;
				return { encoding: null };
			},
			fetchAsset: async (_assetKey) => {
				spies.fetchAsset++;
				return { body: null, contentType: "text/plain" };
			},
		});

		expect(spies.fetchAsset).toBe(0);
		expect(spies.findAssetEntryForPath).toBe(0);
		expect(spies.getAssetKey).toBe(0);
		expect(spies.negotiateContent).toBe(0);
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe(
			"https://foobar.com/##heading-7"
		);
	});
});
