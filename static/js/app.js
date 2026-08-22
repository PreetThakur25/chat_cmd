let chatHistory = [];
let stagedCommandData = null;

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const aiToggle = document.getElementById('ai-toggle');
    const aiInput = document.getElementById('ai-input');
    const sendAiBtn = document.getElementById('send-ai-btn');
    const chatHistoryEl = document.getElementById('chat-history');

    const stagingCard = document.getElementById('staging-card');
    const riskBadge = document.getElementById('risk-badge');
    const destructiveWarning = document.getElementById('destructive-warning');
    const stagedCommandText = document.getElementById('staged-command');
    const commandExplanation = document.getElementById('command-explanation');
    const runCommandBtn = document.getElementById('run-command-btn');
    const cancelCommandBtn = document.getElementById('cancel-command-btn');
    const bookmarkStagedBtn = document.getElementById('bookmark-staged-btn');

    const bookmarksList = document.getElementById('bookmarks-list');
    const bookmarkNameInput = document.getElementById('bookmark-name');
    const bookmarkCmdInput = document.getElementById('bookmark-cmd');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');

    const fixErrorBtn = document.getElementById('fix-error-btn');

    const confirmModal = document.getElementById('confirm-modal');
    const modalCommandText = document.getElementById('modal-command-text');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    // Load Bookmarks on Startup
    loadBookmarks();

    // 1. AI translation submission
    async function handleTranslation() {
        const prompt = aiInput.value.trim();
        if (!prompt) return;

        aiInput.value = '';
        addChatMessage('user', prompt);

        // If AI Toggle is disabled, bypass API and put query directly in staging as a raw command
        if (!aiToggle.checked) {
            stageCommand({
                command: prompt,
                explanation: "Raw command (AI Translation Disabled)",
                risk_level: "LOW",
                is_destructive: false,
                requires_confirmation: false
            });
            addChatMessage('system', `Staged command: <code>${prompt}</code>`);
            return;
        }

        addChatMessage('system', '🤖 Thinking...');

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    current_dir: window.currentCwd || "",
                    history: chatHistory.slice(-10) // Limit context history
                })
            });

            // Remove 'Thinking...' placeholder
            removeLastSystemMessage();

            if (!response.ok) {
                const err = await response.json();
                addChatMessage('system', `❌ Error: ${err.detail || 'Translation failed'}`);
                return;
            }

            const data = await response.json();
            
            // Add translation result to chat
            addChatMessage('system', `Generated command:<br><code>${data.command}</code>`);
            
            // Save to conversation history
            chatHistory.push({ role: 'user', content: prompt });
            chatHistory.push({ role: 'ai', content: data.command });

            stageCommand(data);

        } catch (e) {
            removeLastSystemMessage();
            addChatMessage('system', `❌ Connection error: ${e.message}`);
        }
    }

    sendAiBtn.addEventListener('click', handleTranslation);
    aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleTranslation();
    });

    // 2. Command Staging Interface
    function stageCommand(data) {
        stagedCommandData = data;
        stagedCommandText.value = data.command;
        commandExplanation.innerText = data.explanation;

        // Risk Level styling
        riskBadge.className = 'risk-badge';
        if (data.risk_level === 'HIGH') {
            riskBadge.classList.add('risk-high');
            riskBadge.innerText = 'HIGH RISK';
        } else if (data.risk_level === 'MEDIUM') {
            riskBadge.classList.add('risk-medium');
            riskBadge.innerText = 'MEDIUM RISK';
        } else {
            riskBadge.classList.add('risk-low');
            riskBadge.innerText = 'LOW RISK';
        }

        // Destructive warning
        if (data.is_destructive) {
            destructiveWarning.classList.remove('hidden');
        } else {
            destructiveWarning.classList.add('hidden');
        }

        stagingCard.classList.remove('hidden');
        stagingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 3. Command Execution Flow
    runCommandBtn.addEventListener('click', () => {
        const cmd = stagedCommandText.value.trim();
        if (!cmd) return;

        const isHighRisk = stagedCommandData && (stagedCommandData.risk_level === 'HIGH' || stagedCommandData.requires_confirmation);

        if (isHighRisk) {
            // Intercept and prompt confirmation modal
            modalCommandText.innerText = cmd;
            confirmModal.classList.remove('hidden');
        } else {
            executeStaged(cmd);
        }
    });

    modalConfirmBtn.addEventListener('click', () => {
        const cmd = stagedCommandText.value.trim();
        confirmModal.classList.add('hidden');
        executeStaged(cmd);
    });

    modalCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    function executeStaged(cmd) {
        if (window.sendTerminalCommand) {
            window.sendTerminalCommand(cmd);
            stagingCard.classList.add('hidden');
            stagedCommandData = null;
        }
    }

    cancelCommandBtn.addEventListener('click', () => {
        stagingCard.classList.add('hidden');
        stagedCommandData = null;
    });

    // Bookmark Staged Command Helper
    bookmarkStagedBtn.addEventListener('click', () => {
        const cmd = stagedCommandText.value.trim();
        if (!cmd) return;
        
        const name = prompt("Enter a label for this bookmark:");
        if (name) {
            addBookmarkToServer(name, cmd);
        }
    });

    // 4. Bookmarks Management
    async function loadBookmarks() {
        try {
            const response = await fetch('/api/bookmarks');
            const data = await response.json();
            renderBookmarks(data);
        } catch (e) {
            console.error("Error loading bookmarks:", e);
        }
    }

    function renderBookmarks(bookmarks) {
        bookmarksList.innerHTML = '';
        bookmarks.forEach(b => {
            const chip = document.createElement('div');
            chip.className = 'bookmark-chip';
            chip.innerHTML = `
                <span>📌 <b>${escapeHtml(b.name)}</b></span>
                <span class="bookmark-cmd-preview">${escapeHtml(b.command)}</span>
            `;
            chip.addEventListener('click', () => {
                stageCommand({
                    command: b.command,
                    explanation: `Bookmarked command: "${b.name}"`,
                    risk_level: "LOW",
                    is_destructive: false,
                    requires_confirmation: false
                });
            });
            bookmarksList.appendChild(chip);
        });
    }

    async function addBookmarkToServer(name, cmd) {
        try {
            const res = await fetch('/api/bookmarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, command: cmd })
            });
            if (res.ok) {
                const updatedList = await res.json();
                renderBookmarks(updatedList);
            } else {
                const err = await res.json();
                alert(`Error: ${err.detail}`);
            }
        } catch (e) {
            alert(`Error adding bookmark: ${e.message}`);
        }
    }

    addBookmarkBtn.addEventListener('click', () => {
        const name = bookmarkNameInput.value.trim();
        const cmd = bookmarkCmdInput.value.trim();
        if (!name || !cmd) return;

        addBookmarkToServer(name, cmd);
        bookmarkNameInput.value = '';
        bookmarkCmdInput.value = '';
    });

    // 5. Self-Healing / AI Error Diagnosis
    fixErrorBtn.addEventListener('click', async () => {
        if (!window.lastStderr) return;

        fixErrorBtn.classList.add('hidden');
        addChatMessage('user', '🔧 Please fix the last terminal error.');
        addChatMessage('system', '🤖 Analyzing error...');

        try {
            const response = await fetch('/api/explain-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: window.lastExecutedCommand || "",
                    error_output: window.lastStderr,
                    current_dir: window.currentCwd || ""
                })
            });

            removeLastSystemMessage();

            if (!response.ok) {
                const err = await response.json();
                addChatMessage('system', `❌ Error: ${err.detail || 'Analysis failed'}`);
                return;
            }

            const data = await response.json();
            
            addChatMessage('system', `💡 <b>Diagnosis:</b> ${data.explanation}<br>Suggested fix: <code>${data.corrected_command}</code>`);

            stageCommand({
                command: data.corrected_command,
                explanation: `AI Corrected Command: ${data.explanation}`,
                risk_level: "MEDIUM",
                is_destructive: false,
                requires_confirmation: false
            });

        } catch (e) {
            removeLastSystemMessage();
            addChatMessage('system', `❌ Diagnostics connection error: ${e.message}`);
        }
    });

    // UI Helpers
    function addChatMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        
        const avatar = role === 'user' ? '👤' : '🤖';
        messageDiv.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="msg-content">
                <p>${text}</p>
            </div>
        `;
        
        chatHistoryEl.appendChild(messageDiv);
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }

    function removeLastSystemMessage() {
        const messages = chatHistoryEl.getElementsByClassName('chat-message system');
        if (messages.length > 0) {
            messages[messages.length - 1].remove();
        }
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
