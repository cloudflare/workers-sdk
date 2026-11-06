import { test } from "vitest";
import { selectResponseEncoding } from "../../src/shared/encoding";

test.for([
	{ accept: null, encoding: null, expected: "identity" },
	{ accept: null, encoding: "gzip", expected: "gzip" },
	{ accept: "", encoding: "gzip", expected: "identity" },
	{ accept: "gzip, br", encoding: null, expected: "identity" },
	{ accept: "br, gzip", encoding: "gzip", expected: "gzip" },
	{ accept: "br;q=1, gzip;q=0.1", encoding: "gzip", expected: "gzip" },
	{ accept: "br", encoding: "gzip", expected: "identity" },
	{ accept: "gzip", encoding: "br", expected: "identity" },
	{ accept: "deflate", encoding: "gzip", expected: "identity" },
	{ accept: "gzip", encoding: "deflate", expected: "deflate" },
	{ accept: "*", encoding: "gzip", expected: "gzip" },
	{ accept: "*", encoding: null, expected: "identity" },
	{ accept: "*;q=0.5, identity;q=0", encoding: null, expected: "gzip" },
	{ accept: "identity;q=0, *;q=0.5", encoding: null, expected: "gzip" },
	{ accept: "gzip;q=0, *;q=1, identity;q=0", encoding: "gzip", expected: "br" },
	{ accept: "*;q=0, identity;q=1", encoding: "gzip", expected: "identity" },
	{ accept: "identity;q=1, *;q=0", encoding: "gzip", expected: "identity" },
	{ accept: "gzip, *;q=0", encoding: null, expected: "gzip" },
	{ accept: "br, *;q=0", encoding: "gzip", expected: "br" },
	{ accept: "br, gzip, identity;q=0", encoding: null, expected: "br" },
	{ accept: "gzip;q=0.5, br, identity;q=0", encoding: null, expected: "br" },
	{ accept: "gzip, br;q=0.5, identity;q=0", encoding: null, expected: "gzip" },
	{ accept: "*;q=0", encoding: null, expected: undefined },
	{ accept: "zstd, identity;q=0", encoding: "gzip", expected: undefined },
	{
		accept: "gzip;q=0, br;q=0, identity;q=0",
		encoding: null,
		expected: undefined,
	},
	{ accept: "GZIP, IDENTITY;q=0", encoding: null, expected: "gzip" },
	{ accept: ",(,br,,,q=,*;q=0", encoding: "gzip", expected: "br" },
])(
	"selectResponseEncoding: $accept / $encoding",
	({ accept, encoding, expected }, { expect }) => {
		expect(selectResponseEncoding(accept, encoding)).toBe(expected);
	}
);
