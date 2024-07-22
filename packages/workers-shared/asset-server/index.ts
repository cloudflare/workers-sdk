import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	NotFoundResponse,
	OkResponse,
} from "./responses";

type FindAssetEntryForPath<AssetEntry> = (
	path: string
) => Promise<null | AssetEntry>;

type FullHandlerContext<AssetEntry, Asset> = {
	request: Request;
	logError: (err: Error) => void;
	findAssetEntryForPath: FindAssetEntryForPath<AssetEntry>;
	getAssetKey(assetEntry: AssetEntry): string;
	fetchAsset: (assetKey: string) => Promise<Asset>;
};

export type HandlerContext<AssetEntry, Asset> = FullHandlerContext<
	AssetEntry,
	Asset
>;

export async function generateHandler<
	AssetEntry,
	Asset extends { body: ReadableStream | null } = {
		body: ReadableStream | null;
	},
>({
	request,
	logError,
	findAssetEntryForPath,
	getAssetKey,
	fetchAsset,
}: HandlerContext<AssetEntry, Asset>) {
	const url = new URL(request.url);
	let { pathname } = url;

	let assetEntry: AssetEntry | null;

	async function generateResponse(): Promise<Response> {
		if (!request.method.match(/^(get|head)$/i)) {
			return new MethodNotAllowedResponse();
		}

		try {
			pathname = globalThis.decodeURIComponent(pathname);
		} catch (err) {}

		if ((assetEntry = await findAssetEntryForPath(pathname))) {
			return serveAsset(assetEntry);
		}

		return new NotFoundResponse();
	}

	async function serveAsset(servingAssetEntry: AssetEntry): Promise<Response> {
		const assetKey = getAssetKey(servingAssetEntry);

		try {
			const asset = await fetchAsset(assetKey);

			const response = new OkResponse(
				request.method === "HEAD" ? null : asset.body
			);

			return response;
		} catch (err) {
			logError(err as Error);
			return new InternalServerErrorResponse(err as Error);
		}
	}

	return await generateResponse();
}
