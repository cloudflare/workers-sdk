interface CustomMatchers<R = unknown> {
	toExist(): R;
}

declare namespace Vi {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface Assertion extends CustomMatchers {}
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface AsymmetricMatchersContaining extends CustomMatchers {}

	// Note: augmenting jest.Matchers interface will also work.
}
