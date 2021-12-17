import * as React from "react";
import { useState } from "react";
import { Box, Text, useInput, render } from "ink";
import TextInput from "ink-text-input";
type ConfirmProps = {
  text: string;
  onConfirm: (answer: boolean) => void;
};
function Confirm(props: ConfirmProps) {
  useInput((input: string) => {
    if (input === "y") {
      props.onConfirm(true);
    } else if (input === "n") {
      props.onConfirm(false);
    } else {
      console.log("Unrecognised input");
    }
  });
  return (
    <Box>
      <Text>{props.text} (y/n) </Text>
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
  type?: "text" | "password";
  onSubmit: (text: string) => void;
};

function Prompt(props: PromptProps) {
  const [value, setValue] = useState("");

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

export async function prompt(text: string, type: "text" | "password" = "text") {
  return new Promise((resolve) => {
    const { unmount } = render(
      <Prompt
        text={text}
        type={type}
        onSubmit={(text) => {
          unmount();
          resolve(text);
        }}
      />
    );
  });
}
