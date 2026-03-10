import { it } from "vitest";
import { isLocal } from "../utils/is-local";

const testCases: [
	{ remote: boolean | undefined; local: boolean | undefined },
	defaultValue: boolean,
	isLocalResult: boolean,
][] = [
	[{ remote: true, local: undefined }, true, false],
	[{ remote: true, local: undefined }, false, false],
	[{ remote: false, local: undefined }, true, true],
	[{ remote: false, local: undefined }, false, true],
	[{ remote: undefined, local: true }, true, true],
	[{ remote: undefined, local: true }, false, true],
	[{ remote: undefined, local: false }, true, false],
	[{ remote: undefined, local: false }, false, false],
	[{ remote: undefined, local: undefined }, true, true],
	[{ remote: undefined, local: undefined }, false, false],
];

it.for(testCases)(
	"isLocal(%j, %o) -> %o",
	([args, defaultValue, expected], { expect }) => {
		expect(isLocal(args, defaultValue)).toBe(expected);
	}
);
