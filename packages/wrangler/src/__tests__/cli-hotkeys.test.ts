import { setTimeout } from "node:timers/promises";
import { Log } from "miniflare";
import { vitest } from "vitest";
import hotkeys from "../cli-hotkeys";
import { Logger } from "../logger";
import { mockConsoleMethods } from "./helpers/mock-console";

const writeToMockedStdin = (input: string) => _internalKeyPressCallback(input);
let _internalKeyPressCallback: (input: string) => void;
vitest.mock("../utils/onKeyPress", async () => {
	return {
		onKeyPress(callback: () => void) {
			_internalKeyPressCallback = callback;

			return () => {};
		},
	};
});

describe("Hotkeys", () => {
	const std = mockConsoleMethods();

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
			expect(handlerA).toHaveBeenCalled();
			expect(handlerB).not.toHaveBeenCalled();
			expect(handlerC).not.toHaveBeenCalled();
			handlerA.mockClear();

			writeToMockedStdin("b");
			expect(handlerA).not.toHaveBeenCalled();
			expect(handlerB).toHaveBeenCalled();
			expect(handlerC).not.toHaveBeenCalled();
			handlerB.mockClear();

			writeToMockedStdin("c");
			expect(handlerA).not.toHaveBeenCalled();
			expect(handlerB).not.toHaveBeenCalled();
			expect(handlerC).toHaveBeenCalled();
			handlerC.mockClear();
		});

		it("handles CAPSLOCK", async () => {
			const handlerA = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
			];

			hotkeys(options);

			writeToMockedStdin("a");
			expect(handlerA).toHaveBeenCalled();
			handlerA.mockClear();

			writeToMockedStdin("A");
			expect(handlerA).toHaveBeenCalled();
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
			expect(handlerA).toHaveBeenCalled();
			handlerA.mockClear();

			writeToMockedStdin("b");
			expect(handlerA).toHaveBeenCalled();
			handlerA.mockClear();

			writeToMockedStdin("c");
			expect(handlerA).toHaveBeenCalled();
			handlerA.mockClear();
		});

		it("surfaces errors in handlers", async () => {
			const handlerA = vi.fn().mockImplementation(() => {
				throw new Error("sync error");
			});
			const handlerB = vi.fn().mockRejectedValue("async error");
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["b"], label: "second option", handler: handlerB },
			];

			hotkeys(options);

			writeToMockedStdin("a");
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError while handling hotkey [a][0m

				"
			`);

			writeToMockedStdin("b");
			await setTimeout(0); //
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError while handling hotkey [a][0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError while handling hotkey [b][0m

				"
			`);
		});
	});

	describe("instructions", () => {
		it("provides formatted instructions to Wrangler's & Miniflare's logger implementations", async () => {
			const handlerA = vi.fn();
			const handlerB = vi.fn();
			const handlerC = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["b"], label: "second option", handler: handlerB },
				{ keys: ["c"], label: () => "third option", handler: handlerC },
			];

			const unregisterHotKeys = hotkeys(options);

			expect(
				// @ts-expect-error _getBottomFloat is declared Private
				Logger._getBottomFloat()
			).toMatchInlineSnapshot(`
				"╭─────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option  │
				╰─────────────────────────────────────────────────────────╯"
			`);

			expect(
				// @ts-expect-error _getBottomFloat is declared Private
				Log._getBottomFloat()
			).toMatchInlineSnapshot(`
				"╭─────────────────────────────────────────────────────────╮
				│  [a] first option, [b] second option, [c] third option  │
				╰─────────────────────────────────────────────────────────╯"
			`);

			unregisterHotKeys();

			expect(
				// @ts-expect-error _getBottomFloat is declared Private
				Logger._getBottomFloat
			).toBeUndefined();

			expect(
				// @ts-expect-error _getBottomFloat is declared Private
				Log._getBottomFloat
			).toBeUndefined();
		});
	});
});
