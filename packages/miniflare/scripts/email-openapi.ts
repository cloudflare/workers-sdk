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

function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
	const { $schema: _$schema, ...openApiSchema } = z.toJSONSchema(schema, {
		target: "openapi-3.0",
		unrepresentable: "any",
	});
	return openApiSchema;
}

export const EMAIL_OPENAPI_SCHEMAS = {
	"email_handler-event": toOpenApiSchema(zEmailHandlerEvent),
	"email_handler-forward": toOpenApiSchema(zEmailHandlerForward),
	"email_handler-reply": toOpenApiSchema(zEmailHandlerReplyApi),
	email_base: toOpenApiSchema(zEmailBase),
	"email_routing-item": toOpenApiSchema(zEmailRoutingItem),
	"email_routing-detail": toOpenApiSchema(zEmailRoutingDetail),
	"email_send-request": toOpenApiSchema(zEmailSendRequest),
	email_attachment: toOpenApiSchema(zEmailAttachment),
	"email_sending-item": toOpenApiSchema(zEmailSendingItem),
	"email_sending-detail": toOpenApiSchema(zEmailSendingDetail),
};
