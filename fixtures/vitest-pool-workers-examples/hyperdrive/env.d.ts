import "vitest";

declare module "vitest" {
	interface ProvidedContext {
		echoServerPort: number;
	}
}
