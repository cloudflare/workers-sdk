import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";
import type {
	CreateSecret,
	CreateStore,
	Store,
} from "../../secrets-store/client";

/** Create a mock handler for Secrets Store API GET /stores with custom stores */
export function mockListSecretStores(stores: Store[]) {
	msw.use(
		http.get("*/accounts/:accountId/secrets_store/stores", async () => {
			return HttpResponse.json(createFetchResult(stores));
		})
	);
}

/** Create a mock handler for Secrets Store API POST /stores */
export function mockCreateSecretStore(storeId: string, storeName = "Default") {
	msw.use(
		http.post(
			"*/accounts/:accountId/secrets_store/stores",
			async ({ request }) => {
				const reqBody = (await request.json()) as CreateStore;
				return HttpResponse.json(
					createFetchResult({
						id: storeId,
						account_id: "some-account-id",
						name: reqBody.name || storeName,
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					})
				);
			}
		)
	);
}

/** Create a mock handler for Secrets Store API POST /secrets */
export function mockCreateSecret(storeId: string) {
	msw.use(
		http.post(
			`*/accounts/:accountId/secrets_store/stores/${storeId}/secrets`,
			async ({ request }) => {
				const reqBody = (await request.json()) as CreateSecret[];
				return HttpResponse.json(
					createFetchResult(
						reqBody.map((secret) => ({
							id: "secret-id-123",
							store_id: storeId,
							name: secret.name,
							comment: secret.comment || "",
							scopes: secret.scopes,
							created: "2024-01-01T00:00:00Z",
							modified: "2024-01-01T00:00:00Z",
							status: "active",
						}))
					)
				);
			}
		)
	);
}
