import type {
	EmailStoreService,
	ReceivedCaptureOperationLookup,
	StoredRoutingEmailMetadata,
} from "./storage";

type ReceivedCaptureStore = Pick<
	EmailStoreService,
	| "beginReceivedCapture"
	| "discardReceived"
	| "storeReceivedBody"
	| "storeReceivedMetadata"
>;

/**
 * Commits a capture under a newly allocated UUID, publishing metadata only
 * after every body row has been stored.
 */
export async function commitReceivedCapture(
	store: ReceivedCaptureStore,
	metadata: StoredRoutingEmailMetadata,
	bodyRawBase64: string[],
	createCaptureId: () => string = () => crypto.randomUUID()
): Promise<string> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const captureId = createCaptureId();
		if (!(await store.beginReceivedCapture(captureId))) {
			continue;
		}
		try {
			for (const [part, rawBase64] of bodyRawBase64.entries()) {
				await store.storeReceivedBody(captureId, part, rawBase64);
			}
			await store.storeReceivedMetadata(
				captureId,
				bodyRawBase64.length,
				metadata
			);
			return captureId;
		} catch (error) {
			await store.discardReceived(captureId).catch(() => undefined);
			throw error;
		}
	}
	throw new Error("Failed to allocate a unique received email capture ID");
}

/** Preserves capture completeness when its separately stored MIME is missing. */
export function missingReceivedCaptureBody(
	metadata: Pick<
		StoredRoutingEmailMetadata,
		"capturedPortion" | "captureTruncated"
	>
): ReceivedCaptureOperationLookup {
	return {
		found: true,
		capturedPortion:
			metadata.capturedPortion ?? metadata.captureTruncated === true,
	};
}
