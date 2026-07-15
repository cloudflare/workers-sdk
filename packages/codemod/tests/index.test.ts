import * as recast from "recast";
import parser from "recast/parsers/babel";
import {describe, test} from "vitest";
import {mergeObjectProperties, parseJs, parseTs} from "../src/index";

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

	tests.forEach(({testName, ...testObjects}) =>
		test(`${testName}`, ({expect}) => {
			const {
				sourcePropertiesObject,
				newPropertiesObject,
				expectedPropertiesObject,
			} = testObjects;
			const sourceObj = createObjectExpression(sourcePropertiesObject);
			const newProperties = createObjectExpression(newPropertiesObject)
				.properties as recast.types.namedTypes.ObjectProperty[];
			const expectedObj = createObjectExpression(expectedPropertiesObject);

			mergeObjectProperties(sourceObj, newProperties);

			expect(recast.prettyPrint(sourceObj, {parser}).code).toEqual(
				recast.prettyPrint(expectedObj, {parser}).code
			);
		})
	);
});

const createObjectExpression = (
	sourceObj: Record<string, unknown>
): recast.types.namedTypes.ObjectExpression => {
	return (
		(
			recast.parse(
				`const obj = {${Object.entries(sourceObj)
					.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
					.join(",\n")}}`,
				{parser}
			).program.body[0] as recast.types.namedTypes.VariableDeclaration
		).declarations[0] as recast.types.namedTypes.VariableDeclarator
	).init as recast.types.namedTypes.ObjectExpression;
};


/*
	This code, auto-generated during SvelteKit project init with Drizzle and/or Better Auth options,
	caused a parse failure with the ESPrima-based version of `codemod`,
	causing failure during `npm create cloudflare`.
 */
const svConfigWithSpread = `
import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),

		typescript: {
			config: (config) => ({
				...config,
				include: [...config.include, '../drizzle.config.ts']
			})
		}
	}
};

export default config;
`;

describe("spread syntax parsing", () => {
	test("can parse formerly failing svelte config file as TypeScript", ({ expect }) => {
		const result = parseTs(svConfigWithSpread);
		expect(result).toBeDefined();
	});

	test("can parse formerly failing svelte config file as JavaScript", ({ expect }) => {
		const result = parseJs(svConfigWithSpread);
		expect(result).toBeDefined();
	});
})
