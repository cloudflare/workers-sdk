import { describe, test } from "vitest";
import {
	HtmlToMarkdownError,
	quickActionErrorResponse,
} from "../../../src/plugins/browser-rendering/quick-actions/errors";

interface ErrorBody {
	success: boolean;
	errors: { code: number; message: string; detail?: string }[];
}

// Messages as Chrome and puppeteer phrase them. The detail is the message
// itself unless `detail` says otherwise; `null` means it's left out.
const USER_ERRORS: { message: string; code: number; detail?: string | null }[] =
	[
		{
			message: "net::ERR_CERT_AUTHORITY_INVALID at https://example.com/",
			code: 5000,
		},
		{
			message: "net::ERR_SSL_PROTOCOL_ERROR at https://example.com/",
			code: 5000,
		},
		{
			message: "net::ERR_ADDRESS_UNREACHABLE at http://10.255.255.1/",
			code: 5001,
		},
		{ message: "net::ERR_ABORTED at https://example.com/file.zip", code: 5002 },
		{ message: "net::ERR_TIMED_OUT at https://example.com/", code: 5002 },
		{
			message: "net::ERR_CONNECTION_TIMED_OUT at https://example.com/",
			code: 5002,
		},
		{
			message: "net::ERR_TOO_MANY_REDIRECTS at https://example.com/",
			code: 5003,
		},
		{
			message: "net::ERR_HTTP2_PROTOCOL_ERROR at https://example.com/",
			code: 5004,
		},
		{ message: "net::ERR_NAME_NOT_RESOLVED at http://x.invalid/", code: 5005 },
		{ message: "net::ERR_DNS_TIMED_OUT at https://example.com/", code: 5005 },
		...[
			"ERR_CONNECTION_CLOSED",
			"ERR_CONNECTION_RESET",
			"ERR_TUNNEL_CONNECTION_FAILED",
		].map((chromeCode) => ({
			message: `net::${chromeCode} at https://example.com/`,
			code: 5006,
			detail: "Can also happen due to failure to resolve DNS.",
		})),
		{
			message: "net::ERR_CONNECTION_REFUSED at http://localhost:1/",
			code: 5008,
			detail: "",
		},
		{ message: "net::ERR_FAILED at https://example.com/", code: 5009 },
		{ message: "net::ERR_INVALID_URL at http://exa mple.com/", code: 5010 },
		{ message: "net::ERR_EMPTY_RESPONSE at http://localhost/", code: 5011 },
		{
			message:
				"Execution context was destroyed, most likely because of a navigation.",
			code: 6000,
		},
		{ message: "Navigating frame was detached", code: 6000 },
		{
			message:
				"Protocol error (DOM.describeNode): Cannot find context with specified id",
			code: 6000,
		},
		{
			message: "Protocol error (DOM.resolveNode): No node with given id found",
			code: 6000,
		},
		{
			message:
				"Protocol error (DOM.getBoxModel): Node with given id does not belong to the document",
			code: 6000,
		},
		{
			message: "Protocol error (Runtime.callFunctionOn): Target closed",
			code: 6001,
		},
		// What went wrong decides over the command that reported it
		{
			message:
				"Protocol error (Page.captureScreenshot): Session with given id not found.",
			code: 6001,
		},
		{ message: "Navigation timeout of 100 ms exceeded", code: 6002 },
		{
			message:
				"Waiting for selector `#never` failed: Waiting failed: 100ms exceeded",
			code: 6002,
		},
		{ message: "Timed out after waiting 100ms", code: 6002 },
		{ message: "Request timed out", code: 6002 },
		{
			message:
				"Page.printToPDF timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.",
			code: 6002,
		},
		{
			message: "Protocol error (Page.printToPDF): Printing failed",
			code: 6003,
		},
		{
			message:
				"Protocol error (Page.captureScreenshot): Unable to capture screenshot",
			code: 6003,
		},
		// Unlike other commands, a screenshot's bare "Target closed" is a capture error
		{
			message: "Protocol error (Page.captureScreenshot): Target closed",
			code: 6003,
		},
		{
			message:
				"Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedScript' assignment.",
			code: 6004,
		},
		{
			message:
				"Failed to execute 'querySelectorAll' on 'Document': '!!' is not a valid selector.",
			code: 6005,
			detail: null,
		},
		{ message: "Could not load script", code: 6006 },
		{
			message: "Cannot read properties of null (reading 'appendChild')",
			code: 6006,
		},
	];

describe("quick action errors", () => {
	test.for(USER_ERRORS)(
		"$message returns a 422 with code $code",
		async ({ message, code, detail }, { expect }) => {
			const res = quickActionErrorResponse(new Error(message));
			expect(res.status).toBe(422);
			const body = (await res.json()) as ErrorBody;
			expect(body.success).toBe(false);
			expect(body.errors).toHaveLength(1);
			expect(body.errors[0].code).toBe(code);
			expect(body.errors[0].detail).toBe(
				detail === undefined ? message : (detail ?? undefined)
			);
		}
	);

	test("a failed Markdown conversion returns a 422 with code 2012", async ({
		expect,
	}) => {
		const res = quickActionErrorResponse(new HtmlToMarkdownError("boom"));
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({
			success: false,
			errors: [{ code: 2012, message: "boom" }],
		});
	});

	test.for([
		{
			error: new Error("Cannot read properties of null (reading 'screenshot')"),
			message: "Cannot read properties of null (reading 'screenshot')",
		},
		{ error: "boom", message: "boom" },
		{ error: new Error(""), message: "Internal Error" },
	])(
		"other errors return a 500 with code 2000 ($message)",
		async ({ error, message }, { expect }) => {
			const res = quickActionErrorResponse(error);
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({
				success: false,
				errors: [{ message, code: 2000 }],
			});
		}
	);
});
