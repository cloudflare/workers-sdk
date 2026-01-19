// Types for the Email Sending API MessageBuilder interface

export type EmailAttachment =
	| {
			disposition: "inline";
			contentId: string;
			filename: string;
			type: string;
			content: string | ArrayBuffer | ArrayBufferView;
	  }
	| {
			disposition: "attachment";
			contentId?: undefined;
			filename: string;
			type: string;
			content: string | ArrayBuffer | ArrayBufferView;
	  };

export interface EmailAddress {
	name: string;
	email: string;
}

export interface MessageBuilder {
	from: string | EmailAddress;
	to: string | string[];
	subject: string;
	replyTo?: string | EmailAddress;
	cc?: string | string[];
	bcc?: string | string[];
	headers?: Record<string, string>;
	text?: string;
	html?: string;
	attachments?: EmailAttachment[];
}
