import { createMetadataObject } from "../..//metadata-generator/createMetadataObject";
import type {
	RedirectRule,
	HeadersRule,
} from "../..//metadata-generator/types";

const homeRedirectRule: RedirectRule = {
	from: "/home",
	to: "/",
	status: 302,
	lineNumber: 1,
};

const splatRedirectRule: RedirectRule = {
	from: "/blog/*",
	to: "/blog/:splat",
	status: 302,
	lineNumber: 2,
};

const placeholderRedirectRule: RedirectRule = {
	from: "/blog/:year/:month/:date/:slug",
	to: "/news/:year/:month/:date/:slug",
	status: 302,
	lineNumber: 3,
};

const fooBarRedirectRule: RedirectRule = {
	from: "/foo",
	to: "/bar",
	status: 302,
	lineNumber: 4,
};

const homeHeadersRule: HeadersRule = {
	path: "/home",
	headers: {
		"Access-Control-Allow-Origin": "*",
	},
	unsetHeaders: [],
};

test("createMetadataObject should return no redirects or headers entry for no valid rules", () => {
	{
		const metadata = createMetadataObject({
			redirects: {
				rules: [],
				invalid: [],
			},
			headers: {
				rules: [],
				invalid: [],
			},
		});
		expect(metadata.redirects).toEqual(undefined);
		expect(metadata.headers).toEqual(undefined);
	}
	{
		const metadata = createMetadataObject({});
		expect(metadata.redirects).toEqual(undefined);
		expect(metadata.headers).toEqual(undefined);
	}
});

test("createMetadataObject should add Version", () => {
	const metadata = createMetadataObject({
		redirects: {
			rules: [homeRedirectRule],
			invalid: [],
		},
		headers: {
			rules: [homeHeadersRule],
			invalid: [],
		},
	});
	expect(metadata.redirects?.version).toEqual(1);
	expect(metadata.headers?.version).toEqual(2);
});

test("createMetadataObject should construct mapping of from to to/status", () => {
	const metadata = createMetadataObject({
		redirects: {
			rules: [
				homeRedirectRule,
				splatRedirectRule,
				placeholderRedirectRule,
				fooBarRedirectRule,
			],
			invalid: [],
		},
	});
	expect(metadata.redirects).toEqual({
		version: 1,
		staticRules: {
			"/home": { status: 302, to: "/", lineNumber: 1 },
		},
		rules: {
			"/blog/*": {
				to: "/blog/:splat",
				status: 302,
			},
			"/blog/:year/:month/:date/:slug": {
				status: 302,
				to: "/news/:year/:month/:date/:slug",
			},
			"/foo": {
				status: 302,
				to: "/bar",
			},
		},
	});
});

test("createMetadataObject should construct mapping of path to headers", () => {
	const metadata = createMetadataObject({
		headers: {
			rules: [homeHeadersRule],
			invalid: [],
		},
	});
	expect(metadata.headers).toEqual({
		version: 2,
		rules: {
			"/home": {
				set: { "Access-Control-Allow-Origin": "*" },
			},
		},
	});
});

test("createMetadataObject should return no analytics entry for null", () => {
	{
		const metadata = createMetadataObject({});
		expect(metadata.analytics).toEqual(undefined);
	}
});

test("createMetadataObject should pass through the token", () => {
	const metadata = createMetadataObject({
		webAnalyticsToken: "secret_token_1234",
	});
	expect(metadata.analytics).toEqual({
		version: 1,
		token: "secret_token_1234",
	});
});

test("createMetadataObject should parse a realistic result", () => {
	const metadata = createMetadataObject({
		redirects: {
			invalid: [
				{
					line: `/some page /somewhere else`,
					message:
						"Expected exactly 2 or 3 whitespace-separated tokens. Got 4.",
				},
				{
					line: `https://yeah.com https://nah.com`,
					message:
						"Only relative URLs are allowed. Skipping absolute URL https://yeah.com.",
				},
			],
			rules: [
				{
					from: "/some%20page",
					status: 302,
					to: "/somewhere%20else",
					lineNumber: 1,
				},
				{
					from: "/://so;%60me",
					status: 302,
					to: "/nons:/&@%+~%7B%7Dense",
					lineNumber: 2,
				},
				{ from: "/nah", status: 302, to: "https://yeah.com/", lineNumber: 3 },
				{
					from: "/yeah.com",
					status: 302,
					to: "https://nah.com/",
					lineNumber: 4,
				},
			],
		},
		headers: {
			invalid: [
				{
					line: "HEADERSTODO",
					message: "HEADERSTODO",
				},
			],
			rules: [
				{
					path: "/static/*",
					headers: { "Access-Control-Allow-Origin": "*" },
					unsetHeaders: [],
				},
				{
					path: "/logout",
					headers: {
						"Set-Cookie": "session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
						"x-content-type-options": "nosniff",
						"x-frame-options": "DENY",
					},
					unsetHeaders: [],
				},
				{
					path: "https://my.pages.dev/*",
					headers: { "X-Robots-Tag": "none" },
					unsetHeaders: [],
				},
			],
		},
		webAnalyticsToken: "secret_token_1234",
		deploymentId: "some-deployment-123",
	});

	expect(metadata).toEqual({
		failOpen: undefined,
		redirects: {
			version: 1,
			rules: {},
			staticRules: {
				"/some%20page": { status: 302, to: "/somewhere%20else", lineNumber: 1 },
				"/://so;%60me": {
					status: 302,
					to: "/nons:/&@%+~%7B%7Dense",
					lineNumber: 2,
				},
				"/nah": { status: 302, to: "https://yeah.com/", lineNumber: 3 },
				"/yeah.com": { status: 302, to: "https://nah.com/", lineNumber: 4 },
			},
		},
		headers: {
			version: 2,
			rules: {
				"/static/*": {
					set: {
						"Access-Control-Allow-Origin": "*",
					},
				},
				"/logout": {
					set: {
						"Set-Cookie": "session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
						"x-content-type-options": "nosniff",
						"x-frame-options": "DENY",
					},
				},
				"https://my.pages.dev/*": {
					set: { "X-Robots-Tag": "none" },
				},
			},
		},
		analytics: {
			version: 1,
			token: "secret_token_1234",
		},
		deploymentId: "some-deployment-123",
	});
});

test("createMetadataObject should include unset", () => {
	const metadata = createMetadataObject({
		headers: {
			invalid: [],
			rules: [
				{
					path: "/*",
					headers: { "x-custom-header": "value" },
					unsetHeaders: [],
				},
				{
					path: "/foo/*",
					headers: {},
					unsetHeaders: ["x-custom-header"],
				},
				{
					path: "/foo/bar/*",
					headers: { "x-custom-header": "newvalue" },
					unsetHeaders: [],
				},
			],
		},
		webAnalyticsToken: "secret_token_1234",
		deploymentId: "some-deployment-id",
	});

	expect(metadata).toEqual({
		analytics: {
			token: "secret_token_1234",
			version: 1,
		},
		headers: {
			version: 2,
			rules: {
				"/*": {
					set: {
						"x-custom-header": "value",
					},
				},
				"/foo/*": {
					unset: ["x-custom-header"],
				},
				"/foo/bar/*": {
					set: {
						"x-custom-header": "newvalue",
					},
				},
			},
		},
		deploymentId: "some-deployment-id",
	});
});
