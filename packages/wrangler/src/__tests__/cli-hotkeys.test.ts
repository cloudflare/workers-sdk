import { setTimeout } from "node:timers/promises";
import { beforeEach, describe, expect, it, vi, vitest } from "vitest";
import registerHotKeys from "../cli-hotkeys";
import { logger } from "../logger";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import type { Key } from "node:readline";

const writeToMockedStdin = (input: string | Key) =>
	_internalKeyPressCallback(
		typeof input === "string"
			? {
					name: input,
					sequence: input,
					ctrl: false,
					meta: false,
					shift: false,
				}
			: input
	);
let _internalKeyPressCallback: (input: Key) => void;
vitest.mock("../utils/onKeyPress", async () => {
	return {
		onKeyPress(callback: () => void) {
			_internalKeyPressCallback = callback;

			return () => {};
		},
	};
});

describe("Hot Keys", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});

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

			registerHotKeys(options);

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

			registerHotKeys(options);

			writeToMockedStdin("a");
			expect(handlerA).toHaveBeenCalled();
			handlerA.mockClear();

			writeToMockedStdin("A");
			expect(handlerA).toHaveBeenCalled();
			handlerA.mockClear();
		});

		it("handles meta keys", async () => {
			const handlerCtrl = vi.fn();
			const handlerMeta = vi.fn();
			const handlerShift = vi.fn();
			const options = [
				{ keys: ["ctrl+a"], label: "ctrl option", handler: handlerCtrl },
				{ keys: ["meta+a"], label: "meta option", handler: handlerMeta },
				{ keys: ["shift+a"], label: "shift option", handler: handlerShift },
			];

			registerHotKeys(options);

			writeToMockedStdin("a");
			expect(handlerCtrl).not.toHaveBeenCalled();

			writeToMockedStdin("ctrl+a");
			expect(handlerCtrl).toHaveBeenCalled();
			handlerCtrl.mockClear();

			writeToMockedStdin("meta+a");
			expect(handlerMeta).toHaveBeenCalled();
			handlerMeta.mockClear();

			writeToMockedStdin("shift+a");
			expect(handlerShift).toHaveBeenCalled();
			handlerShift.mockClear();
		});

		it("ignores missing key names", async () => {
			const handlerA = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
			];

			registerHotKeys(options);

			writeToMockedStdin({
				shift: false,
			});
			expect(handlerA).not.toHaveBeenCalled();
		});

		it("ignores unbound keys", async () => {
			const handlerA = vi.fn();
			const handlerD = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["d"], label: "disabled", disabled: true, handler: handlerD },
			];

			registerHotKeys(options);

			writeToMockedStdin("z");
			expect(handlerA).not.toHaveBeenCalled();

			writeToMockedStdin("d");
			expect(handlerD).not.toHaveBeenCalled();
		});

		it("respects dynamic disabled function", async () => {
			let isDisabled = false;
			const handlerE = vi.fn();

			registerHotKeys([
				{
					keys: ["e"],
					label: "dynamic option",
					disabled: () => isDisabled,
					handler: handlerE,
				},
			]);

			// Initially not disabled
			writeToMockedStdin("e");
			expect(handlerE).toHaveBeenCalled();
			handlerE.mockClear();

			// Now disable it
			isDisabled = true;
			writeToMockedStdin("e");
			expect(handlerE).not.toHaveBeenCalled();
		});

		it("calls handler if any additional key bindings are pressed", async () => {
			const handlerA = vi.fn();
			const options = [
				{ keys: ["a", "b", "c"], label: "first option", handler: handlerA },
			];

			registerHotKeys(options);

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

			registerHotKeys(options);

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
			const handlerD = vi.fn();
			const options = [
				{ keys: ["a"], label: "first option", handler: handlerA },
				{ keys: ["b"], label: "second option", handler: handlerB },
				{ keys: ["c"], label: () => "third option", handler: handlerC },
				{ keys: ["d"], label: "disabled", disabled: true, handler: handlerD },
			];

			// should print instructions immediately
			const unregisterHotKeys = registerHotKeys(options);

			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────╮
				│  [a] first option [b] second option [c] third option │
				╰───────────────────────────────────────────────────────╯"
			`);

			logger.log("something 1");

			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────╮
				│  [a] first option [b] second option [c] third option │
				╰───────────────────────────────────────────────────────╯
				something 1"
			`);

			unregisterHotKeys();
			logger.log("something 2");

			expect(std.out).toMatchInlineSnapshot(`
				"╭───────────────────────────────────────────────────────╮
				│  [a] first option [b] second option [c] third option │
				╰───────────────────────────────────────────────────────╯
				something 1
				something 2"
			`);
		});

		it("provides stacked formatted instructions in narrow views", async () => {
			const originalColumns = process.stdout.columns;
			try {
				process.stdout.columns = 30;

				const handlerA = vi.fn();
				const handlerB = vi.fn();
				const handlerC = vi.fn();
				const handlerD = vi.fn();
				const options = [
					{ keys: ["a"], label: "first option", handler: handlerA },
					{ keys: ["b"], label: "second option", handler: handlerB },
					{ keys: ["c"], label: () => "third option", handler: handlerC },
					{ keys: ["d"], label: "disabled", disabled: true, handler: handlerD },
				];

				// should print instructions immediately
				const unregisterHotKeys = registerHotKeys(options);

				expect(std.out).toMatchInlineSnapshot(`
					"╭─────────────────────╮
					│  [a] first option │
					│  [b] second option │
					│  [c] third option │
					╰─────────────────────╯"
				`);
				unregisterHotKeys();
			} finally {
				process.stdout.columns = originalColumns;
			}
		});

		it("hides options with dynamic disabled function returning true", async () => {
			const handlerA = vi.fn();
			const handlerB = vi.fn();

			registerHotKeys([
				{
					keys: ["a"],
					label: "visible option",
					handler: handlerA,
				},
				{
					keys: ["b"],
					label: "hidden option",
					disabled: () => true,
					handler: handlerB,
				},
			]);

			expect(std.out).toMatchInlineSnapshot(`
				"╭──────────────────────╮
				│  [a] visible option │
				╰──────────────────────╯"
			`);
		});
	});
});
