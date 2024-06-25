// import readline from "readline";
// vi.spyOn(readline, "emitKeypressEvents");
import { vitest } from "vitest";
import hotkeys from "../cli-hotkeys";
import { logger } from "../logger";
import { mockConsoleMethods } from "./helpers/mock-console";

const writeToMockedStdin = (input: string) => _internalKeyPressCallback(input);
let _internalKeyPressCallback: (input: string) => void;
vitest.mock("../utils/onKeyPress", async () => {
	return {
		onKeyPress(callback: () => void) {
			_internalKeyPressCallback = callback;
		},
	};
});

describe("Hotkeys", () => {
	describe("callbacks", () => {
		it("calls handlers when a key is pressed", async () => {
			const handlerA = vi.fn();
			const handlerB = vi.fn();
			const handlerC = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["b"], label: "second option", handler: handlerB },
				{ keys: ["c"], label: "third option", handler: handlerC },
			];

			hotkeys(options);

			writeToMockedStdin("a");
			expect(handlerA).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			expect(handlerB).not.toHaveBeenCalled();
			expect(handlerC).not.toHaveBeenCalled();
			handlerA.mockClear();

			writeToMockedStdin("b");
			expect(handlerA).not.toHaveBeenCalled();
			expect(handlerB).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			expect(handlerC).not.toHaveBeenCalled();
			handlerB.mockClear();

			writeToMockedStdin("c");
			expect(handlerA).not.toHaveBeenCalled();
			expect(handlerB).not.toHaveBeenCalled();
			expect(handlerC).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			handlerC.mockClear();
		});

		it("handles CAPSLOCK", async () => {
			const handlerA = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
			];

			hotkeys(options);

			writeToMockedStdin("a");
			expect(handlerA).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			handlerA.mockClear();

			writeToMockedStdin("A");
			expect(handlerA).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			handlerA.mockClear();
		});

		it("ignores unbound keys", async () => {
			const handlerA = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
			];

			hotkeys(options);

			writeToMockedStdin("z");
			expect(handlerA).not.toHaveBeenCalled();
		});

		it("calls handler if any additional key bindings are pressed", async () => {
			const handlerA = vi.fn();
			const options = [
				{ keys: ["a", "b", "c"], label: "first option", handler: handlerA },
			];

			hotkeys(options);

			writeToMockedStdin("a");
			expect(handlerA).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			handlerA.mockClear();

			writeToMockedStdin("b");
			expect(handlerA).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			handlerA.mockClear();

			writeToMockedStdin("c");
			expect(handlerA).toHaveBeenCalledWith({
				printInstructions: expect.any(Function),
			});
			handlerA.mockClear();
		});
	});

	describe("instructions", () => {
		const std = mockConsoleMethods();

		it("prints instructions immediately", async () => {
			const handlerA = vi.fn();
			const handlerB = vi.fn();
			const handlerC = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["b"], label: "second option", handler: handlerB },
				{ keys: ["c"], label: () => "third option", handler: handlerC },
			];

			hotkeys(options);

			expect(std.out).toMatchInlineSnapshot(`
				"╭─────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option  │
				╰─────────────────────────────────────────────────────────╯
				"
			`);
		});

		it("handlers can reprint instructions", async () => {
			const handlerA = vi.fn();
			const handlerB = vi.fn();
			const handlerC = vi.fn().mockImplementation(({ printInstructions }) => {
				logger.log("triggered handlerC");
				printInstructions();
			});
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["b"], label: "second option", handler: handlerB },
				{
					keys: ["c"],
					label: () =>
						`third option (called: ${handlerC.mock.calls.length} times)`,
					handler: handlerC,
				},
			];

			hotkeys(options);

			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 0 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯
				"
			`);

			writeToMockedStdin("a");
			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 0 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯
				"
			`);

			writeToMockedStdin("b");
			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 0 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯
				"
			`);

			writeToMockedStdin("c");
			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 0 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯

				triggered handlerC
				╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 1 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯
				"
			`);

			writeToMockedStdin("c");
			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 0 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯

				triggered handlerC
				╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 1 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯

				triggered handlerC
				╭───────────────────────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option (called: 2 times)  │
				╰───────────────────────────────────────────────────────────────────────────╯
				"
			`);
		});
	});
});
