import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from services.shell_service import ShellManager
from services.ai_service import AIService

app = FastAPI(title="ChatCMD Console")

# Ensure static assets directories exist
os.makedirs("static", exist_ok=True)
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)

# Initialize AI Service
ai_service = None
try:
    ai_service = AIService()
except Exception as e:
    print(f"AI Service Initialization Warning: {e}")

# Global shell session registry
active_shell = None
active_shell_lock = asyncio.Lock()

class TranslateRequest(BaseModel):
    prompt: str
    current_dir: str
    history: list = []

class ErrorRequest(BaseModel):
    command: str
    error_output: str
    current_dir: str

class BookmarkItem(BaseModel):
    name: str
    command: str

BOOKMARKS_FILE = "bookmarks.json"

def load_bookmarks():
    default_bookmarks = [
        {"name": "List Files", "command": "Get-ChildItem"},
        {"name": "System Processes", "command": "Get-Process"},
        {"name": "Active Services", "command": "Get-Service"},
        {"name": "IP Configuration", "command": "ipconfig"},
        {"name": "Network Connections", "command": "Get-NetTCPConnection"}
    ]
    if not os.path.exists(BOOKMARKS_FILE):
        with open(BOOKMARKS_FILE, "w") as f:
            json.dump(default_bookmarks, f, indent=2)
        return default_bookmarks
    try:
        with open(BOOKMARKS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return default_bookmarks

def save_bookmarks(bookmarks):
    with open(BOOKMARKS_FILE, "w") as f:
        json.dump(bookmarks, f, indent=2)

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")

@app.get("/api/cwd")
async def get_cwd():
    global active_shell
    if active_shell:
        return {"cwd": active_shell.get_cwd()}
    return {"cwd": os.getcwd()}

@app.post("/api/translate")
async def translate_command(req: TranslateRequest):
    if not ai_service:
        raise HTTPException(status_code=500, detail="AI Service not initialized. Check API key configuration.")
    try:
        resolved_dir = req.current_dir or (active_shell.get_cwd() if active_shell else os.getcwd())
        res = ai_service.translate_prompt(req.prompt, resolved_dir, req.history)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/explain-error")
async def explain_command_error(req: ErrorRequest):
    if not ai_service:
        raise HTTPException(status_code=500, detail="AI Service not initialized.")
    try:
        resolved_dir = req.current_dir or (active_shell.get_cwd() if active_shell else os.getcwd())
        res = ai_service.explain_error(req.command, req.error_output, resolved_dir)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bookmarks")
async def get_bookmarks():
    return load_bookmarks()

@app.post("/api/bookmarks")
async def add_bookmark(req: BookmarkItem):
    bookmarks = load_bookmarks()
    if any(b["name"] == req.name for b in bookmarks):
        raise HTTPException(status_code=400, detail="Bookmark with this name already exists.")
    bookmarks.append({"name": req.name, "command": req.command})
    save_bookmarks(bookmarks)
    return bookmarks

@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    global active_shell
    await websocket.accept()
    
    async with active_shell_lock:
        if active_shell:
            await active_shell.stop()
        active_shell = ShellManager()
        await active_shell.start()
        
    shell_ref = active_shell

    async def forward_stream(stream_generator, ws, stream_type):
        try:
            async for chunk in stream_generator:
                text = chunk.decode("utf-8", errors="replace")
                await ws.send_json({"type": stream_type, "data": text})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error forwarding stream: {e}")

    # Set up concurrent forwarding loops for stdout and stderr
    stdout_task = asyncio.create_task(forward_stream(shell_ref.read_stdout(), websocket, "stdout"))
    stderr_task = asyncio.create_task(forward_stream(shell_ref.read_stderr(), websocket, "stderr"))

    try:
        while True:
            data = await websocket.receive_text()
            await shell_ref.write(data)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket execution error: {e}")
    finally:
        stdout_task.cancel()
        stderr_task.cancel()
        async with active_shell_lock:
            if active_shell == shell_ref:
                await shell_ref.stop()
                active_shell = None

app.mount("/static", StaticFiles(directory="static"), name="static")
