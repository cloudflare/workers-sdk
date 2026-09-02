import { z } from "zod";
import {
	zEmailAttachment,
	zEmailBase,
	zEmailHandlerEvent,
	zEmailHandlerForward,
	zEmailHandlerReplyApi,
	zEmailRoutingDetail,
	zEmailRoutingItem,
	zEmailSendingDetail,
	zEmailSendingItem,
	zEmailSendRequest,
} from "../src/workers/email/contracts";

const EMAIL_SCHEMAS = {
	"email_handler-event": zEmailHandlerEvent,
	"email_handler-forward": zEmailHandlerForward,
	"email_handler-reply": zEmailHandlerReplyApi,
	email_base: zEmailBase,
	"email_routing-item": zEmailRoutingItem,
	"email_routing-detail": zEmailRoutingDetail,
	"email_send-request": zEmailSendRequest,
	email_attachment: zEmailAttachment,
	"email_sending-item": zEmailSendingItem,
	"email_sending-detail": zEmailSendingDetail,
};

const emailSchemaRegistry = z.registry<{ id: string }>();
for (const [id, schema] of Object.entries(EMAIL_SCHEMAS)) {
	emailSchemaRegistry.add(schema, { id });
}

const { schemas: emailOpenApiSchemas } = z.toJSONSchema(emailSchemaRegistry, {
	target: "openapi-3.0",
	unrepresentable: "any",
	uri: (id) => `#/components/schemas/${id}`,
});

export const EMAIL_OPENAPI_SCHEMAS = Object.fromEntries(
	Object.entries(emailOpenApiSchemas).map(([id, schema]) => {
		const { $id: _$id, $schema: _$schema, ...openApiSchema } = schema;
		return [id, openApiSchema];
	})
);
