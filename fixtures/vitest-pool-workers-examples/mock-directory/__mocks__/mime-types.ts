// Manual mock for the "mime-types" package via __mocks__ directory.
// When vi.mock("mime-types") is called without a factory, Vitest should
// pick up this file instead of auto-mocking the real module.
export function lookup(_path: string): string {
	return "text/mock";
}
