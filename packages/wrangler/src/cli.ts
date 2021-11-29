import { main } from ".";

main(process.argv.slice(2)).catch((cause) => {
  const { name, message } = cause;
  if (name === "CloudflareError") {
    console.error("\x1b[31m", message);
    return;
  }
  throw cause;
});
