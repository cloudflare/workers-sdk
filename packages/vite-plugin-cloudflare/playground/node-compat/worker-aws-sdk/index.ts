import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export default {
	async fetch() {
		const dynamoDbClient = new DynamoDBClient({ region: "us-east-1" });

		return Response.json({
			"(AWS SDK) client is instance of DynamoDBClient":
				dynamoDbClient instanceof DynamoDBClient,
		});
	},
} satisfies ExportedHandler;
