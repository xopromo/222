"""
Video editor using ffmpeg to apply edits based on Haiku analysis.

Transforms detected segments into actual video edits:
- Remove silence/long pauses
- Trim video based on speech detection
- Apply speed adjustments
- Create final edited video
"""

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import librosa
import numpy as np


@dataclass
class EditInstruction:
    """Instructions for editing a video segment."""
    start_time: float
    end_time: float
    action: str  # "keep", "remove", "speedup"
    reason: str


class VideoEditor:
    """Apply edits to video using ffmpeg."""

    def __init__(self):
        self.temp_dir = Path(tempfile.gettempdir())

    def create_edited_video(
        self,
        video_path: str,
        segments: list[dict[str, Any]],
        output_path: str | None = None,
        remove_silence: bool = True,
        min_pause_duration: float = 1.0,
    ) -> dict[str, Any]:
        """
        Create edited video by removing pauses and silence.

        Args:
            video_path: Path to original video
            segments: Speech segments from detection
            output_path: Where to save edited video
            remove_silence: Whether to remove silence between segments
            min_pause_duration: Minimum pause to remove (in seconds)
        """
        video_path = Path(video_path)
        if not video_path.exists():
            return {"error": f"Video not found: {video_path}"}

        if output_path is None:
            output_path = video_path.parent / f"{video_path.stem}_edited.mp4"
        else:
            output_path = Path(output_path)

        print(f"📝 Creating edited video from {len(segments)} segments...")

        # Build concat demuxer file
        concat_file = self._create_concat_file(video_path, segments, min_pause_duration)

        if not concat_file:
            return {"error": "Failed to create concat file"}

        # Run ffmpeg to concat
        print(f"   Applying edits with ffmpeg...")
        success = self._run_ffmpeg_concat(str(concat_file), str(output_path))

        # Cleanup
        Path(concat_file).unlink(missing_ok=True)

        if not success:
            return {"error": "ffmpeg failed to create edited video"}

        # Get stats
        original_duration = self._get_duration(str(video_path))
        edited_duration = self._get_duration(str(output_path))
        reduction = ((original_duration - edited_duration) / original_duration * 100) if original_duration > 0 else 0

        print(f"✅ Edited video created!")
        print(f"   Original: {original_duration:.1f}s → Edited: {edited_duration:.1f}s")
        print(f"   Reduction: {reduction:.1f}% ({original_duration - edited_duration:.1f}s removed)")

        return {
            "success": True,
            "output_path": str(output_path),
            "original_duration": original_duration,
            "edited_duration": edited_duration,
            "time_saved": original_duration - edited_duration,
            "reduction_percent": reduction,
        }

    def _create_concat_file(
        self,
        video_path: Path,
        segments: list[dict[str, Any]],
        min_pause_duration: float,
    ) -> str | None:
        """Create ffmpeg concat demuxer file."""
        try:
            concat_content = []

            for i, segment in enumerate(segments):
                start = segment["start"]
                end = segment["end"]

                # Add segment
                concat_content.append(f"file '{video_path}'")
                concat_content.append(f"inpoint {start}")
                concat_content.append(f"outpoint {end}")

                # Check if there's a pause after this segment (except last)
                if i < len(segments) - 1:
                    next_start = segments[i + 1]["start"]
                    pause_duration = next_start - end

                    if pause_duration >= min_pause_duration:
                        print(f"   Removing {pause_duration:.2f}s pause between segments")

            if not concat_content:
                return None

            # Write concat file
            concat_file = self.temp_dir / "concat.txt"
            with open(concat_file, "w") as f:
                f.write("\n".join(concat_content))

            return str(concat_file)
        except Exception as e:
            print(f"Error creating concat file: {e}")
            return None

    def _run_ffmpeg_concat(self, concat_file: str, output_path: str) -> bool:
        """Run ffmpeg with concat demuxer."""
        try:
            cmd = [
                "ffmpeg",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-y",  # Overwrite output
                output_path
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )

            return result.returncode == 0
        except Exception as e:
            print(f"Error running ffmpeg: {e}")
            return False

    def _get_duration(self, video_path: str) -> float:
        """Get video duration in seconds."""
        try:
            cmd = [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
                video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                return float(result.stdout.strip())
        except Exception:
            pass

        return 0.0

    def trim_video(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        output_path: str | None = None,
    ) -> dict[str, Any]:
        """
        Trim video to specified time range.

        Args:
            video_path: Input video
            start_time: Start time in seconds
            end_time: End time in seconds
            output_path: Where to save
        """
        video_path = Path(video_path)
        if not video_path.exists():
            return {"error": f"Video not found: {video_path}"}

        if output_path is None:
            output_path = video_path.parent / f"{video_path.stem}_trimmed.mp4"

        duration = end_time - start_time

        cmd = [
            "ffmpeg",
            "-i", str(video_path),
            "-ss", str(start_time),
            "-t", str(duration),
            "-c:v", "libx264",
            "-preset", "fast",
            "-c:a", "aac",
            "-y",
            str(output_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode == 0:
            return {
                "success": True,
                "output_path": str(output_path),
                "duration": duration,
            }
        else:
            return {"error": f"ffmpeg failed: {result.stderr}"}

    def add_subtitles(
        self,
        video_path: str,
        segments: list[dict[str, Any]],
        output_path: str | None = None,
    ) -> dict[str, Any]:
        """
        Add subtitle overlay to video based on segments.

        Creates a simple text overlay for each segment.
        """
        video_path = Path(video_path)
        if not video_path.exists():
            return {"error": f"Video not found: {video_path}"}

        if output_path is None:
            output_path = video_path.parent / f"{video_path.stem}_subtitled.mp4"

        # Create subtitle filter
        filters = []
        for i, segment in enumerate(segments):
            start = segment["start"]
            end = segment["end"]
            text = f"Segment {i + 1}"

            # drawtext filter for this segment
            filter_str = (
                f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:"
                f"text='{text}':"
                f"fontsize=24:fontcolor=white:"
                f"x=(w-text_w)/2:y=h-50:"
                f"enable='between(t\\,{start}\\,{end})'"
            )
            filters.append(filter_str)

        if not filters:
            return {"error": "No segments to add subtitles to"}

        filter_complex = ",".join(filters)

        cmd = [
            "ffmpeg",
            "-i", str(video_path),
            "-vf", filter_complex,
            "-c:a", "aac",
            "-y",
            str(output_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode == 0:
            return {
                "success": True,
                "output_path": str(output_path),
                "subtitles_added": len(segments),
            }
        else:
            return {"error": f"ffmpeg failed: {result.stderr}"}

    def speed_up_video(
        self,
        video_path: str,
        speed: float = 1.25,
        output_path: str | None = None,
    ) -> dict[str, Any]:
        """Speed up video by factor."""
        video_path = Path(video_path)
        if not video_path.exists():
            return {"error": f"Video not found: {video_path}"}

        if output_path is None:
            output_path = video_path.parent / f"{video_path.stem}_faster.mp4"

        # Use setpts for video, atempo for audio
        cmd = [
            "ffmpeg",
            "-i", str(video_path),
            "-filter:v", f"setpts=PTS/{speed}",
            "-filter:a", f"atempo={speed}",
            "-c:v", "libx264",
            "-preset", "fast",
            "-c:a", "aac",
            "-y",
            str(output_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode == 0:
            original_duration = self._get_duration(str(video_path))
            new_duration = original_duration / speed

            return {
                "success": True,
                "output_path": str(output_path),
                "speed_factor": speed,
                "original_duration": original_duration,
                "new_duration": new_duration,
                "time_saved": original_duration - new_duration,
            }
        else:
            return {"error": f"ffmpeg failed: {result.stderr}"}
