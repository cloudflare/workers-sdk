import React, { useState } from "react";
import { createComponent } from "@cloudflare/style-container";
import { Div } from "@cloudflare/elements";
import { Input } from "@cloudflare/component-input";
import { Button } from "@cloudflare/component-button";
import { isDarkMode } from "@cloudflare/style-const";

const StyledForm = createComponent(
	({ theme }) => ({
		flex: "none",
		display: "flex",
		alignItems: "center",
		margin: theme.space[2],
	}),
	"form"
);

const InputField = createComponent(
	({ theme }) => ({
		flex: "auto",
		marginBottom: 0,
		borderRadius: 5,
		borderColor: isDarkMode() ? theme.colors.gray[3] : theme.colors.gray[7],
		backgroundColor: isDarkMode() ? theme.colors.gray[9] : theme.colors.white,
	}),
	Input
);

type Props = {
	onSubmit: (url: string) => void;
	loading: boolean;
};

export default function URLBar(props: Props) {
	const [value, setValue] = useState("/");

	const onChangeInputValue = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { value: newValue } = e.target;
		if (!newValue.startsWith("/")) {
			setValue(`/${newValue}`);
		} else {
			setValue(newValue);
		}
	};

	return (
		<StyledForm
			onSubmit={(e: React.FormEvent) => {
				e.preventDefault();
				props.onSubmit(value);
			}}
		>
			<Div display="flex" gap={2} width="100%">
				<InputField
					name="url"
					autoComplete="off"
					value={value}
					onChange={onChangeInputValue}
				/>
				<Button type="default" submit={true} loading={props.loading}>
					Send
				</Button>
			</Div>
		</StyledForm>
	);
}
