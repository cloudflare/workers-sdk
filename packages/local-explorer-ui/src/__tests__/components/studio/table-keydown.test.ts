import { describe, test } from "vitest";
import { handleStudioTableKeyDown } from "../../../components/studio/Table";
import { StudioTableState } from "../../../components/studio/Table/State";
import type { StudioTableHeaderInput } from "../../../components/studio/Table/State";

function createHeader(name: string): StudioTableHeaderInput {
	return {
		display: { initialSize: 100, text: name },
		metadata: undefined,
		name,
		setting: { readonly: false, resizable: true },
		store: new Map(),
	};
}

function createState(): StudioTableState {
	const state = new StudioTableState(
		[createHeader("col1"), createHeader("col2")],
		[
			{ col1: "a", col2: "b" },
			{ col1: "c", col2: "d" },
		]
	);
	state.setFocus(0, 0);
	return state;
}

function createKeyboardEvent(
	key: string,
	overrides: Partial<
		Pick<React.KeyboardEvent, "shiftKey" | "metaKey" | "ctrlKey">
	> = {}
): React.KeyboardEvent {
	let prevented = false;
	return {
		key,
		shiftKey: overrides.shiftKey ?? false,
		metaKey: overrides.metaKey ?? false,
		ctrlKey: overrides.ctrlKey ?? false,
		get defaultPrevented() {
			return prevented;
		},
		preventDefault: () => {
			prevented = true;
		},
	} as unknown as React.KeyboardEvent;
}

describe("handleStudioTableKeyDown", () => {
	test("does not swallow an unhandled key while a cell is focused (regression for #14524)", ({
		expect,
	}) => {
		const state = createState();
		const event = createKeyboardEvent("1", { metaKey: true });

		handleStudioTableKeyDown(event, {
			onShiftKeyDownCallBack: () => {},
			state,
		});

		expect(event.defaultPrevented).toBe(false);
	});

	test("prevents default for a recognized navigation key (ArrowRight)", ({
		expect,
	}) => {
		const state = createState();
		const event = createKeyboardEvent("ArrowRight");

		handleStudioTableKeyDown(event, {
			onShiftKeyDownCallBack: () => {},
			state,
		});

		expect(event.defaultPrevented).toBe(true);
	});

	test("prevents default for Enter and enters edit mode", ({ expect }) => {
		const state = createState();
		const event = createKeyboardEvent("Enter");

		handleStudioTableKeyDown(event, {
			onShiftKeyDownCallBack: () => {},
			state,
		});

		expect(event.defaultPrevented).toBe(true);
		expect(state.isInEditMode()).toBe(true);
	});

	test("does nothing while the state is already in edit mode", ({ expect }) => {
		const state = createState();
		state.enterEditMode();
		const event = createKeyboardEvent("1", { metaKey: true });

		handleStudioTableKeyDown(event, {
			onShiftKeyDownCallBack: () => {},
			state,
		});

		expect(event.defaultPrevented).toBe(false);
	});

	test("respects a custom key handler that already prevented default (e.g. Cmd+C copy)", ({
		expect,
	}) => {
		const state = createState();
		const event = createKeyboardEvent("c", { metaKey: true });

		handleStudioTableKeyDown(event, {
			customKeyDownHandler: (e) => {
				e.preventDefault();
			},
			onShiftKeyDownCallBack: () => {},
			state,
		});

		expect(event.defaultPrevented).toBe(true);
	});
});
