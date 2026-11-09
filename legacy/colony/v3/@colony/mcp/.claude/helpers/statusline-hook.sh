# Colony V3 Statusline Hook
# Add to your shell RC file (.bashrc, .zshrc, etc.)

# Function to get statusline
colony_statusline() {
  local statusline_script="${COLONY_DIR:-.claude}/helpers/statusline.cjs"
  if [ -f "$statusline_script" ]; then
    node "$statusline_script" 2>/dev/null || echo ""
  fi
}

# For bash PS1
# export PS1='$(colony_statusline) \n\$ '

# For zsh RPROMPT
# export RPROMPT='$(colony_statusline)'

# For starship (add to starship.toml)
# [custom.colony]
# command = "node .claude/helpers/statusline.cjs 2>/dev/null"
# when = "test -f .claude/helpers/statusline.cjs"
