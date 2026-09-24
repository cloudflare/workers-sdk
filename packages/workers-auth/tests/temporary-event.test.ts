import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import {
	createTemporaryPreviewAccount,
	getOrCreateTemporaryPreviewAccount,
} from "../src/temporary";
import type {
	TemporaryAccountStorage,
	TemporaryPreviewAccount,
} from "../src/config-file/temporary";
import type { OAuthFlowLogger } from "../src/context";

const PREVIEWS_URL =
	"https://api.cloudflare.com/client/v4/provisioning/previews";
const EVENT_CODE = "ABCD-EFGH-JKMN";
const BACKEND_MESSAGE = "backend-secret-sentinel";

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

const silentLogger: OAuthFlowLogger = {
	debug: () => {},
	info: () => {},
	log: () => {},
	warn: () => {},
	error: () => {},
};

const previewAccount: TemporaryPreviewAccount = {
	account: {
		id: "account-id",
		name: "account-name",
		apiToken: "api-token",
		expiresAt: "2999-01-01T00:00:00Z",
	},
	claim: {
		url: "https://claim.example",
		expiresAt: "2999-01-01T00:00:00Z",
	},
};

function mockChallenge(): void {
	msw.use(
		http.post(`${PREVIEWS_URL}/challenge`, () =>
			HttpResponse.json({
				result: {
					challengeToken: "challenge-token",
					seed: Buffer.alloc(32, 1).toString("base64url"),
					k: 2,
					g: 2,
				},
			})
		)
	);
}

function createStorage(
	initial?: TemporaryPreviewAccount
): TemporaryAccountStorage & { writes: TemporaryPreviewAccount[] } {
	let stored = initial;
	const writes: TemporaryPreviewAccount[] = [];

	return {
		writes,
		read: () => stored,
		write: (account) => {
			stored = account;
			writes.push(account);
		},
		clear: () => {
			const existed = stored !== undefined;
			stored = undefined;
			return existed;
		},
		path: () => "<memory>",
	};
}

describe("temporary event accounts", () => {
	it("leaves ordinary temporary-account requests unchanged", async ({
		expect,
	}) => {
		mockChallenge();
		let createBody: unknown;
		msw.use(
			http.post(PREVIEWS_URL, async ({ request }) => {
				createBody = await request.json();
				return HttpResponse.json({ result: previewAccount });
			})
		);

		await expect(createTemporaryPreviewAccount(silentLogger)).resolves.toEqual(
			previewAccount
		);
		expect(createBody).not.toHaveProperty("eventCode");
	});

	it("sends the event code only in the creation request and requires acknowledgement", async ({
		expect,
	}) => {
		mockChallenge();
		let challengeBody: unknown;
		let createBody: unknown;
		msw.use(
			http.post(`${PREVIEWS_URL}/challenge`, async ({ request }) => {
				challengeBody = await request.json();
				return HttpResponse.json({
					result: {
						challengeToken: "challenge-token",
						seed: Buffer.alloc(32, 1).toString("base64url"),
						k: 2,
						g: 2,
					},
				});
			}),
			http.post(PREVIEWS_URL, async ({ request }) => {
				createBody = await request.json();
				return HttpResponse.json({
					result: { ...previewAccount, eventCodeAccepted: true },
				});
			})
		);

		await expect(
			createTemporaryPreviewAccount(silentLogger, { eventCode: EVENT_CODE })
		).resolves.toEqual(previewAccount);

		expect(challengeBody).toEqual({});
		expect(createBody).toMatchObject({ eventCode: EVENT_CODE });
	});

	it("rejects an event response without acknowledgement before caching", async ({
		expect,
	}) => {
		mockChallenge();
		msw.use(
			http.post(PREVIEWS_URL, () =>
				HttpResponse.json({ result: previewAccount })
			)
		);
		const storage = createStorage();

		await expect(
			getOrCreateTemporaryPreviewAccount({
				storage,
				prompt: async () => true,
				logger: silentLogger,
				request: { eventCode: EVENT_CODE },
			})
		).rejects.toThrow("did not acknowledge the event code");
		expect(storage.writes).toEqual([]);
	});

	it("rejects an event code when a valid temporary account is cached", async ({
		expect,
	}) => {
		const storage = createStorage(previewAccount);
		let promptCalls = 0;

		await expect(
			getOrCreateTemporaryPreviewAccount({
				storage,
				prompt: async () => {
					promptCalls += 1;
					return true;
				},
				logger: silentLogger,
				request: { eventCode: EVENT_CODE },
			})
		).rejects.toThrow("A temporary account is already cached");
		expect(promptCalls).toBe(0);
		expect(storage.writes).toEqual([]);
	});

	it("renders every known event error without the backend message", async ({
		expect,
	}) => {
		const cases = [
			[1035, "The event code is malformed"],
			[1036, "The event code was not found"],
			[1037, "This event has not started yet"],
			[1038, "This event has ended"],
			[1039, "This event is disabled"],
			[1040, "This event has no temporary accounts remaining"],
			[1041, "The event account could not be prepared"],
		] as const;

		for (const [code, message] of cases) {
			mockChallenge();
			msw.use(
				http.post(PREVIEWS_URL, () =>
					HttpResponse.json(
						{ errors: [{ code, message: BACKEND_MESSAGE }] },
						{ status: 409 }
					)
				)
			);

			const error = await createTemporaryPreviewAccount(silentLogger, {
				eventCode: EVENT_CODE,
			}).catch((cause: unknown) => cause);

			expect(error).toBeInstanceOf(Error);
			expect(String(error)).toContain(message);
			expect(String(error)).not.toContain(BACKEND_MESSAGE);
		}
	});

	it("keeps the generic failure for unknown event errors", async ({
		expect,
	}) => {
		mockChallenge();
		msw.use(
			http.post(PREVIEWS_URL, () =>
				HttpResponse.json(
					{ errors: [{ code: 9999, message: BACKEND_MESSAGE }] },
					{ status: 500, statusText: "Internal Server Error" }
				)
			)
		);

		const error = await createTemporaryPreviewAccount(silentLogger, {
			eventCode: EVENT_CODE,
		}).catch((cause: unknown) => cause);

		expect(String(error)).toContain(
			"Failed to create a temporary preview account (500 Internal Server Error)"
		);
		expect(String(error)).not.toContain(BACKEND_MESSAGE);
	});
});
