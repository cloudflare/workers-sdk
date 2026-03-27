// Manual mock for the local "./dep" module via __mocks__ directory.
// When vi.mock("./dep") is called without a factory, Vitest should
// pick up this file instead of auto-mocking the real module.
export function getValue(): string {
	return "mocked";
}
