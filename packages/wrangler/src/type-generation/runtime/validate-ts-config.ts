import dedent from "ts-dedent";
import { UserError } from "../../errors";
import { buildUpdatedTypesString, readTsconfigTypes } from "../helpers";

/**
 * Validates the provided tsconfig in the context of runtime type generation.
 */
export function validateTsConfig({
	runtimeTypesPath,
	tsconfig,
}: {
	runtimeTypesPath: string;
	tsconfig: string;
}) {
	const tsconfigTypes = readTsconfigTypes(tsconfig);
	const updatedTypesString = buildUpdatedTypesString(
		tsconfigTypes,
		runtimeTypesPath
	);

	if (updatedTypesString) {
		throw new UserError(dedent`
			Update your tsconfig:

				{
					"compilerOptions": {
						...
						"types": ${updatedTypesString}
						...
					}
				}

		`);
	}
}
