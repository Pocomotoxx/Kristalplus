#!/bin/bash
# Setup GitHub integration for Colony

echo "🔗 Setting up GitHub integration..."

# Check for gh CLI
if ! command -v gh &> /dev/null; then
    echo "⚠️  GitHub CLI (gh) not found"
    echo "Install from: https://cli.github.com/"
    echo "Continuing without GitHub features..."
else
    echo "✅ GitHub CLI found"
    
    # Check auth status
    if gh auth status &> /dev/null; then
        echo "✅ GitHub authentication active"
    else
        echo "⚠️  Not authenticated with GitHub"
        echo "Run: gh auth login"
    fi
fi

echo ""
echo "📦 GitHub swarm commands available:"
echo "  - npx colony github swarm"
echo "  - npx colony repo analyze"
echo "  - npx colony pr enhance"
echo "  - npx colony issue triage"
