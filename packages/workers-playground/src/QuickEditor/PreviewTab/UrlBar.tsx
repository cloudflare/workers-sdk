import React, { useState } from "react";
import { createComponent } from "@cloudflare/style-container";
import { Div } from "@cloudflare/elements";
import { Button } from "@cloudflare/component-button";
import { InputField } from "../InputField";

const StyledForm = createComponent(
	({ theme }) => ({
		flex: "none",
		display: "flex",
		alignItems: "center",
		margin: theme.space[2],
	}),
	"form"
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
				<Button
					type="primary"
					inverted={true}
					submit={true}
					loading={props.loading}
				>
					Send
				</Button>
			</Div>
		</StyledForm>
	);
}
