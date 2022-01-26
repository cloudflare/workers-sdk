import EventEmitter from "node:events";
import { render } from "ink";
import type { ReactElement } from "react";
import { logger } from "./logger";

/**
 * Render the given ink.js `Component` to a string.
 *
 * It should only be used for components that will static render output based on their properties.
 */
export function renderToString(Component: ReactElement) {
  const stdout = new CaptureStd();
  render(Component, {
    stdout: stdout as unknown as NodeJS.WriteStream,
  });

  return stdout.output;
}

/**
 * This class is passed to the ink.js `render()` to capture its output into a string.
 *
 * Each new rendering will overwrite the content being captured.
 */
class CaptureStd extends EventEmitter {
  output = "";
  columns = logger.columns;

  write(str: string) {
    this.output = str;
  }
}
