import { mergeObjectProperties } from "helpers/codemod";
import * as recast from "recast";
import parser from "recast/parsers/babel";
import { describe, test } from "vitest";
import type { ExpectStatic } from "vitest";

describe("mergeObjectProperties", () => {
	const tests = [
		{
			testName: "merges simple objects",
			sourcePropertiesObject: {
				propA: "_A_",
			},
			newPropertiesObject: {
				propB: "_B_",
			},
			expectedPropertiesObject: {
				propA: "_A_",
				propB: "_B_",
			},
		},
		{
			testName: "overrides existing non-object properties",
			sourcePropertiesObject: {
				__Prop0: true,
				propA: "_A_",
				propB: false,
				propC: 123,
			},
			newPropertiesObject: {
				propA: "_a_",
				propB: true,
				propC: 456,
			},
			expectedPropertiesObject: {
				__Prop0: true,
				propA: "_a_",
				propB: true,
				propC: 456,
			},
		},
		{
			testName: "deep merges object properties",
			sourcePropertiesObject: {
				propA: {
					propAA: "a",
					propAB: "b",
					propAC: {
						propAA: {
							propAAA: "this is quite nested 1",
							propAAC: {
								propAAAA: "this is even more nested",
							},
						},
					},
				},
			},
			newPropertiesObject: {
				propA: {
					propAB: "B",
					propAC: {
						propAA: {
							propAAB: "this is quite nested 2",
							propAAC: {
								propAAAA: "this is even more nested 1",
								propAAAB: "this is even more nested 2",
							},
						},
					},
				},
			},
			expectedPropertiesObject: {
				propA: {
					propAA: "a",
					propAB: "B",
					propAC: {
						propAA: {
							propAAA: "this is quite nested 1",
							propAAC: {
								propAAAA: "this is even more nested 1",
								propAAAB: "this is even more nested 2",
							},
							propAAB: "this is quite nested 2",
						},
					},
				},
			},
		},
	] satisfies {
		testName: string;
		sourcePropertiesObject: Record<string, unknown>;
		newPropertiesObject: Record<string, unknown>;
		expectedPropertiesObject: Record<string, unknown>;
	}[];

	tests.forEach(({ testName, ...testObjects }) =>
		test(testName, ({ expect }) =>
			testMergeObjectProperties(testObjects, expect),
		),
	);
});

const testMergeObjectProperties = (
	{
		sourcePropertiesObject,
		newPropertiesObject,
		expectedPropertiesObject,
	}: {
		sourcePropertiesObject: Record<string, unknown>;
		newPropertiesObject: Record<string, unknown>;
		expectedPropertiesObject: Record<string, unknown>;
	},
	expect: ExpectStatic,
) => {
	const sourceObj = createObjectExpression(sourcePropertiesObject);
	const newProperties = createObjectExpression(newPropertiesObject)
		.properties as recast.types.namedTypes.ObjectProperty[];
	const expectedObj = createObjectExpression(expectedPropertiesObject);

	mergeObjectProperties(sourceObj, newProperties);

	expect(recast.prettyPrint(sourceObj, { parser }).code).toEqual(
		recast.prettyPrint(expectedObj, { parser }).code,
	);
};

const createObjectExpression = (
	sourceObj: Record<string, unknown>,
): recast.types.namedTypes.ObjectExpression => {
	return (
		(
			recast.parse(
				`const obj = {${Object.entries(sourceObj)
					.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
					.join(",\n")}}`,
				{ parser },
			).program.body[0] as recast.types.namedTypes.VariableDeclaration
		).declarations[0] as recast.types.namedTypes.VariableDeclarator
	).init as recast.types.namedTypes.ObjectExpression;
};
