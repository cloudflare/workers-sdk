import { Icon } from "@cloudflare/component-icon";
import { Loading } from "@cloudflare/component-loading";
import { Div, Span } from "@cloudflare/elements";
import { isDarkMode, theme } from "@cloudflare/style-const";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import useWebSocket from "react-use-websocket";
import { ExpandableLogMessage, messageSummary } from "./ExpandableLogMessage";
import FrameErrorBoundary from "./FrameErrorBoundary";
import InvocationIcon from "./InvocationIcon";
import { ServiceContext } from "./QuickEditor";
import type React from "react";

type TailEvent = {
	id: string;
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
	const requestTimestamp = event.eventTimestamp;

	return (
		<>
			{[
				<Div
					key="request"
					width="100%"
					overflow="hidden"
					justifyContent="flex-start"
				>
					<Span
						display="flex"
						alignItems="center"
						gap="6px"
						maxWidth="100%"
						width="100%"
						fontSize="12px"
						fontFamily="monospace"
						tabIndex={0}
						py="8px"
						px="8px"
						backgroundColor={
							isDark
								? `${theme.colors.white}0A` // 4% opacity
								: `${theme.colors.black}08` // 3% opacity
						}
					>
						<Span display="flex" alignItems="center" flexShrink={0}>
							<InvocationIcon size={14} color={theme.colors.cfOrange} />
						</Span>
						{requestTimestamp && (
							<Span
								color={isDark ? theme.colors.gray[4] : theme.colors.gray[6]}
								flexShrink={0}
							>
								{new Date(requestTimestamp).toISOString().slice(11, 19)}
							</Span>
						)}
						<strong>{event.event.request?.method}</strong>
						<Span
							display="inline-block"
							overflow="hidden"
							whiteSpace="nowrap"
							textOverflow="ellipsis"
							color={isDark ? theme.colors.gray[6] : theme.colors.gray[4]}
							title={event.event.request?.url}
						>
							{event.event.request?.url}
						</Span>
					</Span>
				</Div>,
				...event.logs.map((log, logIdx) => (
					<Div
						key={`${log.timestamp}-${logIdx}`}
						width="100%"
						justifyContent="flex-start"
					>
						<Span
							display="flex"
							alignItems="flex-start"
							gap="6px"
							width="100%"
							tabIndex={0}
							fontSize="12px"
							py="6px"
							px="8px"
							pl="16px"
							title={messageSummary(log.message)}
							fontFamily="monospace"
							backgroundColor={
								log.level === "error"
									? isDark
										? `${theme.colors.red[4]}1A` // 10% opacity
										: `${theme.colors.red[4]}0D` // 5% opacity
									: undefined
							}
						>
							<Span display="inline" overflow="hidden">
								<ExpandableLogMessage messages={log.message} />
							</Span>
						</Span>
					</Div>
				)),
			]}
		</>
	);
};

// Up to 3 retries with exponential backoff (1s, 2s, 4s) before giving up.
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

/**
 * Manages the WebSocket connection and notifies parent of errors and new data.
 * Remounted via key changes on retry — but log data is owned by the parent.
 */
function TailLogsConnector({
	url,
	onError,
	onConnected,
	onData,
}: {
	url: string;
	onError: () => void;
	onConnected: () => void;
	onData: (event: TailEvent) => void;
}) {
	const errorNotified = useRef(false);

	useWebSocket<string>(url, {
		protocols: "trace-v1",
		disableJson: true,
		onOpen() {
			errorNotified.current = false;
			onConnected();
		},
		async onMessage(event) {
			const messageEvent = JSON.parse(await event.data.text()) as TailEvent;
			onData(messageEvent);
		},
		onError() {
			if (!errorNotified.current) {
				errorNotified.current = true;
				onError();
			}
		},
		// The tail WebSocket is sometimes unexpectedly closed by the server, which means we need to try and reconnect
		onClose() {
			if (!errorNotified.current) {
				errorNotified.current = true;
				onError();
			}
		},
	});

	return null;
}

/**
 * Owns the log data and renders the console UI.
 * Uses TailLogsConnector for the WebSocket connection, with auto-retry on errors.
 * Log data persists across reconnections.
 */
export function DevtoolsIframe({ url }: { url: string }) {
	const [logs, setLogs] = useState<TailEvent[]>([]);
	const [retryKey, setRetryKey] = useState(0);
	const [retryCount, setRetryCount] = useState(0);
	const [retrying, setRetrying] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();
	const mountedRef = useRef(true);

	// Cleanup on unmount
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	// Reset retry state when URL changes (e.g. new preview deployment).
	// This is React's documented "reset state on prop change" pattern.
	/* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
	useEffect(() => {
		setRetryCount(0);
		setRetrying(false);
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
	}, [url]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const handleConnected = useCallback(() => {
		setRetryCount(0);
	}, []);

	const handleError = useCallback(() => {
		if (retryCount < MAX_RETRIES) {
			setRetrying(true);
			const delay = RETRY_BASE_DELAY * Math.pow(2, retryCount);
			timerRef.current = setTimeout(() => {
				if (!mountedRef.current) {
					return;
				}
				setRetryCount((c) => c + 1);
				setRetryKey((k) => k + 1);
				setRetrying(false);
			}, delay);
		} else {
			// All retries exhausted, increment to trigger exhaustedRetries
			setRetryCount((c) => c + 1);
		}
	}, [retryCount]);

	const handleData = useCallback((event: TailEvent) => {
		setLogs((prev) => {
			const idx = prev.findIndex(
				(el) => el.eventTimestamp < event.eventTimestamp
			);
			const next = [...prev];
			if (idx === -1) {
				next.push(event);
			} else {
				next.splice(idx, 0, event);
			}
			return next;
		});
	}, []);

	const isDark = isDarkMode();
	const hasLogs = logs.length > 0;
	const exhaustedRetries = retryCount > MAX_RETRIES;

	return (
		<Div display="flex" flexDirection="column" height="100%">
			{/* WebSocket connector — remounted on retry */}
			{!retrying && !exhaustedRetries && (
				<TailLogsConnector
					key={retryKey}
					url={url}
					onError={handleError}
					onConnected={handleConnected}
					onData={handleData}
				/>
			)}

			{/* Header bar */}
			<Div
				display="flex"
				justifyContent="space-between"
				alignItems="center"
				px={2}
				flexShrink={0}
				borderBottom="1px solid"
				borderColor={isDark ? theme.colors.gray[1] : theme.colors.gray[8]}
			>
				<Span
					fontSize="11px"
					fontWeight={500}
					color={isDark ? theme.colors.gray[6] : theme.colors.gray[5]}
					textTransform="uppercase"
					letterSpacing="0.5px"
					py="6px"
				>
					Console
					{retrying && (
						<Span
							fontWeight={400}
							textTransform="none"
							letterSpacing="normal"
							ml="6px"
						>
							— reconnecting…
						</Span>
					)}
					{exhaustedRetries && (
						<Span
							fontWeight={400}
							textTransform="none"
							letterSpacing="normal"
							ml="6px"
						>
							— disconnected{" "}
							<Span
								cursor="pointer"
								style={{ textDecoration: "underline" }}
								onClick={() => {
									if (timerRef.current) {
										clearTimeout(timerRef.current);
									}
									setRetryCount(0);
									setRetrying(false);
									setRetryKey((k) => k + 1);
								}}
							>
								retry
							</Span>
						</Span>
					)}
				</Span>
				{hasLogs && (
					<Span
						fontSize="11px"
						color={isDark ? theme.colors.gray[6] : theme.colors.gray[5]}
						cursor="pointer"
						onClick={() => setLogs([])}
						display="flex"
						alignItems="center"
						gap="4px"
						py="6px"
						style={{ userSelect: "none" }}
					>
						<Icon type="remove" size={12} />
						Clear
					</Span>
				)}
			</Div>

			{/* Content */}
			{hasLogs ? (
				<Div overflowY="auto" flex={1}>
					<Div display="flex" flexDirection="column">
						{logs.map((event) => (
							<TailRow key={event.id} event={event} />
						))}
					</Div>
				</Div>
			) : (
				<Div
					display="flex"
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
					flex={1}
					gap={2}
					cursor="default"
					color={isDark ? theme.colors.gray[6] : theme.colors.gray[5]}
				>
					<Span fontSize="13px" fontWeight={400}>
						{url ? "Waiting for logs…" : "Connecting…"}
					</Span>
					<Span
						fontSize="11px"
						color={isDark ? theme.colors.gray[4] : theme.colors.gray[6]}
					>
						Send a request to see console output
					</Span>
				</Div>
			)}
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
				backgroundColor={
					isDarkMode() ? theme.colors.gray[1] : theme.colors.white
				}
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
