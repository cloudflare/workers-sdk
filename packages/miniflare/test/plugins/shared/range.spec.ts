import { _parseRanges } from "@miniflare/tre";
import test from "ava";

test('_parseRanges: case-insensitive unit must be "bytes"', (t) => {
	// Check case-insensitive and ignores whitespace
	t.not(_parseRanges("bytes=0-1", 2), undefined);
	t.not(_parseRanges("BYTES    =0-1", 2), undefined);
	t.not(_parseRanges("     bYtEs=0-1", 4), undefined);
	t.not(_parseRanges("    Bytes        =0-1", 2), undefined);
	// Check fails with other units
	t.is(_parseRanges("nibbles=0-1", 2), undefined);
});

test("_parseRanges: matches range with start and end", (t) => {
	// Check valid ranges accepted
	t.deepEqual(_parseRanges("bytes=0-1", 8), [{ start: 0, end: 1 }]);
	t.deepEqual(_parseRanges("bytes=2-7", 8), [{ start: 2, end: 7 }]);
	t.deepEqual(_parseRanges("bytes=5-5", 8), [{ start: 5, end: 5 }]);
	// Check start after end rejected
	t.deepEqual(_parseRanges("bytes=1-0", 2), undefined);
	// Check start after content rejected
	t.deepEqual(_parseRanges("bytes=2-3", 2), undefined);
	t.deepEqual(_parseRanges("bytes=5-7", 2), undefined);
	// Check end after content truncated
	t.deepEqual(_parseRanges("bytes=0-2", 2), [{ start: 0, end: 1 }]);
	t.deepEqual(_parseRanges("bytes=1-5", 3), [{ start: 1, end: 2 }]);
	// Check multiple valid ranges accepted
	t.deepEqual(_parseRanges("bytes=  1-3  , 6-7,10-11", 12), [
		{ start: 1, end: 3 },
		{ start: 6, end: 7 },
		{ start: 10, end: 11 },
	]);
	// Check overlapping ranges accepted
	t.deepEqual(_parseRanges("bytes=0-2,1-3", 5), [
		{ start: 0, end: 2 },
		{ start: 1, end: 3 },
	]);
});

test("_parseRanges: matches range with just start", (t) => {
	// Check valid ranges accepted
	t.deepEqual(_parseRanges("bytes=2-", 8), [{ start: 2, end: 7 }]);
	t.deepEqual(_parseRanges("bytes=5-", 6), [{ start: 5, end: 5 }]);
	// Check start after content rejected
	t.deepEqual(_parseRanges("bytes=2-", 2), undefined);
	t.deepEqual(_parseRanges("bytes=5-", 2), undefined);
	// Check multiple valid ranges accepted
	t.deepEqual(_parseRanges("bytes=  1-  ,6- ,  10-11   ", 12), [
		{ start: 1, end: 11 },
		{ start: 6, end: 11 },
		{ start: 10, end: 11 },
	]);
});

test("_parseRanges: matches range with just end", (t) => {
	// Check valid ranges accepted
	t.deepEqual(_parseRanges("bytes=-2", 8), [{ start: 6, end: 7 }]);
	t.deepEqual(_parseRanges("bytes=-6", 7), [{ start: 1, end: 6 }]);
	// Check start before content truncated and entire response returned
	t.deepEqual(_parseRanges("bytes=-7", 7), []);
	t.deepEqual(_parseRanges("bytes=-10", 5), []);
	// Check if any range returns entire response, other ranges ignored
	t.deepEqual(_parseRanges("bytes=0-1,-5,2-3", 5), []);
	// Check empty range ignored
	t.deepEqual(_parseRanges("bytes=-0", 2), []);
	t.deepEqual(_parseRanges("bytes=0-1,-0,2-3", 4), [
		{ start: 0, end: 1 },
		{ start: 2, end: 3 },
	]);
});

test("_parseRanges: range requires at least start or end", (t) => {
	// Check range with no start or end rejected
	t.is(_parseRanges("bytes=-", 2), undefined);
	// Check range with no dash rejected
	t.is(_parseRanges("bytes=0", 2), undefined);
	// Check empty range rejected
	t.is(_parseRanges("bytes=0-1,", 2), undefined);
	// Check no ranges accepted
	t.deepEqual(_parseRanges("bytes=", 2), []);
});
