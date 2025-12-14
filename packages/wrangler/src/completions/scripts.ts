import type { DefinitionTree } from "../core/types";

/**
 * Generate dynamic bash completion script.
 * Calls `wrangler __complete` at runtime for completions.
 */
export function getBashScript(_tree: DefinitionTree): string {
	return `###-begin-wrangler-completions-###
#
# wrangler bash completion
#
# Installation: wrangler completions bash >> ~/.bashrc
#

_wrangler_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local IFS=$'\\n'

  # Call wrangler __complete with all words
  # Use -- to stop yargs from parsing flags in the completion args
  local completions
  completions=\$(wrangler __complete -- "\${COMP_WORDS[@]}" 2>/dev/null)

  # Parse tab-separated output (value\\tdescription)
  # Bash complete only uses the value part
  COMPREPLY=()
  while IFS=$'\\t' read -r value desc; do
    if [[ "\$value" == "\$cur"* ]]; then
      COMPREPLY+=("\$value")
    fi
  done <<< "\$completions"
}

complete -o default -F _wrangler_completions wrangler
###-end-wrangler-completions-###`;
}

/**
 * Generate dynamic zsh completion script.
 * Calls `wrangler __complete` at runtime for completions.
 */
export function getZshScript(_tree: DefinitionTree): string {
	return `#compdef wrangler
###-begin-wrangler-completions-###
#
# wrangler zsh completion
#
# Installation: wrangler completions zsh >> ~/.zshrc
#

_wrangler() {
  local -a completions
  local line

  # Call wrangler __complete with current words
  # Use -- to stop yargs from parsing flags in the completion args
  while IFS=$'\\t' read -r value desc; do
    completions+=("\${value}:\${desc}")
  done < <(wrangler __complete -- "\${words[@]}" 2>/dev/null)

  _describe 'wrangler' completions
}

compdef _wrangler wrangler
###-end-wrangler-completions-###`;
}

/**
 * Generate dynamic fish completion script.
 * Calls `wrangler __complete` at runtime for completions.
 */
export function getFishScript(_tree: DefinitionTree): string {
	return `###-begin-wrangler-completions-###
#
# wrangler fish completion
#
# Installation: wrangler completions fish > ~/.config/fish/completions/wrangler.fish
#

function __wrangler_prepare_completions
  set -l tokens (commandline -opc)
  set -l current (commandline -ct)
  # Use -- to stop yargs from parsing flags in the completion args
  set --global __wrangler_comp_results (wrangler __complete -- \$tokens \$current 2>/dev/null)
  return 0
end

complete -c wrangler -f -n '__wrangler_prepare_completions' -a '\$__wrangler_comp_results'
###-end-wrangler-completions-###`;
}
