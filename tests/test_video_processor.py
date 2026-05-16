"""
Tests for video processor with Claude Haiku.

These tests demonstrate simple video editing use cases.
Each test can be easily removed if not needed.
"""

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from app.services.video_processor import VideoEditTask, VideoProcessor


class TestVideoProcessor:
    """Test suite for video processing with Haiku model."""

    @pytest.fixture
    def processor(self):
        """Create a VideoProcessor instance with mock API."""
        return VideoProcessor(api_key="test-key")

    def test_processor_initialization(self, processor):
        """Test that processor initializes with correct model."""
        assert processor.model == "claude-haiku-4-5-20251001"
        assert processor.client is not None

    def test_analyze_video_transcript(self, processor):
        """Test analyzing a video transcript for editing opportunities."""
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(
                text='{"fillers": [{"time": "0:15", "word": "um", "duration": 0.5}], '
                '"pauses": [{"time": "1:30", "duration": 3.0}], '
                '"segments": [{"start": "0:00", "end": "0:10", "type": "intro"}]}'
            )
        ]

        with patch.object(processor.client.messages, "create", return_value=mock_response):
            transcript = """
            Um, so today we're going to talk about video editing.
            [long pause]
            Uh, it's really important to remove fillers like, you know, um.
            """

            result = processor.analyze_video(transcript)

            assert "fillers" in result
            assert "pauses" in result
            assert "segments" in result

    def test_generate_edit_plan_remove_fillers(self, processor):
        """Test generating edit plan for filler removal."""
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(
                text="1. Remove 'um' at 0:15\n2. Remove 'uh' at 0:45\n3. Trim 3s pause at 1:30"
            )
        ]

        with patch.object(processor.client.messages, "create", return_value=mock_response):
            task = VideoEditTask(
                video_path="/videos/interview.mp4",
                task_type="remove_fillers",
                description="Remove all filler words and long pauses",
            )

            result = processor.generate_edit_plan(task)

            assert "Remove" in result

    def test_generate_edit_plan_add_subtitles(self, processor):
        """Test generating subtitle plan."""
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(
                text="""
00:00:00,000 --> 00:00:02,000
VIDEO EDITING

00:00:02,000 --> 00:00:05,000
IS IMPORTANT
        """
            )
        ]

        with patch.object(processor.client.messages, "create", return_value=mock_response):
            task = VideoEditTask(
                video_path="/videos/tutorial.mp4",
                task_type="add_subtitles",
                description="Add subtitles to video",
            )

            result = processor.generate_edit_plan(task)

            assert "EDITING" in result

    def test_generate_edit_plan_color_grade(self, processor):
        """Test generating color grading plan."""
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(
                text="Segment 1 (0:00-0:10): Cinematic warm\n"
                "Segment 2 (0:10-1:00): Neutral punch\n"
                "Segment 3 (1:00-1:30): Cool professional"
            )
        ]

        with patch.object(processor.client.messages, "create", return_value=mock_response):
            task = VideoEditTask(
                video_path="/videos/vlog.mp4",
                task_type="color_grade",
                description="Apply cinematic color grading",
            )

            result = processor.generate_edit_plan(task)

            assert "Cinematic" in result

    def test_estimate_edit_time(self, processor):
        """Test estimating video editing processing time."""
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(
                text='{"remove_fillers_minutes": 2, '
                '"add_subtitles_minutes": 3, '
                '"color_grade_minutes": 2, '
                '"audio_fade_minutes": 1, '
                '"total_minutes": 8}'
            )
        ]

        with patch.object(processor.client.messages, "create", return_value=mock_response):
            result = processor.estimate_edit_time(video_duration_seconds=1200)

            assert "remove_fillers_minutes" in result
            assert "total_minutes" in result
            assert result.get("total_minutes") == 8

    def test_estimate_edit_time_invalid_response(self, processor):
        """Test that invalid API response returns defaults."""
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Invalid JSON response")]

        with patch.object(processor.client.messages, "create", return_value=mock_response):
            result = processor.estimate_edit_time(video_duration_seconds=600)

            assert result["total_minutes"] == 8
            assert result["note"] == "Default estimates"

    def test_video_edit_task_parameters(self, processor):
        """Test that task parameters are passed correctly."""
        task = VideoEditTask(
            video_path="/videos/demo.mp4",
            task_type="remove_fillers",
            description="Clean up the audio",
            parameters={"min_pause_duration": 2.0, "filler_words": ["um", "uh", "like"]},
        )

        assert task.parameters["min_pause_duration"] == 2.0
        assert "um" in task.parameters["filler_words"]


@pytest.mark.integration
class TestVideoProcessorIntegration:
    """Integration tests that use actual Claude Haiku API."""

    @pytest.fixture
    def real_processor(self):
        """Create processor with real API (requires ANTHROPIC_API_KEY)."""
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            pytest.skip("ANTHROPIC_API_KEY not set")
        return VideoProcessor(api_key=api_key)

    def test_analyze_real_transcript(self, real_processor):
        """Test real API call to analyze transcript."""
        transcript = """
        Um, hello everyone. Today we're going to discuss, uh, video editing.
        [pause]
        Like, it's really, you know, important to remove fillers from your videos.
        Um, yeah, so let's get started.
        """

        result = real_processor.analyze_video(transcript)

        # Should have some structure even if empty
        assert isinstance(result, dict)

    def test_estimate_real_api(self, real_processor):
        """Test real API call for time estimation."""
        result = real_processor.estimate_edit_time(video_duration_seconds=600)

        assert isinstance(result, dict)
        assert "total_minutes" in result or "note" in result
