const originalNodeEnv = process.env.NODE_ENV;

beforeAll(() => {
	process.env.NODE_ENV = "local-testing";
});

afterAll(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

export {};
