import {
	RemoteRuntimeController,
	type ControllerBus,
	type RemoteRuntimeControllerContext,
} from "@cloudflare/remote-bindings/internal";
import { retryOnAPIFailure as retryOnAPIFailureWithLogger } from "@cloudflare/workers-utils";
import { version as packageVersion } from "../../../package.json";
import { createPreviewSession, createWorkerPreview } from "../../dev/preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
	handlePreviewSessionCreationError,
	handlePreviewSessionUploadError,
} from "../../dev/remote";
import { logger } from "../../logger";
import { TRACE_VERSION } from "../../tail/createTail";
import { realishPrintLogs } from "../../tail/printing";
import { getAccessHeaders } from "../../user/access";

const context: RemoteRuntimeControllerContext = {
	createPreviewSession,
	createWorkerPreview,
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
	handlePreviewSessionCreationError,
	handlePreviewSessionUploadError,
	logger,
	getAccessHeaders,
	retryOnAPIFailure(action, backoff, attempts, abortSignal) {
		return retryOnAPIFailureWithLogger(
			action,
			logger,
			backoff,
			attempts,
			abortSignal
		);
	},
	packageVersion,
	tailProtocol: TRACE_VERSION,
	tailHandler: realishPrintLogs,
};

export class WranglerRemoteRuntimeController extends RemoteRuntimeController {
	constructor(bus: ControllerBus) {
		super(bus, context);
	}
}
