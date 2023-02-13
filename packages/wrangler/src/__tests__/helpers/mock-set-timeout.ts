let setTimeoutSpy: jest.SpyInstance;

export function mockSetTimeout() {
	beforeEach(() => {
		setTimeoutSpy = jest
			.spyOn(global, "setTimeout")
			// @ts-expect-error we're using a very simple setTimeout mock here
			.mockImplementation((fn, _period) => {
				setImmediate(fn);
			});
	});

	afterEach(() => {
		setTimeoutSpy.mockRestore();
	});
}
