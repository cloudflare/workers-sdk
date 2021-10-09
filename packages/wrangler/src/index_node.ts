import { main } from ".";

main().catch((cause) => {
  const { name, message } = cause;
  if (name === "CloudflareError") {
    console.error("\x1b[31m", message);
    return;
  }
  throw cause;
});
