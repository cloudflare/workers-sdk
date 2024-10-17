import { Button } from "@cloudflare/component-button";
import { Div } from "@cloudflare/elements";
import { createComponent } from "@cloudflare/style-container";
import { useEffect, useState } from "react";
import { InputField } from "../InputField";
import type React from "react";

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
	initialURL: string;
	onSubmit: (url: string) => void;
	loading: boolean;
};

export default function URLBar({ initialURL, onSubmit, loading }: Props) {
	const [url, setUrl] = useState(initialURL);

	useEffect(() => {
		setUrl(initialURL);
	}, [initialURL]);

	return (
		<StyledForm
			onSubmit={(e: React.FormEvent) => {
				e.preventDefault();
				onSubmit(url);
			}}
		>
			<Div display="flex" gap={2} width="100%">
				<InputField
					name="url"
					autoComplete="off"
					value={url}
					onChange={(event) => {
						let newURL = event.target.value;

						if (!newURL.startsWith("/")) {
							newURL = `/${newURL}`;
						}

						setUrl(newURL);
					}}
				/>
				<Button type="primary" inverted={true} submit={true} loading={loading}>
					Go
				</Button>
			</Div>
		</StyledForm>
	);
}
