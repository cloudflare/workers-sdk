#!/usr/bin/env -S uv run --script --quiet
# /// script
# dependencies = ["pydantic"]
# requires-python = ">=3.12"
# ///

"""Provide an instruction for the prompt based on the flag."""

import sys
import textwrap
from pydantic import BaseModel


flags: dict[str, str] = {
    # ultrathink
    "-u": """
        Use the maximum amount of ultrathink. Take all the time you need.
        It's much better if you do too much research and thinking than not enough.
    """,
    # explain
    "-e": """
        above are the relevant logs - your job is to:
        think harder about what these logs say
        and give me a simpler & short explanation
        DO NOT JUMP TO CONCLUSIONS!! DO NOT MAKE ASSUMPTIONS! QUIET YOUR EGO
        AND ASSUME YOU KNOW NOTHING.
        then, after you've explained the logs to me, suggest what the next step might be & why
        answer in short
    """,
}


class HookData(BaseModel):
    prompt: str = ""


class PromptFlag(BaseModel):
    flag: str
    instruction: str


def extract_flag_instruction(prompt: str) -> str | None:
    prompt_stripped = prompt.rstrip()

    for flag, instruction in flags.items():
        if prompt_stripped.endswith(flag):
            return textwrap.dedent(instruction).rstrip()


def process_hook_data(json_input: str) -> str | None:
    data = HookData.model_validate_json(json_input)
    return extract_flag_instruction(data.prompt)


def main():
    json_input = sys.stdin.read()
    instruction = process_hook_data(json_input)

    if instruction:
        print(instruction)


if __name__ == "__main__":
    main()
