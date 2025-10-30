cd "C:\Users\tomo\OneDrive\My Pet Projects\AI\4.0.Sailing-Chatbot"

# Set GitHub repo URL (just in case)
git remote set-url origin https://github.com/thomad99/LoveSailing-ChatBot.git

# Stage all local changes
git add .

# Check for changes
$changes = git status --porcelain

if ($changes) {
    Write-Output "🔄 Files to be committed:"
    $changes

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    git commit -m "Auto-sync $timestamp"

    Write-Output "⬆️ Force pushing local changes to GitHub..."
    git push origin main --force
    Write-Output "✅ Force sync complete at $timestamp"
}
else {
    Write-Output "🟢 No changes to sync."
}

# Ensure Images folder is tracked
if (Test-Path "Images") {
    git add Images/ -f
    Write-Output "Chatbot folder staged"
}

