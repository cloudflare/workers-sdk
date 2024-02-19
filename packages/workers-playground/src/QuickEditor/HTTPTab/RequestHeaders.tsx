import { Button } from "@cloudflare/component-button";
import { Icon } from "@cloudflare/component-icon";
import { Div } from "@cloudflare/elements";
import React from "react";
import { InputField } from "../InputField";

export type HeaderEntry = [string, string];

type Props = {
	headers: HeaderEntry[];
	onChange: (newHeaders: HeaderEntry[]) => void;
};

const RequestHeaders: React.FC<Props> = ({ headers, onChange }) => {
	const onRemoveHeader = (header: HeaderEntry) => {
		onChange(headers.filter((h) => h !== header));
	};

	const onChangeHeaderName = (header: HeaderEntry) => (name: string) => {
		const nextHeaders = [...headers];
		const nextEntry: HeaderEntry = [name, header[1]];
		const index = nextHeaders.findIndex((h) => h === header);
		nextHeaders.splice(index, 1, nextEntry);
		onChange(nextHeaders);
	};

	const onChangeHeaderValue = (header: HeaderEntry) => (value: string) => {
		const nextHeaders = [...headers];
		const nextEntry: HeaderEntry = [header[0], value];
		const index = nextHeaders.findIndex((h) => h === header);
		nextHeaders.splice(index, 1, nextEntry);
		onChange(nextHeaders);
	};

	return (
		<Div mb={1} display="flex" flexDirection="column" gap={2}>
			{headers.map((header, index) => (
				<Div display="flex" gap={2} flexGrow={0}>
					<InputField
						name={`Header name ${index}`}
						marginBottom={0}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							onChangeHeaderName(header)(e.target.value)
						}
						aria-label={"Header name"}
						autoFocus={true}
						placeholder="Accept"
						value={header[0]}
					/>
					<InputField
						name={`Header value ${index}`}
						marginBottom={0}
						aria-label={"Header value"}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							onChangeHeaderValue(header)(e.target.value)
						}
						placeholder="*/*"
						value={header[1]}
					/>
					<Button onClick={() => onRemoveHeader(header)} type="default">
						<Icon type="remove" label="Remove" size={12} />
					</Button>
				</Div>
			))}
		</Div>
	);
};

export default RequestHeaders;
