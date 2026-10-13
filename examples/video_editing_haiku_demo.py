#!/usr/bin/env python3
"""
Simple demo: Video editing with Claude Haiku.

Usage:
    python examples/video_editing_haiku_demo.py

This demonstrates:
1. Video transcript analysis
2. Edit plan generation
3. Processing time estimation

All done with Haiku model (fast & cheap).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.video_processor import VideoEditTask, VideoProcessor


def demo_analyze_transcript():
    """Demo 1: Analyze a video transcript for editing opportunities."""
    print("\n" + "=" * 60)
    print("DEMO 1: Analyze Video Transcript")
    print("=" * 60)

    processor = VideoProcessor()

    transcript = """
    Um, so today we're going to talk about video editing.
    It's, uh, really important to remove filler words from your content.
    You know, things like "um", "uh", "like", and "you know".
    [long pause for 3 seconds]
    Anyway, let me show you how to do this efficiently.
    """

    print("\nAnalyzing transcript...")
    print(f"Input: {transcript[:100]}...")

    result = processor.analyze_video(transcript)

    print("\nAnalysis result:")
    if "fillers" in result and result["fillers"]:
        print(f"  Found {len(result['fillers'])} filler words")
        for filler in result["fillers"][:3]:
            print(f"    - {filler}")

    if "pauses" in result and result["pauses"]:
        print(f"  Found {len(result['pauses'])} long pauses")

    if "segments" in result and result["segments"]:
        print(f"  Identified {len(result['segments'])} edit segments")

    return result


def demo_edit_plans():
    """Demo 2: Generate editing plans for different tasks."""
    print("\n" + "=" * 60)
    print("DEMO 2: Generate Edit Plans")
    print("=" * 60)

    processor = VideoProcessor()

    tasks = [
        VideoEditTask(
            video_path="/videos/interview.mp4",
            task_type="remove_fillers",
            description="Remove all filler words and optimize pacing",
        ),
        VideoEditTask(
            video_path="/videos/tutorial.mp4",
            task_type="add_subtitles",
            description="Add engaging subtitles for accessibility",
        ),
        VideoEditTask(
            video_path="/videos/vlog.mp4",
            task_type="color_grade",
            description="Apply cinematic color grading to match brand style",
        ),
    ]

    for task in tasks:
        print(f"\n📝 Task: {task.task_type.upper()}")
        print(f"   File: {task.video_path}")
        print(f"   Description: {task.description}")

        print("   Generating plan...")
        plan = processor.generate_edit_plan(task)

        # Show first 200 chars of plan
        preview = plan[:200].replace("\n", " ")
        print(f"   Plan: {preview}...")


def demo_time_estimation():
    """Demo 3: Estimate processing time."""
    print("\n" + "=" * 60)
    print("DEMO 3: Estimate Processing Time")
    print("=" * 60)

    processor = VideoProcessor()

    video_durations = [
        (300, "5-minute video"),
        (1200, "20-minute video"),
        (3600, "1-hour video"),
    ]

    for duration, label in video_durations:
        print(f"\n⏱️  {label} ({duration}s):")

        result = processor.estimate_edit_time(duration)

        for key, value in result.items():
            if "minutes" in key or "note" in key:
                display_key = key.replace("_minutes", "").replace("_", " ").title()
                print(f"   {display_key}: {value}")


def main():
    """Run all demos."""
    print("\n🎬 VIDEO EDITING WITH CLAUDE HAIKU 🎬")
    print("Using Haiku model for fast, cost-effective editing analysis")

    try:
        demo_analyze_transcript()
        demo_edit_plans()
        demo_time_estimation()

        print("\n" + "=" * 60)
        print("✅ All demos completed successfully!")
        print("=" * 60)
        print("\nKey takeaways:")
        print("  • Haiku model is perfect for video editing analysis")
        print("  • Quick turnaround for transcript analysis")
        print("  • Cost-effective for large-scale processing")
        print("  • Integrates seamlessly with video-use project")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nNote: Make sure ANTHROPIC_API_KEY is set")
        print("      pip install -r requirements.txt")


if __name__ == "__main__":
    main()
