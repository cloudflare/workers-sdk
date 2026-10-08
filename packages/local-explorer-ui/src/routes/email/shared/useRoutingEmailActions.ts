import { useKumoToastManager } from "@cloudflare/kumo";
import { useLayoutEffect, useRef, useState } from "react";
import { emailResendDraftRouting, emailResendRouting } from "../../../api";
import {
	createInboxRefreshCoordinator,
	getEmailResendErrorFeedback,
	getEmailResendFeedback,
	getEmailResendNetworkFeedback,
	toTestEmailDraft,
} from "../../../utils/email-resend";
import type { EmailRoutingItem } from "../../../api";
import type { TestEmailDraft } from "../../../utils/email-resend";

export type RoutingEmail = Omit<
	EmailRoutingItem,
	"capturedPortion" | "editAndResendAvailable"
> & {
	capturedPortion?: boolean;
	editAndResendAvailable?: boolean;
};

export type EmailRoutingActionState = "idle" | "projecting" | "resending";

interface ActiveAction {
	controller: AbortController;
	key: string;
}

interface UseRoutingEmailActionsOptions {
	refreshFirstPage: () => Promise<"stale" | "success">;
	worker?: string;
}

interface RoutingEmailActions {
	dialogDraft?: TestEmailDraft;
	dialogOpen: boolean;
	dialogWorker?: string;
	editAndResend: (email: RoutingEmail) => Promise<void>;
	getRowActionState: (email: RoutingEmail) => EmailRoutingActionState;
	handleDialogOpenChange: (open: boolean) => void;
	openBlankComposer: () => void;
	requestInboxRefresh: (expectedGeneration: number) => void;
	resend: (email: RoutingEmail) => Promise<void>;
	workerGeneration: number;
}

/** Returns the operational identity for one Routing row. */
export function getEmailRoutingActionKey(
	worker: string,
	captureId: string
): string {
	return `${worker}\u0000${captureId}`;
}

/** Owns the request, dialog, and refresh lifecycle for Routing email actions. */
export function useRoutingEmailActions({
	refreshFirstPage,
	worker,
}: UseRoutingEmailActionsOptions): RoutingEmailActions {
	const toast = useKumoToastManager();
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);
	const [dialogDraft, setDialogDraft] = useState<TestEmailDraft>();
	const [dialogWorker, setDialogWorker] = useState<string>();
	const [activeActions, setActiveActions] = useState<
		Map<string, EmailRoutingActionState>
	>(() => new Map());
	const [workerGeneration, setWorkerGeneration] = useState<number>(0);
	const activeActionsRef = useRef<Map<string, EmailRoutingActionState>>(
		new Map()
	);
	const projectionRef = useRef<ActiveAction | undefined>(undefined);
	const resendControllersRef = useRef<Map<string, ActiveAction>>(new Map());
	const lifecycleTokenRef = useRef<number>(0);
	const workerGenerationRef = useRef<number>(0);
	const disposedRef = useRef<boolean>(false);
	const refreshFirstPageRef = useRef(refreshFirstPage);
	refreshFirstPageRef.current = refreshFirstPage;
	const refreshCoordinatorRef = useRef<
		ReturnType<typeof createInboxRefreshCoordinator> | undefined
	>(undefined);
	if (refreshCoordinatorRef.current === undefined) {
		refreshCoordinatorRef.current = createInboxRefreshCoordinator({
			currentGeneration: () => workerGenerationRef.current,
			isDisposed: () => disposedRef.current,
			refreshFirstPage: () => refreshFirstPageRef.current(),
		});
	}
	const requestInboxRefresh = refreshCoordinatorRef.current.request;

	function updateActiveActions(
		next: Map<string, EmailRoutingActionState>
	): void {
		activeActionsRef.current = next;
		setActiveActions(new Map(next));
	}

	function removeActiveAction(key: string): void {
		if (!activeActionsRef.current.has(key)) {
			return;
		}
		const next = new Map(activeActionsRef.current);
		next.delete(key);
		updateActiveActions(next);
	}

	function cancelProjection(): void {
		const action = projectionRef.current;
		if (!action) {
			return;
		}
		projectionRef.current = undefined;
		action.controller.abort();
		removeActiveAction(action.key);
	}

	function invalidateActions(commitState = true): void {
		projectionRef.current?.controller.abort();
		projectionRef.current = undefined;
		for (const action of resendControllersRef.current.values()) {
			action.controller.abort();
		}
		resendControllersRef.current.clear();
		activeActionsRef.current = new Map();
		if (commitState) {
			setActiveActions(new Map());
			setDialogOpen(false);
			setDialogDraft(undefined);
			setDialogWorker(undefined);
		}
	}

	useLayoutEffect(() => {
		const token = lifecycleTokenRef.current + 1;
		lifecycleTokenRef.current = token;
		disposedRef.current = false;
		refreshCoordinatorRef.current?.clear();
		workerGenerationRef.current += 1;
		setWorkerGeneration(workerGenerationRef.current);
		invalidateActions();

		return () => {
			if (lifecycleTokenRef.current !== token) {
				return;
			}
			disposedRef.current = true;
			refreshCoordinatorRef.current?.clear();
			workerGenerationRef.current += 1;
			invalidateActions(false);
		};
	}, [worker]);

	function openBlankComposer(): void {
		cancelProjection();
		setDialogDraft(undefined);
		setDialogWorker(worker);
		setDialogOpen(true);
	}

	function handleDialogOpenChange(open: boolean): void {
		setDialogOpen(open);
		if (!open) {
			setDialogDraft(undefined);
			setDialogWorker(undefined);
		}
	}

	async function editAndResend(email: RoutingEmail): Promise<void> {
		const captureId = email.captureId;
		const rowWorker = email.worker;
		if (!captureId || !rowWorker || email.editAndResendAvailable !== true) {
			return;
		}
		const key = getEmailRoutingActionKey(rowWorker, captureId);
		if (activeActionsRef.current.has(key)) {
			return;
		}

		cancelProjection();
		setDialogOpen(false);
		setDialogDraft(undefined);
		setDialogWorker(undefined);
		const generation = workerGenerationRef.current;
		const controller = new AbortController();
		const action = { controller, key };
		projectionRef.current = action;
		updateActiveActions(
			new Map(activeActionsRef.current).set(key, "projecting")
		);
		try {
			const response = await emailResendDraftRouting({
				query: { capture_id: captureId, worker: rowWorker },
				signal: controller.signal,
				throwOnError: false,
			});
			if (
				projectionRef.current !== action ||
				generation !== workerGenerationRef.current
			) {
				return;
			}
			const projection = response.data?.result;
			if (response.error || !response.response.ok || !projection) {
				toast.add({
					title:
						response.error?.errors?.[0]?.message ??
						"Failed to load the email draft.",
					variant: "error",
				});
				return;
			}
			setDialogDraft(toTestEmailDraft(projection));
			setDialogWorker(rowWorker);
			setDialogOpen(true);
		} catch (cause) {
			if (
				projectionRef.current === action &&
				generation === workerGenerationRef.current &&
				!controller.signal.aborted
			) {
				toast.add({
					title:
						cause instanceof Error
							? cause.message
							: "Failed to load the email draft.",
					variant: "error",
				});
			}
		} finally {
			if (projectionRef.current === action) {
				projectionRef.current = undefined;
				removeActiveAction(key);
			}
		}
	}

	async function resend(email: RoutingEmail): Promise<void> {
		const captureId = email.captureId;
		const rowWorker = email.worker;
		if (!captureId || !rowWorker) {
			return;
		}
		const key = getEmailRoutingActionKey(rowWorker, captureId);
		if (activeActionsRef.current.has(key)) {
			return;
		}

		const generation = workerGenerationRef.current;
		const controller = new AbortController();
		const action = { controller, key };
		resendControllersRef.current.set(key, action);
		updateActiveActions(
			new Map(activeActionsRef.current).set(key, "resending")
		);
		let didDispatch = false;
		try {
			didDispatch = true;
			const response = await emailResendRouting({
				query: { capture_id: captureId, worker: rowWorker },
				signal: controller.signal,
				throwOnError: false,
			});
			if (
				resendControllersRef.current.get(key) !== action ||
				generation !== workerGenerationRef.current
			) {
				return;
			}
			const result = response.data?.result;
			const feedback =
				response.error || !response.response.ok || !result
					? getEmailResendErrorFeedback(
							response.error,
							response.response.status,
							email.capturedPortion === true
						)
					: getEmailResendFeedback(result);
			toast.add(feedback);
		} catch {
			if (
				resendControllersRef.current.get(key) === action &&
				generation === workerGenerationRef.current &&
				!controller.signal.aborted
			) {
				toast.add(
					getEmailResendNetworkFeedback(email.capturedPortion === true)
				);
			}
		} finally {
			if (resendControllersRef.current.get(key) === action) {
				resendControllersRef.current.delete(key);
				removeActiveAction(key);
			}
			if (didDispatch && generation === workerGenerationRef.current) {
				requestInboxRefresh(generation);
			}
		}
	}

	function getRowActionState(email: RoutingEmail): EmailRoutingActionState {
		const captureId = email.captureId;
		const rowWorker = email.worker;
		return captureId && rowWorker
			? (activeActions.get(getEmailRoutingActionKey(rowWorker, captureId)) ??
					"idle")
			: "idle";
	}

	return {
		dialogDraft,
		dialogOpen,
		dialogWorker,
		editAndResend,
		getRowActionState,
		handleDialogOpenChange,
		openBlankComposer,
		requestInboxRefresh,
		resend,
		workerGeneration,
	};
}
