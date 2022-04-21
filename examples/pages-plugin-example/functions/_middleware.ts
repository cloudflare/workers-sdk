class BodyHandler {
  footerText: string;

  constructor({ footerText }) {
    this.footerText = footerText;
  }

  element(element) {
    // Don't actually set HTML like this!
    element.append(`<footer>${this.footerText}</footer>`, { html: true });
  }
}

export const onRequest = async ({ next, pluginArgs }) => {
  const response = await next();

  return new HTMLRewriter()
    .on("body", new BodyHandler({ footerText: pluginArgs.footerText }))
    .transform(response);
};
