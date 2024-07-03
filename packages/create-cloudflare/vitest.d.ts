// See https://vitest.dev/guide/extending-matchers.html
/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable no-shadow */
/* eslint-disable @typescript-eslint/no-empty-interface */
import "vitest";

interface CustomMatchers<R = unknown> {
	toExist(): R;
}

declare module "vitest" {
	interface Assertion<T = unknown> extends CustomMatchers<T> {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}
