// @ts-expect-error - no types
import { getEnvironmentName } from "virtual:environment-name";
import additionalModule from "./additional-module.txt";
import assetUrl from "./imported-asset.txt?url";

export { additionalModule, assetUrl };

export function getMessage() {
	return `Hello from the ${getEnvironmentName()} environment`;
}
