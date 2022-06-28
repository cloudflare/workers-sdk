import chalk from "chalk";
import { Box, Text, useInput, render } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import * as React from "react";
import { useState } from "react";
import { logger } from "./logger";
type ConfirmProps = {
	text: string;
	onConfirm: (answer: boolean) => void;
};
function Confirm(props: ConfirmProps) {
	useInput((input: string, key) => {
		if (input === "y" || key.return === true) {
			props.onConfirm(true);
		} else if (input === "n") {
			props.onConfirm(false);
		} else {
			logger.warn("Unrecognised input:", input);
		}
	});
	return (
		<Box>
			<Text>
				{props.text} ({chalk.bold("y")}/n)
			</Text>
		</Box>
	);
}

export function confirm(text: string): Promise<boolean> {
	return new Promise((resolve) => {
		const { unmount } = render(
			<Confirm
				text={text}
				onConfirm={(answer: boolean) => {
					unmount();
					resolve(answer);
				}}
			/>
		);
	});
}

type PromptProps = {
	text: string;
	defaultValue?: string;
	type?: "text" | "password";
	onSubmit: (text: string) => void;
};

function Prompt(props: PromptProps) {
	const [value, setValue] = useState(props.defaultValue || "");

	return (
		<Box>
			<Text>{props.text} </Text>
			<Box>
				<TextInput
					mask={props.type === "password" ? "*" : undefined}
					value={value}
					onChange={setValue}
					onSubmit={props.onSubmit}
				/>
			</Box>
		</Box>
	);
}

export async function prompt(
	text: string,
	type: "text" | "password" = "text",
	defaultValue?: string
): Promise<string> {
	return new Promise((resolve) => {
		const { unmount } = render(
			<Prompt
				text={text}
				defaultValue={defaultValue}
				type={type}
				onSubmit={(inputText) => {
					unmount();
					resolve(inputText);
				}}
			/>
		);
	});
}

type SelectOption = {
	value: string;
	label: string;
};

type SelectProps = {
	text: string;
	options: SelectOption[];
	initialIndex: number;
	onSelect: (value: string) => void;
};

function Select(props: SelectProps) {
	return (
		<Box flexDirection="column">
			<Text>{props.text}</Text>
			<SelectInput
				initialIndex={props.initialIndex}
				items={props.options}
				onSelect={async (selected) => {
					props.onSelect(selected.value);
				}}
			/>
		</Box>
	);
}

export function select(
	text: string,
	options: SelectOption[],
	initialIndex: number
): Promise<string> {
	return new Promise((resolve) => {
		const { unmount } = render(
			<Select
				text={text}
				options={options}
				initialIndex={initialIndex}
				onSelect={(option: string) => {
					unmount();
					resolve(option);
				}}
			/>
		);
	});
}
