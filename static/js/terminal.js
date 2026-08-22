// Global terminal, socket and state references
let term;
let fitAddon;
let socket;
let lastStderr = "";
let currentCwd = "";
let lastExecutedCommand = "";

function initTerminal() {
    term = new Terminal({
        cursorBlink: true,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        theme: {
            background: "#000000",
            foreground: "#f3f4f6",
            cursor: "#10b981",
            selection: "#3b82f640",
            black: "#000000",
            red: "#ef4444",
            green: "#10b981",
            yellow: "#f59e0b",
            blue: "#3b82f6",
            magenta: "#d946ef",
            cyan: "#06b6d4",
            white: "#f3f4f6",
            brightBlack: "#4b5563",
            brightRed: "#f87171",
            brightGreen: "#34d399",
            brightYellow: "#fbbf24",
            brightBlue: "#60a5fa",
            brightMagenta: "#e879f9",
            brightCyan: "#22d3ee",
            brightWhite: "#ffffff"
        }
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    fitAddon.fit();

    // Capture standard terminal inputs
    term.onData(data => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(data);
            
            // Check if user submitted a command manually
            if (data.includes('\r') || data.includes('\n')) {
                lastStderr = "";
                document.getElementById('fix-error-btn').classList.add('hidden');
                // Wait briefly for execution then sync directory
                setTimeout(queryCwd, 400);
            }
        }
    });

    // Fit terminal layout on window resizing
    window.addEventListener('resize', () => {
        fitAddon.fit();
    });

    // Establish WebSocket Connection
    connectWebSocket();
    
    // Clear terminal action
    document.getElementById('clear-term-btn').addEventListener('click', () => {
        term.clear();
        term.focus();
    });
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}/ws/terminal`;
    
    const badge = document.getElementById('connection-badge');
    const text = document.getElementById('connection-status-text');

    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
        badge.className = 'connection-status connected';
        text.innerText = 'PowerShell Connected';
        setTimeout(queryCwd, 500);
    };

    socket.onmessage = (event) => {
        try {
            const frame = JSON.parse(event.data);
            if (frame.type === 'stdout') {
                term.write(frame.data);
            } else if (frame.type === 'stderr') {
                term.write(frame.data);
                lastStderr += frame.data;
                if (lastStderr.trim().length > 0) {
                    document.getElementById('fix-error-btn').classList.remove('hidden');
                }
            }
        } catch (e) {
            term.write(event.data);
        }
    };

    socket.onclose = () => {
        badge.className = 'connection-status disconnected';
        text.innerText = 'Connection Lost';
        // Auto-reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
}

// Function to send staging command to shell
window.sendTerminalCommand = function(cmd) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        lastExecutedCommand = cmd;
        socket.send(cmd + "\r\n");
        lastStderr = "";
        document.getElementById('fix-error-btn').classList.add('hidden');
        // Let terminal stream run, then update directory state
        setTimeout(queryCwd, 500);
    }
};

// Sync CWD display
function queryCwd() {
    fetch('/api/cwd')
        .then(res => res.json())
        .then(data => {
            currentCwd = data.cwd;
            document.getElementById('cwd-display').innerText = `CWD: ${currentCwd}`;
        })
        .catch(err => console.error("Error fetching shell directory:", err));
}

window.queryCwd = queryCwd;

document.addEventListener('DOMContentLoaded', initTerminal);
