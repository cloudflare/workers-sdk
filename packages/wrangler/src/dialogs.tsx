import chalk from "chalk";
import { Box, Text, useInput, render } from "ink";
import TextInput from "ink-text-input";
import * as React from "react";
import { useState } from "react";
import { logger } from "./logger";
type ConfirmProps = {
  text: string;
  onConfirm: (answer: boolean) => void;
};
function Confirm(props: ConfirmProps) {
  useInput((input: string, key) => {
    if (input === "y" || key.return === true) {
      props.onConfirm(true);
    } else if (input === "n") {
      props.onConfirm(false);
    } else {
      logger.warn("Unrecognised input:", input);
    }
  });
  return (
    <Box>
      <Text>
        {props.text} ({chalk.bold("y")}/n)
      </Text>
    </Box>
  );
}

export function confirm(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <Confirm
        text={text}
        onConfirm={(answer: boolean) => {
          unmount();
          resolve(answer);
        }}
      />
    );
  });
}

type PromptProps = {
  text: string;
  defaultValue?: string;
  type?: "text" | "password";
  onSubmit: (text: string) => void;
};

function Prompt(props: PromptProps) {
  const [value, setValue] = useState(props.defaultValue || "");

  return (
    <Box>
      <Text>{props.text} </Text>
      <Box>
        <TextInput
          mask={props.type === "password" ? "*" : undefined}
          value={value}
          onChange={setValue}
          onSubmit={props.onSubmit}
        />
      </Box>
    </Box>
  );
}

export async function prompt(
  text: string,
  type: "text" | "password" = "text",
  defaultValue?: string
): Promise<string> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <Prompt
        text={text}
        defaultValue={defaultValue}
        type={type}
        onSubmit={(inputText) => {
          unmount();
          resolve(inputText);
        }}
      />
    );
  });
}
