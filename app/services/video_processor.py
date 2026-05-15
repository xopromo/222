"""
Video editing service using Claude Haiku model.

Integrates with video-use project to perform AI-powered video editing tasks:
- Filler word removal
- Subtitle generation
- Color grading
- Audio fade processing
"""

import json
from dataclasses import dataclass
from typing import Any

import anthropic


@dataclass
class VideoEditTask:
    """Represents a video editing task."""

    video_path: str
    task_type: str  # 'remove_fillers', 'add_subtitles', 'color_grade', 'audio_fade'
    description: str
    parameters: dict[str, Any] | None = None


class VideoProcessor:
    """Video processor using Claude Haiku for intelligent editing decisions."""

    def __init__(self, api_key: str | None = None):
        """Initialize the video processor with Anthropic client."""
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-haiku-4-5-20251001"

    def analyze_video(self, transcript: str) -> dict[str, Any]:
        """
        Analyze video transcript to identify editing opportunities.

        Uses Haiku (fast, cheap) to identify:
        - Filler words and pauses
        - Dead space segments
        - Potential color grading zones
        """
        message = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": f"""Analyze this video transcript for editing opportunities.

Identify:
1. Filler words (um, uh, like, you know)
2. Long pauses (>2 seconds)
3. False starts and stutters
4. Sections suitable for color grading (intro, main content, outro)

Return JSON with structure:
{{
  "fillers": [
    {{"time": "0:15", "word": "um", "duration": 0.5}}
  ],
  "pauses": [
    {{"time": "1:30", "duration": 3.0}}
  ],
  "segments": [
    {{"start": "0:00", "end": "0:10", "type": "intro"}}
  ]
}}

Transcript:
{transcript}""",
                }
            ],
        )

        try:
            response_text = message.content[0].text
            # Extract JSON from response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
        except (json.JSONDecodeError, IndexError):
            pass

        return {
            "fillers": [],
            "pauses": [],
            "segments": [],
            "raw_response": response_text,
        }

    def generate_edit_plan(self, task: VideoEditTask) -> str:
        """
        Generate an editing plan based on the task description.

        Uses Haiku for quick generation of editing instructions.
        """
        prompt = self._build_edit_prompt(task)

        message = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        return message.content[0].text

    def _build_edit_prompt(self, task: VideoEditTask) -> str:
        """Build the editing prompt based on task type."""
        base_prompt = f"""You are a professional video editor.
Video path: {task.video_path}
Task: {task.description}

Provide step-by-step editing instructions."""

        if task.task_type == "remove_fillers":
            return base_prompt + """

Focus on:
1. Identify all filler words (um, uh, like, etc.)
2. Remove pauses longer than 2 seconds
3. Keep natural speech flow
4. Ensure audio fades are smooth (30ms at cuts)

Output as a timeline of cuts."""

        elif task.task_type == "add_subtitles":
            return base_prompt + """

Subtitle guidelines:
1. Break into 2-word chunks
2. Use UPPERCASE for emphasis
3. Sync with speaker changes
4. Keep line length under 40 characters
5. Position: lower third of screen

Provide SRT-format output."""

        elif task.task_type == "color_grade":
            return base_prompt + """

Color grading styles:
1. Cinematic warm: +15% saturation, warm color cast
2. Neutral punch: slight contrast boost, balanced tones
3. Cool professional: slight blue cast, high contrast

Define grades per segment."""

        elif task.task_type == "audio_fade":
            return base_prompt + """

Audio processing:
1. Add 30ms fade-in before each segment
2. Add 30ms fade-out after each segment
3. Prevent audio clicks and pops
4. Maintain consistent loudness

Specify fade points."""

        return base_prompt

    def estimate_edit_time(self, video_duration_seconds: int) -> dict[str, Any]:
        """
        Estimate processing time for different edit types.

        Uses Haiku for quick estimation.
        """
        message = self.client.messages.create(
            model=self.model,
            max_tokens=512,
            messages=[
                {
                    "role": "user",
                    "content": f"""Estimate video editing processing times for a {video_duration_seconds}s video.

Return JSON:
{{
  "remove_fillers_minutes": <number>,
  "add_subtitles_minutes": <number>,
  "color_grade_minutes": <number>,
  "audio_fade_minutes": <number>,
  "total_minutes": <number>
}}

Consider: transcription, analysis, rendering time.""",
                }
            ],
        )

        try:
            response_text = message.content[0].text
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
        except (json.JSONDecodeError, IndexError):
            pass

        return {
            "remove_fillers_minutes": 2,
            "add_subtitles_minutes": 3,
            "color_grade_minutes": 2,
            "audio_fade_minutes": 1,
            "total_minutes": 8,
            "note": "Default estimates",
        }
