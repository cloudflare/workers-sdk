import {
	generateRulesMatcher,
	replacer,
} from "../..//asset-server/rulesEngine";

describe("rules engine", () => {
	test("it should match simple pathname hosts", () => {
		const matcher = generateRulesMatcher({ "/test": 1, "/some%20page": 2 });
		expect(matcher({ request: new Request("/test") })).toEqual([1]);
		expect(matcher({ request: new Request("/some page") })).toEqual([2]);
	});

	test("it should match cross-host requests", () => {
		const matcher = generateRulesMatcher({
			"/test": 1,
			"/anotherpage": 2,
			"https://custom.domain/test": 3,
			"https://another.domain/test": 4,
			"//fake.host/actually-a-path": 5,
		});
		expect(
			matcher({ request: new Request("https://custom.domain/test") })
		).toEqual([1, 3]);
		expect(
			matcher({
				request: new Request("https://example.com//fake.host/actually-a-path"),
			})
		).toEqual([5]);
	});

	test("it should escape funky rules", () => {
		const matcher = generateRulesMatcher({
			"/$~.%20/!+-/[bo|%7Bo%7D]...()": 1,
		});
		expect(
			matcher({ request: new Request("/$~. \\!+-/[bo|{o}]...()") })
		).toEqual([1]);
	});

	test("it should support splats and placeholders", () => {
		const matcher = generateRulesMatcher(
			{
				"/foo/test/*": "1/:splat",
				"/foo/*": "2/:splat",
				"/blog/:code/:name": "3/:name/:code",
				"/blog/*": "4/:splat",
				"https://:subdomain.pages.:tld/*": "5/:subdomain/:tld/:splat",
				"https://next.:subdomain.pages.:tld/*": "6/:subdomain/",
			},
			(match, replacements) => replacer(match, replacements)
		);
		expect(matcher({ request: new Request("/foo/test/yes") })).toEqual([
			"1/yes",
			"2/test/yes",
		]);
		expect(matcher({ request: new Request("/foo/test/") })).toEqual([
			"1/",
			"2/test/",
		]);
		expect(matcher({ request: new Request("/foo/test") })).toEqual(["2/test"]);
		expect(matcher({ request: new Request("/foo/") })).toEqual(["2/"]);
		expect(matcher({ request: new Request("/foo") })).toEqual([]);
		expect(matcher({ request: new Request("/blog/123/tricycle") })).toEqual([
			"3/tricycle/123",
			"4/123/tricycle",
		]);
		expect(
			matcher({ request: new Request("https://my.pages.dev/magic") })
		).toEqual(["5/my/dev/magic"]);
		expect(
			matcher({ request: new Request("https://next.my.pages.dev/magic") })
		).toEqual(["6/my/"]);
	});
});

describe("replacer", () => {
	it("should replace splats", () => {
		expect(replacer("/blog/:splat", { splat: "look/a/value" })).toEqual(
			"/blog/look/a/value"
		);
	});

	it("should replace placeholders", () => {
		expect(
			replacer("/:code/:name.jpg", { name: "tricycle", code: "123" })
		).toEqual("/123/tricycle.jpg");
	});

	it("should replace splats and placeholders", () => {
		expect(
			replacer("/:code/:splat", { splat: "tricycle/images", code: "123" })
		).toEqual("/123/tricycle/images");
	});

	it("should replace all instances of placeholders", () => {
		expect(
			replacer(
				"Link: </assets/:value/main.js>; rel=preload; as=script, </assets/:value/lang.js>; rel=preload; as=script",
				{ value: "js" }
			)
		).toEqual(
			"Link: </assets/js/main.js>; rel=preload; as=script, </assets/js/lang.js>; rel=preload; as=script"
		);
	});
});
