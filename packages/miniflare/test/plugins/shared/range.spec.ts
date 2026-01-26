import { parseRanges } from "miniflare";
import { expect, test } from "vitest";

test('_parseRanges: case-insensitive unit must be "bytes"', () => {
	// Check case-insensitive and ignores whitespace
	expect(parseRanges("bytes=0-1", 2)).toBeDefined();
	expect(parseRanges("BYTES    =0-1", 2)).toBeDefined();
	expect(parseRanges("     bYtEs=0-1", 4)).toBeDefined();
	expect(parseRanges("    Bytes        =0-1", 2)).toBeDefined();
	// Check fails with other units
	expect(parseRanges("nibbles=0-1", 2)).toBeUndefined();
});

test("_parseRanges: matches range with start and end", () => {
	// Check valid ranges accepted
	expect(parseRanges("bytes=0-1", 8)).toEqual([{ start: 0, end: 1 }]);
	expect(parseRanges("bytes=2-7", 8)).toEqual([{ start: 2, end: 7 }]);
	expect(parseRanges("bytes=5-5", 8)).toEqual([{ start: 5, end: 5 }]);
	// Check start after end rejected
	expect(parseRanges("bytes=1-0", 2)).toEqual(undefined);
	// Check start after content rejected
	expect(parseRanges("bytes=2-3", 2)).toEqual(undefined);
	expect(parseRanges("bytes=5-7", 2)).toEqual(undefined);
	// Check end after content truncated
	expect(parseRanges("bytes=0-2", 2)).toEqual([{ start: 0, end: 1 }]);
	expect(parseRanges("bytes=1-5", 3)).toEqual([{ start: 1, end: 2 }]);
	// Check multiple valid ranges accepted
	expect(parseRanges("bytes=  1-3,6-7,10-11", 12)).toEqual([
		{ start: 1, end: 3 },
		{ start: 6, end: 7 },
		{ start: 10, end: 11 },
	]);
	// Check overlapping ranges accepted
	expect(parseRanges("bytes=0-2,1-3", 5)).toEqual([
		{ start: 0, end: 2 },
		{ start: 1, end: 3 },
	]);
});

test("_parseRanges: matches range with just start", () => {
	// Check valid ranges accepted
	expect(parseRanges("bytes=2-", 8)).toEqual([{ start: 2, end: 7 }]);
	expect(parseRanges("bytes=5-", 6)).toEqual([{ start: 5, end: 5 }]);
	// Check start after content rejected
	expect(parseRanges("bytes=2-", 2)).toEqual(undefined);
	expect(parseRanges("bytes=5-", 2)).toEqual(undefined);
	// Check multiple valid ranges accepted
	expect(parseRanges("bytes=  1-,6- ,  10-11   ", 12)).toEqual([
		{ start: 1, end: 11 },
		{ start: 6, end: 11 },
		{ start: 10, end: 11 },
	]);
});

test("_parseRanges: matches range with just end", () => {
	// Check valid ranges accepted
	expect(parseRanges("bytes=-2", 8)).toEqual([{ start: 6, end: 7 }]);
	expect(parseRanges("bytes=-6", 7)).toEqual([{ start: 1, end: 6 }]);
	// Check start before content truncated and entire response returned
	expect(parseRanges("bytes=-7", 7)).toEqual([]);
	expect(parseRanges("bytes=-10", 5)).toEqual([]);
	// Check if any range returns entire response, other ranges ignored
	expect(parseRanges("bytes=0-1,-5,2-3", 5)).toEqual([]);
	// Check empty range ignored
	expect(parseRanges("bytes=-0", 2)).toEqual([]);
	expect(parseRanges("bytes=0-1,-0,2-3", 4)).toEqual([
		{ start: 0, end: 1 },
		{ start: 2, end: 3 },
	]);
});

test("_parseRanges: range requires at least start or end", () => {
	// Check range with no start or end rejected
	expect(parseRanges("bytes=-", 2)).toBeUndefined();
	// Check range with no dash rejected
	expect(parseRanges("bytes=0", 2)).toBeUndefined();
	// Check empty range rejected
	expect(parseRanges("bytes=0-1,", 2)).toBeUndefined();
	// Check no ranges accepted
	expect(parseRanges("bytes=", 2)).toEqual([]);
});
