import { Loading } from "@cloudflare/component-loading";
import { Div, Span } from "@cloudflare/elements";
import { isDarkMode, theme } from "@cloudflare/style-const";
import { createStyledComponent } from "@cloudflare/style-container";
import { useContext, useState } from "react";
import useWebSocket from "react-use-websocket";
import FrameErrorBoundary from "./FrameErrorBoundary";
import InvocationIcon from "./InvocationIcon";
import { ServiceContext } from "./QuickEditor";
import type React from "react";

export const ErrorBar = createStyledComponent<typeof Div, { isDark: boolean }>(
	({ isDark }) => ({
		width: "4px",
		minWidth: "3px",
		height: "19px",
		backgroundColor: isDark ? "#E81403" : "#F42500",
		borderRadius: "20px",
	}),
	Div
);

export const SuccessBar = createStyledComponent(
	() => ({
		width: "4px",
		minWidth: "3px",
		height: "19px",
		backgroundColor: theme.colors.blue[5],
		borderRadius: "15px",
	}),
	Div
);

type TailEvent = {
	eventTimestamp: number;
	logs: {
		message: unknown[];
		level: "debug" | "info" | "log" | "warn" | "error";
		timestamp: number;
	}[];
	event: {
		request: Pick<Request, "url" | "method" | "headers"> & {
			/**
			 * Cloudflare-specific properties
			 * https://developers.cloudflare.com/workers/runtime-apis/request#incomingrequestcfproperties
			 */
			cf: {
				/**
				 * How long (in ms) it took for the client's TCP connection to make a
				 * round trip to the worker and back. For all my gamers out there,
				 * this is the request's ping
				 */
				clientTcpRtt?: number;

				/**
				 * Longitude and Latitude of where the request originated from
				 */
				longitude?: string;
				latitude?: string;

				/**
				 * What cipher was used to establish the TLS connection
				 */
				tlsCipher: string;

				/**
				 * Which continent the request came from.
				 */
				continent?: "NA";

				/**
				 * ASN of the incoming request
				 */
				asn: number;

				/**
				 * The country the incoming request is coming from
				 */
				country?: string;

				/**
				 * The TLS version the connection used
				 */
				tlsVersion: string;

				/**
				 * The colo that processed the request (i.e. the airport code
				 * of the closest city to the server that spun up the worker)
				 */
				colo: string;

				/**
				 * The timezone where the request came from
				 */
				timezone?: string;

				/**
				 * The city where the request came from
				 */
				city?: string;

				/**
				 * The browser-requested prioritization information in the request object
				 */
				requestPriority?: string;

				/**
				 * Which version of HTTP the request came over e.g. "HTTP/2"
				 */
				httpProtocol: string;

				/**
				 * The region where the request originated from
				 */
				region?: string;
				regionCode?: string;

				/**
				 * The organization which owns the ASN of the incoming request, for example, Google Cloud.
				 */
				asOrganization: string;

				/**
				 * Metro code (DMA) of the incoming request, for example, "635".
				 */
				metroCode?: string;

				/**
				 * Postal code of the incoming request, for example, "78701".
				 */
				postalCode?: string;
			};
		};
	};
};

const TailRow = ({ event }: { event: TailEvent }) => {
	const isDark = isDarkMode();

	return (
		<>
			{[
				<Div
					width="100%"
					overflow="hidden"
					justifyContent="flex-start"
					gap={2}
					flexShrink={0}
					key="request"
				>
					<Div>
						<Span
							display="flex"
							alignItems="center"
							gap={1}
							maxWidth="100%"
							width="fit-content"
							fontSize={"smaller"}
							tabIndex={0}
							title={`${event.event.request?.method}: ${event.event.request?.url}`}
						>
							<Span display="flex" alignItems="center">
								<InvocationIcon size={16} color={theme.colors.cfOrange} />
							</Span>
							<strong>{event.event.request?.method}</strong>
							<Span
								display="inline-block"
								overflow="hidden"
								whiteSpace="nowrap"
								textOverflow="ellipsis"
							>
								{event.event.request?.url}
							</Span>
						</Span>
					</Div>
				</Div>,
				...event.logs.map((log, idx) => (
					<Div
						width="100%"
						overflow="hidden"
						justifyContent="flex-start"
						gap={2}
						flexShrink={0}
						key={idx}
					>
						<Div>
							<Span
								display="flex"
								alignItems="center"
								gap={2}
								maxWidth="100%"
								width="fit-content"
								tabIndex={0}
								fontSize={"smaller"}
								title={log.message.join(" ")}
							>
								<Div
									// fontFamily={CodeFontFamily}
									color={isDark ? "#999999" : "gray.4"}
									gap={2}
									alignItems="center"
									display="flex"
									fontWeight={400}
									marginLeft={19}
								>
									{log.level === "error" ? (
										<ErrorBar isDark={isDark} />
									) : (
										<SuccessBar />
									)}
									{/* <UTCTimestamp
										timestamp={log.timestamp}
										timezone={"UTC"}
										format={"MM-dd HH:mm:ss"}
									/> */}
								</Div>
								<Span
									display="inline-block"
									overflow="hidden"
									whiteSpace="nowrap"
									textOverflow="ellipsis"
								>
									{log.message.join(" ")}
								</Span>
							</Span>
						</Div>
					</Div>
				)),
			]}
		</>
	);
};

export function DevtoolsIframe({ url }: { url: string }) {
	const [messageHistory, setMessageHistory] = useState<TailEvent[]>([]);

	useWebSocket<string>(url, {
		protocols: "trace-v1",
		disableJson: true,
		async onMessage(event) {
			const messageEvent = JSON.parse(await event.data.text());

			const idx = messageHistory.findIndex((el) => {
				return el.eventTimestamp < messageEvent.eventTimestamp;
			});

			messageHistory.splice(idx, 0, messageEvent);
			setMessageHistory([...messageHistory]);
		},
	});

	return messageHistory.length ? (
		<Div
			overflowY={"auto"}
			height="100%"
			display="flex"
			gap="2"
			flexDirection="column"
			padding="2"
		>
			{messageHistory.map((event, idx) => {
				return <TailRow event={event} key={idx} />;
			})}
		</Div>
	) : (
		<Div
			zIndex={1000}
			p={2}
			position="relative"
			height="100%"
			display="flex"
			gap={2}
			backgroundColor={isDarkMode() ? "#313131" : "white"}
			justifyContent={"center"}
			alignItems={"center"}
		>
			Send a request to your Worker to view logs
		</Div>
	);
}
const DevtoolsIframeWithErrorHandling: React.FC = () => {
	const draftWorker = useContext(ServiceContext);
	if (!draftWorker.devtoolsUrl) {
		return (
			<Div
				zIndex={1000}
				p={2}
				position="relative"
				height="100%"
				display="flex"
				gap={2}
				backgroundColor={isDarkMode() ? "#313131" : "white"}
				justifyContent={"center"}
				alignItems={"center"}
			>
				<Loading size="4x" />
			</Div>
		);
	}
	return (
		<FrameErrorBoundary
			fallback={"Failed to load logs. Please reload the page."}
		>
			<DevtoolsIframe url={draftWorker.devtoolsUrl} />
		</FrameErrorBoundary>
	);
};

export default DevtoolsIframeWithErrorHandling;
