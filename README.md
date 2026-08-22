# ChatCMD - AI Command Center

A modern, lightweight web-based console that converts natural language queries into executable shell commands. Features an approval-first execution workflow, real-time terminal streaming, and self-healing AI error diagnostics.

---

## Features
- **AI Translation**: Uses Google GenAI (Gemini) to convert plain English to PowerShell commands in real-time.
- **Interactive Live Terminal**: Right pane features a fully interactive `xterm.js` terminal window piped directly to a persistent background PowerShell session.
- **Staging & Safety Controls**: Natural language translations are placed in an editable staging field with inline risk indicators (LOW/MEDIUM/HIGH) and confirmation dialogs before execution.
- **Self-Healing Diagnostics**: Click "Fix with AI" if a command prints an error to automatically analyze the stderr trace and get a suggested fix.
- **Bookmarks & Snippets**: Save frequently run commands to trigger them instantly from the sidebar.

---

## Tech Stack
- **Backend**: FastAPI, Uvicorn, WebSockets, `google-genai` SDK
- **Frontend**: HTML5, CSS3 (Modern Dark Developer Theme), Vanilla JavaScript, `xterm.js` + `xterm-addon-fit`

---

## Getting Started

### 1. Configure the Gemini API Key
Create a file named `api_key.txt` in the project root folder and paste your Google Gemini API key:
```text
AIzaSy...
```
*(Alternatively, set the `GEMINI_API_KEY` environment variable).*

### 2. Install Dependencies
Make sure you have python 3.9+ installed, then run:
```bash
pip install -r requirements.txt
```

### 3. Run the Server
Launch the FastAPI uvicorn server:
```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

### 4. Open in Browser
Navigate to:
[http://localhost:8000/](http://localhost:8000/)
