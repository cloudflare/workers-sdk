import { R2Conditional, R2Object, _testR2Conditional } from "@miniflare/tre";
import test from "ava";

test("testR2Conditional: matches various conditions", (t) => {
	// Adapted from internal R2 gateway tests
	const etag = "test";
	const badEtag = "not-test";

	const uploadedDate = new Date("2023-02-24T00:09:00.500Z");
	const pastDate = new Date(uploadedDate.getTime() - 30_000);
	const futureDate = new Date(uploadedDate.getTime() + 30_000);

	const metadata: Pick<R2Object, "etag" | "uploaded"> = {
		etag,
		uploaded: uploadedDate.getTime(),
	};

	const using = (cond: R2Conditional) => _testR2Conditional(cond, metadata);
	const usingMissing = (cond: R2Conditional) => _testR2Conditional(cond);

	// Check single conditions
	t.true(using({ etagMatches: [{ type: "strong", value: etag }] }));
	t.false(using({ etagMatches: [{ type: "strong", value: badEtag }] }));

	t.true(using({ etagDoesNotMatch: [{ type: "strong", value: badEtag }] }));
	t.false(using({ etagDoesNotMatch: [{ type: "strong", value: etag }] }));

	t.false(using({ uploadedBefore: pastDate }));
	t.true(using({ uploadedBefore: futureDate }));

	t.true(using({ uploadedAfter: pastDate }));
	t.false(using({ uploadedBefore: pastDate }));

	// Check with weaker etags
	t.false(using({ etagMatches: [{ type: "weak", value: etag }] }));
	t.false(using({ etagDoesNotMatch: [{ type: "weak", value: etag }] }));
	t.true(using({ etagDoesNotMatch: [{ type: "weak", value: badEtag }] }));
	t.true(using({ etagMatches: [{ type: "wildcard" }] }));
	t.false(using({ etagDoesNotMatch: [{ type: "wildcard" }] }));

	// Check multiple conditions that evaluate to false
	t.false(
		using({
			etagMatches: [{ type: "strong", value: etag }],
			etagDoesNotMatch: [{ type: "strong", value: etag }],
		})
	);
	t.false(
		using({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedAfter: futureDate,
		})
	);
	t.false(
		using({
			// `etagMatches` pass makes `uploadedBefore` pass, but `uploadedAfter` fails
			etagMatches: [{ type: "strong", value: etag }],
			uploadedAfter: futureDate,
			uploadedBefore: pastDate,
		})
	);
	t.false(
		using({
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedBefore: pastDate,
		})
	);
	t.false(
		using({
			// `etagDoesNotMatch` pass makes `uploadedAfter` pass, but `uploadedBefore` fails
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
			uploadedBefore: pastDate,
		})
	);
	t.false(
		using({
			etagMatches: [{ type: "strong", value: badEtag }],
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: pastDate,
			uploadedBefore: futureDate,
		})
	);

	// Check multiple conditions that evaluate to true
	t.true(
		using({
			etagMatches: [{ type: "strong", value: etag }],
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
		})
	);
	// `etagMatches` pass makes `uploadedBefore` pass
	t.true(
		using({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);
	// `etagDoesNotMatch` pass makes `uploadedAfter` pass
	t.true(
		using({
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
		})
	);
	t.true(
		using({
			// `etagMatches` pass makes `uploadedBefore` pass
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
			// `etagDoesNotMatch` pass makes `uploadedAfter` pass
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
		})
	);
	t.true(
		using({
			uploadedBefore: futureDate,
			// `etagDoesNotMatch` pass makes `uploadedAfter` pass
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
		})
	);
	t.true(
		using({
			uploadedAfter: pastDate,
			// `etagMatches` pass makes `uploadedBefore` pass
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);

	// Check missing metadata fails with either `etagMatches` and `uploadedAfter`
	t.false(usingMissing({ etagMatches: [{ type: "strong", value: etag }] }));
	t.false(usingMissing({ uploadedAfter: pastDate }));
	t.false(
		usingMissing({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedAfter: pastDate,
		})
	);
	t.true(usingMissing({ etagDoesNotMatch: [{ type: "strong", value: etag }] }));
	t.true(usingMissing({ uploadedBefore: pastDate }));
	t.true(
		usingMissing({
			etagDoesNotMatch: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);
	t.false(
		usingMissing({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);
	t.false(
		usingMissing({
			etagDoesNotMatch: [{ type: "strong", value: etag }],
			uploadedAfter: pastDate,
		})
	);

	// Check with second granularity
	const justPastDate = new Date(uploadedDate.getTime() - 250);
	const justFutureDate = new Date(uploadedDate.getTime() + 250);
	t.true(using({ uploadedAfter: justPastDate }));
	t.false(using({ uploadedAfter: justPastDate, secondsGranularity: true }));
	t.true(using({ uploadedBefore: justFutureDate }));
	t.false(using({ uploadedBefore: justFutureDate, secondsGranularity: true }));
});
