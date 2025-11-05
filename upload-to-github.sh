#!/bin/bash
# Script to create GitHub repository and push code

echo "🚀 Creating and uploading to GitHub: Shtilaheit/Zemer-PHP"
echo ""

# Repository details
REPO_NAME="Zemer-PHP"
REPO_OWNER="Shtilaheit"
REPO_DESCRIPTION="⚡ High-performance PHP web client for YouTube Music streaming. Material 3 design, vanilla JavaScript, zero frameworks. Blazing fast (<1s first paint)"

echo "📦 Creating repository on GitHub..."
echo ""
echo "Please create the repository manually:"
echo ""
echo "1. Go to: https://github.com/new"
echo "2. Repository name: $REPO_NAME"
echo "3. Description: $REPO_DESCRIPTION"
echo "4. Visibility: Public (recommended)"
echo "5. ⚠️  DO NOT initialize with README, .gitignore, or license"
echo "6. Click 'Create repository'"
echo ""
echo "Then press Enter to continue..."
read -p ""

echo ""
echo "📤 Pushing code to GitHub..."

# Push to GitHub
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully uploaded to GitHub!"
    echo ""
    echo "🔗 Repository URL: https://github.com/$REPO_OWNER/$REPO_NAME"
    echo ""
else
    echo ""
    echo "❌ Failed to push. Please check the error above."
    echo ""
fi
