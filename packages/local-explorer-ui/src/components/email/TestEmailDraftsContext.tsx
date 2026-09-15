import { createContext, useContext, useMemo, useState } from "react";
import type { EmailSendRequest } from "../../api";
import type { Dispatch, JSX, PropsWithChildren, SetStateAction } from "react";

type AttachmentInput = NonNullable<EmailSendRequest["attachments"]>[number];

export interface SelectedTestEmailAttachment extends AttachmentInput {
	size: number;
}

export interface TestEmailHeader {
	name: string;
	value: string;
}

export interface TestEmailDraft {
	from: string;
	to: string;
	cc: string;
	bcc: string;
	replyTo: string;
	subject: string;
	headers: TestEmailHeader[];
	text: string;
	html: string;
	attachments: SelectedTestEmailAttachment[];
}

type TestEmailDrafts = Record<string, TestEmailDraft>;

interface TestEmailDraftsContextValue {
	drafts: TestEmailDrafts;
	setDrafts: Dispatch<SetStateAction<TestEmailDrafts>>;
}

const TestEmailDraftsContext =
	createContext<TestEmailDraftsContextValue | null>(null);

/** Retains successful test-email drafts while navigating between email routes. */
export function TestEmailDraftsProvider({
	children,
}: PropsWithChildren): JSX.Element {
	const [drafts, setDrafts] = useState<TestEmailDrafts>({});
	const value = useMemo(() => ({ drafts, setDrafts }), [drafts]);

	return (
		<TestEmailDraftsContext.Provider value={value}>
			{children}
		</TestEmailDraftsContext.Provider>
	);
}

/** Returns the successful test-email drafts retained by the email layout. */
export function useTestEmailDrafts(): TestEmailDraftsContextValue {
	const context = useContext(TestEmailDraftsContext);
	if (!context) {
		throw new Error(
			"useTestEmailDrafts must be used within a TestEmailDraftsProvider"
		);
	}

	return context;
}
