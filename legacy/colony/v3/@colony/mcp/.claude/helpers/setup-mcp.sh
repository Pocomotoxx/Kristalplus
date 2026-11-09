#!/bin/bash
# Setup MCP server for Colony

echo "🚀 Setting up Colony MCP server..."

# Check if claude command exists
if ! command -v claude &> /dev/null; then
    echo "❌ Error: Claude Code CLI not found"
    echo "Please install Claude Code first"
    exit 1
fi

# Add MCP server
echo "📦 Adding Colony MCP server..."
claude mcp add colony npx colony mcp start

echo "✅ MCP server setup complete!"
echo "🎯 You can now use mcp__colony__ tools in Claude Code"
