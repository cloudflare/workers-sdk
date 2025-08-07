import assert from "node:assert";
import { _testR2Conditional } from "../../../src/workers/r2/validator.worker";
import { createTestHandler } from "../worker-test";
import type { InternalR2Object } from "../../../src/workers/r2/r2-object.worker";
import type { R2Conditional } from "../../../src/workers/r2/schemas.worker";

function test() {
	// Adapted from internal R2 gateway tests
	const etag = "test";
	const badEtag = "not-test";

	const uploadedDate = new Date("2023-02-24T00:09:00.500Z");
	const pastDate = new Date(uploadedDate.getTime() - 30_000);
	const futureDate = new Date(uploadedDate.getTime() + 30_000);

	const metadata: Pick<InternalR2Object, "etag" | "uploaded"> = {
		etag,
		uploaded: uploadedDate.getTime(),
	};

	const using = (cond: R2Conditional) => _testR2Conditional(cond, metadata);
	const usingMissing = (cond: R2Conditional) => _testR2Conditional(cond);

	// Check single conditions
	assert(using({ etagMatches: [{ type: "strong", value: etag }] }));
	assert(!using({ etagMatches: [{ type: "strong", value: badEtag }] }));

	assert(using({ etagDoesNotMatch: [{ type: "strong", value: badEtag }] }));
	assert(!using({ etagDoesNotMatch: [{ type: "strong", value: etag }] }));

	assert(!using({ uploadedBefore: pastDate }));
	assert(using({ uploadedBefore: futureDate }));

	assert(using({ uploadedAfter: pastDate }));
	assert(!using({ uploadedBefore: pastDate }));

	// Check with weaker etags
	assert(!using({ etagMatches: [{ type: "weak", value: etag }] }));
	assert(!using({ etagDoesNotMatch: [{ type: "weak", value: etag }] }));
	assert(using({ etagDoesNotMatch: [{ type: "weak", value: badEtag }] }));
	assert(using({ etagMatches: [{ type: "wildcard" }] }));
	assert(!using({ etagDoesNotMatch: [{ type: "wildcard" }] }));

	// Check multiple conditions that evaluate to false
	assert(
		!using({
			etagMatches: [{ type: "strong", value: etag }],
			etagDoesNotMatch: [{ type: "strong", value: etag }],
		})
	);
	assert(
		!using({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedAfter: futureDate,
		})
	);
	assert(
		!using({
			// `etagMatches` pass makes `uploadedBefore` pass, but `uploadedAfter` fails
			etagMatches: [{ type: "strong", value: etag }],
			uploadedAfter: futureDate,
			uploadedBefore: pastDate,
		})
	);
	assert(
		!using({
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedBefore: pastDate,
		})
	);
	assert(
		!using({
			// `etagDoesNotMatch` pass makes `uploadedAfter` pass, but `uploadedBefore` fails
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
			uploadedBefore: pastDate,
		})
	);
	assert(
		!using({
			etagMatches: [{ type: "strong", value: badEtag }],
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: pastDate,
			uploadedBefore: futureDate,
		})
	);

	// Check multiple conditions that evaluate to true
	assert(
		using({
			etagMatches: [{ type: "strong", value: etag }],
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
		})
	);
	// `etagMatches` pass makes `uploadedBefore` pass
	assert(
		using({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);
	// `etagDoesNotMatch` pass makes `uploadedAfter` pass
	assert(
		using({
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
		})
	);
	assert(
		using({
			// `etagMatches` pass makes `uploadedBefore` pass
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
			// `etagDoesNotMatch` pass makes `uploadedAfter` pass
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
		})
	);
	assert(
		using({
			uploadedBefore: futureDate,
			// `etagDoesNotMatch` pass makes `uploadedAfter` pass
			etagDoesNotMatch: [{ type: "strong", value: badEtag }],
			uploadedAfter: futureDate,
		})
	);
	assert(
		using({
			uploadedAfter: pastDate,
			// `etagMatches` pass makes `uploadedBefore` pass
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);

	// Check missing metadata fails with either `etagMatches` and `uploadedAfter`
	assert(!usingMissing({ etagMatches: [{ type: "strong", value: etag }] }));
	assert(!usingMissing({ uploadedAfter: pastDate }));
	assert(
		!usingMissing({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedAfter: pastDate,
		})
	);
	assert(usingMissing({ etagDoesNotMatch: [{ type: "strong", value: etag }] }));
	assert(usingMissing({ uploadedBefore: pastDate }));
	assert(
		usingMissing({
			etagDoesNotMatch: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);
	assert(
		!usingMissing({
			etagMatches: [{ type: "strong", value: etag }],
			uploadedBefore: pastDate,
		})
	);
	assert(
		!usingMissing({
			etagDoesNotMatch: [{ type: "strong", value: etag }],
			uploadedAfter: pastDate,
		})
	);

	// Check with second granularity
	const justPastDate = new Date(uploadedDate.getTime() - 250);
	const justFutureDate = new Date(uploadedDate.getTime() + 250);
	assert(using({ uploadedAfter: justPastDate }));
	assert(!using({ uploadedAfter: justPastDate, secondsGranularity: true }));
	assert(using({ uploadedBefore: justFutureDate }));
	assert(!using({ uploadedBefore: justFutureDate, secondsGranularity: true }));
}

export default createTestHandler(test);
