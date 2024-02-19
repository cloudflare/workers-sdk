import CodeBlock from "@cloudflare/component-code-block";
import { Div } from "@cloudflare/elements";
import React, { useEffect, useMemo, useState } from "react";

type Props = {
	response: Response;
	loading: boolean;
};

const StatusIndicator: React.FC<{ statusCode: number }> = ({ statusCode }) => {
	const backgroundColor =
		statusCode < 300 ? "green.5" : statusCode < 400 ? "gold.6" : "red.4";
	return (
		<Div
			display="inline-block"
			width=".8em"
			height=".8em"
			mr={1}
			borderRadius="50%"
			backgroundColor={backgroundColor}
		/>
	);
};

function maybeGetLanguage(
	headers: string[][]
): Parameters<typeof CodeBlock>[0]["language"] {
	const contentType = headers.find((h) => h[0] === "content-type")?.[1] ?? "";
	switch (contentType) {
		case "text/html":
			return "html";
		case "application/javascript":
			return "javascript";
		case "application/json":
			return "json";
		case "text/css":
			return "css";
		default:
			return "txt";
	}
}

const ResponseView: React.FC<Props> = ({ response, loading }) => {
	const { status, statusCode } = useMemo(() => {
		const status = response.headers.get("cf-ew-status") || "";
		const statusCode = window.parseInt(status, 10);
		return { status, statusCode };
	}, [response]);

	const headers = useMemo(
		() =>
			[...response.headers]
				.filter(([header]) => header.startsWith("cf-ew-raw-"))
				.map(([header, value]) => [
					header.replace("cf-ew-raw-", ""),
					value.toLowerCase(),
				]),
		[response]
	);

	const [body, setBody] = useState("");

	useEffect(() => {
		void response.text().then(setBody);
	}, [response]);

	return (
		<Div
			fontSize={2}
			whiteSpace="pre-wrap"
			overflowWrap="break-word"
			opacity={loading ? 0.5 : 1}
			textAlign={"left"}
			display="flex"
			gap={2}
			m={3}
			flexDirection="column"
		>
			<Div>
				<StatusIndicator statusCode={statusCode} />
				{status}
			</Div>
			<CodeBlock
				code={headers.map((entry) => `${entry[0]}: ${entry[1]}`).join("\n")}
			/>
			<CodeBlock code={body} language={maybeGetLanguage(headers)} />
		</Div>
	);
};

export default ResponseView;
