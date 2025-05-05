import { test } from "vitest";

export * from "../vitest-setup";
export * from "./responses";

export function failsIf(condition: boolean) {
	return condition ? test.fails : test;
}
