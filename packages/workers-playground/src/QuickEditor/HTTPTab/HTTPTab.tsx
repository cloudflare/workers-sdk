import { Button } from "@cloudflare/component-button";
import { Icon } from "@cloudflare/component-icon";
import { Listbox } from "@cloudflare/component-listbox";
import { Textarea } from "@cloudflare/component-textarea";
import { Toast } from "@cloudflare/component-toast";
import { Div, Form, Label, Output } from "@cloudflare/elements";
import { isDarkMode, theme } from "@cloudflare/style-const";
import { createStyledComponent } from "@cloudflare/style-container";
import React, {
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { FrameError } from "../FrameErrorBoundary";
import { InputField } from "../InputField";
import { ServiceContext } from "../QuickEditor";
import SplitPane from "../SplitPane";
import { fetchWorker } from "./fetchWorker";
import RequestHeaders, { HeaderEntry } from "./RequestHeaders";
import ResponseView from "./ResponseView";

const HTTP_METHODS = [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
] as const;

const SELECT_OPTIONS = HTTP_METHODS.map((m) => ({ label: m, value: m }));

type HTTPMethod = typeof HTTP_METHODS extends ReadonlyArray<infer T>
	? T
	: never;

const BodyInput = createStyledComponent(
	() => ({
		fontFamily: "monospace",
	}),
	Textarea
);

const StyledLabel: React.FC<React.ComponentProps<typeof Label>> = (props) => (
	<Label
		display="block"
		fontSize={1}
		color="gray.3"
		fontWeight="bold"
		textAlign="left"
		mb={1}
		{...props}
	/>
);

export function HTTPTab() {
	const {
		previewHash,
		previewUrl,
		setPreviewUrl,
		isPreviewUpdating,
		previewError,
	} = useContext(ServiceContext);
	const [method, setMethod] = useState<HTTPMethod>("GET");
	const [headers, setHeaders] = useState<HeaderEntry[]>([]);
	const [body, setBody] = useState("");
	const [response, setResponse] = useState<Response | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const hasBody = method !== "HEAD" && method !== "GET" && method !== "OPTIONS";

	const onSendRequest = useCallback(
		async (e?: React.FormEvent<HTMLFormElement>) => {
			e?.preventDefault();

			if (previewHash !== undefined && previewUrl !== undefined) {
				try {
					setPreviewUrl(previewUrl);
					setIsLoading(true);
					setResponse(
						await fetchWorker(
							previewUrl,
							{
								method,
								headers,
								body: hasBody ? body : undefined,
							},
							previewHash
						)
					);
				} finally {
					setIsLoading(false);
				}
			}
		},
		[previewHash, setPreviewUrl, previewUrl, method, headers, hasBody, body]
	);
	const ensureDevtoolsConnected = useRef(false);
	useEffect(() => {
		if (!ensureDevtoolsConnected.current && previewHash && !isLoading) {
			void onSendRequest();
			ensureDevtoolsConnected.current = true;
		}
	}, [previewHash, isLoading, onSendRequest]);

	return (
		<Div display="flex" flexDirection="column" width="100%">
			<Form
				display="flex"
				onSubmit={(e) => void onSendRequest(e)}
				p={2}
				gap={2}
				borderBottom="1px solid"
				borderColor="gray.7"
			>
				<Listbox
					m={0}
					marginRight={0}
					value={method}
					options={SELECT_OPTIONS}
					onChange={(option) => setMethod(option.value)}
					maxWidth="100"
					backgroundColor={
						isDarkMode() ? theme.colors.gray[9] : theme.colors.white
					}
					borderRadius={5}
				/>
				<InputField
					name="http_request_url"
					value={previewUrl}
					autoComplete="off"
					spellCheck={false}
					onChange={(e) => setPreviewUrl(e.target.value)}
					mb={0}
				/>
				<Button
					type="primary"
					inverted={true}
					submit={true}
					loading={isPreviewUpdating || isLoading}
					disabled={
						!previewHash ||
						Boolean(previewError) ||
						!previewUrl ||
						!previewUrl.startsWith("/")
					}
					data-tracking-name="send http tab request"
				>
					Send
				</Button>
			</Form>
			<SplitPane
				split="horizontal"
				defaultSize="30%"
				paneStyle={{
					display: "flex",
				}}
				style={{
					position: "relative",
					minHeight: "initial",
				}}
				minSize={50}
				maxSize={-50}
			>
				<Div overflow="auto" display="flex" flexDirection="column" width="100%">
					<Div p={2} display="flex" gap={2} flexDirection="column">
						<Div display="flex" alignItems="baseline">
							<StyledLabel htmlFor="request_headers">Headers </StyledLabel>
							<Button
								onClick={() => setHeaders((headers) => [...headers, ["", ""]])}
								ml="auto"
								type="plain"
							>
								<Icon label="Add" type="plus" mr={1} />
								Add header
							</Button>
						</Div>
						{headers.length ? (
							<RequestHeaders headers={headers} onChange={setHeaders} />
						) : (
							<Toast type="info">No headers specified</Toast>
						)}
					</Div>
					{hasBody && (
						<Div p={2}>
							<StyledLabel htmlFor="request_body">Body </StyledLabel>
							<BodyInput
								id="request_body"
								name="request_body"
								mb={0}
								p={2}
								rows={5}
								value={body}
								onChange={(e: any) => setBody(e.target.value)}
							/>
						</Div>
					)}
				</Div>

				<Output
					display="block"
					width="100%"
					fontSize={2}
					m={0}
					whiteSpace="pre-wrap"
					overflowWrap="break-word"
					overflow="auto"
				>
					{previewError ? (
						<FrameError>{previewError}</FrameError>
					) : response ? (
						<ResponseView response={response} loading={isLoading} />
					) : (
						<Toast type="info">
							Send a request to test your Worker's response.
						</Toast>
					)}
				</Output>
			</SplitPane>
		</Div>
	);
}
