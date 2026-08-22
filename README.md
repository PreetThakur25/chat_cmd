# Natural Language Command Prompt (ChatCMD)

An AI-powered CLI assistant that converts natural language into executable system commands. Features a PySide6 GUI with approval controls and persistent PowerShell sessions.

## Features
- **AI Translation**: Uses Google GenAI (Gemini) to convert plain English to PowerShell commands.
- **Multithreading**: Ensures smooth, non-blocking execution using Qt's `QThread`.
- **Sandboxed Execution**: Manages subprocesses securely.
- **GUI Controls**: Built with PySide6 for a modern desktop application experience.

## Tech Stack
- Python, PySide6
- Google GenAI (Gemini)
- PowerShell
