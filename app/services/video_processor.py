"""
Video editing service using Claude Haiku model.

Integrates with video-use project to perform AI-powered video editing tasks:
- Filler word removal
- Subtitle generation
- Color grading
- Audio fade processing
"""

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import anthropic
import librosa
import numpy as np


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

    def process_video_file(self, video_path: str, task_description: str = "Remove filler words and optimize pacing") -> dict[str, Any]:
        """
        Full pipeline: video file → analysis → edit plan.

        Steps:
        1. Extract video info
        2. Extract audio
        3. Detect silence/speech
        4. Analyze with Haiku
        5. Generate edit script
        """
        video_path = Path(video_path)
        if not video_path.exists():
            return {"error": f"Video file not found: {video_path}"}

        print(f"📹 Processing video: {video_path.name}")

        # Get video info
        info = self.get_video_info(str(video_path))
        print(f"   Duration: {info['duration']:.1f}s, FPS: {info['fps']}, Size: {info['resolution']}")

        # Extract audio
        audio_path = self._extract_audio(str(video_path))
        print(f"   Audio extracted to: {audio_path}")

        # Detect speech/silence
        segments = self._detect_speech_segments(audio_path)
        print(f"   Found {len(segments)} speech segments")

        # Build transcript-like description
        transcript_description = self._build_transcript_from_segments(segments)

        # Analyze with Haiku
        analysis = self.analyze_video(transcript_description)
        print(f"   Analysis complete: {len(analysis.get('fillers', []))} fillers, {len(analysis.get('pauses', []))} pauses")

        # Generate edit plan
        task = VideoEditTask(
            video_path=str(video_path),
            task_type="remove_fillers",
            description=task_description,
            parameters={"analysis": analysis}
        )
        edit_plan = self.generate_edit_plan(task)

        # Cleanup
        Path(audio_path).unlink(missing_ok=True)

        return {
            "success": True,
            "video": {
                "path": str(video_path),
                "duration": info["duration"],
                "fps": info["fps"],
                "resolution": info["resolution"],
            },
            "analysis": analysis,
            "segments": segments,
            "edit_plan": edit_plan,
            "ready_for_editing": True,
        }

    def get_video_info(self, video_path: str) -> dict[str, Any]:
        """Get video information: duration, fps, resolution."""
        try:
            cmd = [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration,size,bit_rate:stream=width,height,r_frame_rate",
                "-of", "json",
                video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode != 0:
                return {"error": f"ffprobe failed: {result.stderr}"}

            data = json.loads(result.stdout)
            fmt = data.get("format", {})
            stream = data.get("streams", [{}])[0]

            duration = float(fmt.get("duration", 0))
            width = stream.get("width", 0)
            height = stream.get("height", 0)
            fps_str = stream.get("r_frame_rate", "30/1")
            fps_parts = fps_str.split("/")
            fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 30.0

            return {
                "duration": duration,
                "fps": fps,
                "resolution": (width, height),
                "format": Path(video_path).suffix,
            }
        except Exception as e:
            return {"error": str(e)}

    def _extract_audio(self, video_path: str) -> str:
        """Extract audio from video file using ffmpeg."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            audio_path = tmp.name

        try:
            cmd = [
                "ffmpeg",
                "-i", video_path,
                "-q:a", "9",
                "-n",  # Don't overwrite
                audio_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

            if result.returncode == 0:
                return audio_path
            else:
                print(f"Error extracting audio: {result.stderr}")
                return ""
        except Exception as e:
            print(f"Error extracting audio: {e}")
            return ""

    def _detect_speech_segments(self, audio_path: str) -> list[dict[str, Any]]:
        """Detect speech vs silence segments using librosa."""
        try:
            y, sr = librosa.load(audio_path, sr=None)

            # Detect energy levels
            S = librosa.feature.melspectrogram(y=y, sr=sr)
            S_db = librosa.power_to_db(S, ref=np.max)
            energy = np.mean(S_db, axis=0)

            # Threshold for silence
            threshold = np.median(energy) - 10
            is_speech = energy > threshold

            # Find segments
            segments = []
            segment_start = None

            for i, is_speaking in enumerate(is_speech):
                time = librosa.frames_to_time(i, sr=sr)

                if is_speaking and segment_start is None:
                    segment_start = time
                elif not is_speaking and segment_start is not None:
                    segments.append({
                        "start": round(segment_start, 2),
                        "end": round(time, 2),
                        "duration": round(time - segment_start, 2),
                        "type": "speech"
                    })
                    segment_start = None

            # Handle last segment
            if segment_start is not None:
                end_time = len(y) / sr
                segments.append({
                    "start": round(segment_start, 2),
                    "end": round(end_time, 2),
                    "duration": round(end_time - segment_start, 2),
                    "type": "speech"
                })

            return segments[:20]  # Limit to 20 segments for API
        except Exception as e:
            print(f"Error detecting speech: {e}")
            return []

    def _build_transcript_from_segments(self, segments: list[dict[str, Any]]) -> str:
        """Build a descriptive transcript from detected segments."""
        if not segments:
            return "No speech detected in video"

        description = f"Video with {len(segments)} speech segments:\n"
        for i, seg in enumerate(segments, 1):
            duration = seg["duration"]
            description += f"Segment {i}: {seg['start']:.1f}s - {seg['end']:.1f}s ({duration:.1f}s)\n"

        # Add pauses between segments
        description += "\nDetected pauses:\n"
        for i in range(len(segments) - 1):
            pause_start = segments[i]["end"]
            pause_end = segments[i + 1]["start"]
            pause_duration = pause_end - pause_start
            if pause_duration > 0.5:
                description += f"Pause at {pause_start:.1f}s (duration: {pause_duration:.1f}s)\n"

        return description

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
