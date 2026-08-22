import asyncio
import os
import psutil

class ShellManager:
    def __init__(self):
        self.process = None
        self._pid = None

    async def start(self):
        """Spawn the persistent PowerShell process with a custom prompt to sync directory state."""
        self.process = await asyncio.create_subprocess_exec(
            "powershell.exe", "-NoLogo", "-NoExit", "-Command", "-",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        self._pid = self.process.pid

        # Set prompt function that updates the OS-level working directory for the process
        setup_cmd = (
            'function prompt { '
            '[System.IO.Directory]::SetCurrentDirectory($PWD.Path); '
            '"PS " + $PWD.Path + "> " '
            '}\n'
        )
        self.process.stdin.write(setup_cmd.encode('utf-8'))
        await self.process.stdin.drain()

    async def write(self, data: str):
        """Write user input to the PowerShell stdin."""
        if self.process and self.process.stdin:
            self.process.stdin.write(data.encode('utf-8'))
            await self.process.stdin.drain()

    async def read_stdout(self):
        """Stream stdout bytes from PowerShell."""
        if self.process and self.process.stdout:
            while True:
                data = await self.process.stdout.read(1024)
                if not data:
                    break
                yield data

    async def read_stderr(self):
        """Stream stderr bytes from PowerShell."""
        if self.process and self.process.stderr:
            while True:
                data = await self.process.stderr.read(1024)
                if not data:
                    break
                yield data

    def get_cwd(self) -> str:
        """Retrieve the actual active working directory of the PowerShell subprocess."""
        if self._pid:
            try:
                p = psutil.Process(self._pid)
                return p.cwd()
            except Exception:
                pass
        return os.getcwd()

    async def stop(self):
        """Clean up the PowerShell process."""
        if self.process:
            try:
                self.process.terminate()
                await self.process.wait()
            except Exception:
                pass
            self.process = None
