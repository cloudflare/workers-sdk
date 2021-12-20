import { confirm, prompt } from "../dialogs";

/**
 * The expected values for a confirmation request.
 */
export interface ConfirmExpectation {
  /** The text expected to be seen in the confirmation dialog. */
  text: string;
  /** The mock response send back from the confirmation dialog. */
  result: boolean;
}

/**
 * Mock the implementation of `confirm()` that will respond with configured results
 * for configured confirmation text messages.
 *
 * If there is a call to `confirm()` that does not match any of the expectations
 * then an error is thrown.
 */
export function mockConfirm(...expectations: ConfirmExpectation[]) {
  (confirm as jest.Mock).mockImplementation((text: string) => {
    for (const { text: expectedText, result } of expectations) {
      if (text === expectedText) {
        return Promise.resolve(result);
      }
    }
    throw new Error(`Unexpected confirmation message: ${text}`);
  });
}

/**
 * The expected values for a prompt request.
 */
export interface PromptExpectation {
  /** The text expected to be seen in the prompt dialog. */
  text: string;
  /** The type of the prompt. */
  type: "text" | "password";
  /** The mock response send back from the prompt dialog. */
  result: string;
}

/**
 * Mock the implementation of `prompt()` that will respond with configured results
 * for configured prompt text messages.
 *
 * If there is a call to `prompt()` that does not match any of the expectations
 * then an error is thrown.
 */
export function mockPrompt(...expectations: PromptExpectation[]) {
  (prompt as jest.Mock).mockImplementation(
    (text: string, type: "text" | "password") => {
      for (const {
        text: expectedText,
        type: expectedType,
        result,
      } of expectations) {
        if (text === expectedText && type == expectedType) {
          return Promise.resolve(result);
        }
      }
      throw new Error(`Unexpected confirmation message: ${text}`);
    }
  );
}
