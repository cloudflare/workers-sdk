// Usage: node scripts/set-webhook.mjs <worker-url> <bot-token> <webhook-secret>
// Example:
//   node scripts/set-webhook.mjs https://teammarysy-bot.myaccount.workers.dev 123456:ABC... mySecret123

const [, , workerUrl, botToken, webhookSecret] = process.argv;

if (!workerUrl || !botToken || !webhookSecret) {
  console.error("Usage: node scripts/set-webhook.mjs <worker-url> <bot-token> <webhook-secret>");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: workerUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
  }),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));

if (!data.ok) {
  process.exit(1);
}
