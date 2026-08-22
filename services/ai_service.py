import os
import re
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

class CommandResponse(BaseModel):
    command: str = Field(description="The executable shell command.")
    explanation: str = Field(description="Brief explanation of what the command does.")
    risk_level: str = Field(description="Risk assessment: 'LOW', 'MEDIUM', or 'HIGH'.")
    is_destructive: bool = Field(description="True if command deletes, overwrites, or modifies critical settings.")
    requires_confirmation: bool = Field(description="True if the user must click confirmation before executing.")

class ErrorDiagnosisResponse(BaseModel):
    explanation: str = Field(description="Explanation of why the error occurred.")
    corrected_command: str = Field(description="Corrected version of the command.")

class AIService:
    def __init__(self):
        # Resolve API Key
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            for key_file in ["api_key.txt", "gemini_key.txt"]:
                if os.path.exists(key_file):
                    with open(key_file, "r") as f:
                        api_key = f.read().strip()
                        break
        
        if not api_key:
            raise ValueError(
                "Gemini API Key missing. Please set the GEMINI_API_KEY environment variable "
                "or write it to 'api_key.txt' or 'gemini_key.txt' in the workspace directory."
            )
        
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.5-flash"

    def translate_prompt(self, prompt: str, current_dir: str, history: list) -> CommandResponse:
        """Translates a natural language prompt to a shell command with safety metadata."""
        system_instruction = (
            "You are a command-line translation assistant. "
            "Convert the user's natural language request into an executable Windows PowerShell command. "
            "Take the current directory and chat history context into consideration if provided. "
            "Output JSON conforming strictly to the requested schema."
        )
        
        contents = f"Current working directory: {current_dir}\n"
        if history:
            contents += "Conversation history:\n"
            for h in history:
                contents += f"- {h.get('role', 'user')}: {h.get('content', '')}\n"
        contents += f"User Prompt: {prompt}"

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=CommandResponse,
            )
        )
        
        result = CommandResponse.model_validate_json(response.text)
        result = self._apply_safety_rules(result)
        return result

    def explain_error(self, command: str, error_output: str, current_dir: str) -> ErrorDiagnosisResponse:
        """Explains shell command execution errors and suggests a fix."""
        system_instruction = (
            "You are a command-line troubleshooter. "
            "Analyze the failed PowerShell command and its error output. "
            "Provide a brief explanation of the issue and a corrected command to fix it."
        )
        contents = (
            f"Current working directory: {current_dir}\n"
            f"Failed command: {command}\n"
            f"Error / stderr output:\n{error_output}"
        )

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=ErrorDiagnosisResponse,
            )
        )
        return ErrorDiagnosisResponse.model_validate_json(response.text)

    def _apply_safety_rules(self, res: CommandResponse) -> CommandResponse:
        """Force flag destructive operations as HIGH risk to prevent accidental system modifications."""
        cmd = res.command.lower()
        
        # Match dangerous patterns
        destructive_patterns = [
            r"remove-item\s+.*-(recurse|force)",
            r"rm\s+-[rf]+",
            r"format-volume",
            r"clear-disk",
            r"remove-partition",
            r"remove-volume",
            r"set-itemproperty\s+.*hklm",
            r"remove-itemproperty",
            r"del\s+.*\/f",
            r"rd\s+.*\/s",
            r"wpeutil\s+shutdown",
            r"shutdown\s+/s",
        ]
        
        is_unsafe = False
        for pattern in destructive_patterns:
            if re.search(pattern, cmd):
                is_unsafe = True
                break
                
        if is_unsafe:
            res.risk_level = "HIGH"
            res.is_destructive = True
            res.requires_confirmation = True
            
        return res
