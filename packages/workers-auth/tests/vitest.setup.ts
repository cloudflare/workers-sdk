/* eslint-disable @typescript-eslint/consistent-type-imports -- Setup file uses dynamic imports where typeof requires value imports */
import { vi } from "vitest";

vi.mock("undici", async (importOriginal) => {
	return {
		...(await importOriginal<typeof import("undici")>()),
		/**
		 * Why do we have this hacky mock?
		 *
		 * MSW intercepts requests made via globalThis.fetch but not undici.fetch.
		 * Since workers-auth imports fetch, Request, and Response from undici,
		 * we need to replace them with their global equivalents so MSW can
		 * intercept and properly handle requests.
		 *
		 * We use getters so that we always get the up-to-date mocked versions
		 * that MSW provides.
		 */
		get fetch() {
			return globalThis.fetch;
		},
		get FormData() {
			return globalThis.FormData;
		},
		get Headers() {
			return globalThis.Headers;
		},
		get Request() {
			return globalThis.Request;
		},
		get Response() {
			return globalThis.Response;
		},
	};
});
