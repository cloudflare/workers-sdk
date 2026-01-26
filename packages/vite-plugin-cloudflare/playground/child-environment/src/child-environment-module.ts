// @ts-expect-error - no types
import { getEnvironmentName } from "virtual:environment-name";

export function getMessage() {
	return `Hello from the ${getEnvironmentName()} environment`;
}
