#!/usr/bin/env python3
"""
Process a video file with Claude Haiku.

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python examples/process_video.py /path/to/video.mp4

This will:
1. Extract video info
2. Detect speech segments
3. Analyze with Claude Haiku
4. Generate edit plan
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.video_processor import VideoProcessor


def main():
    if len(sys.argv) < 2:
        print("Usage: python process_video.py <video_path>")
        print("Example: python process_video.py /root/.claude/uploads/video.mp4")
        print("\nMake sure to set ANTHROPIC_API_KEY first:")
        print("  export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY not set")
        print("\nSet it with:")
        print("  export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    video_path = sys.argv[1]

    print("\n🎬 VIDEO PROCESSING WITH CLAUDE HAIKU")
    print("=" * 60)

    processor = VideoProcessor(api_key=api_key)
    result = processor.process_video_file(
        video_path,
        task_description="Remove filler words, optimize pacing, add subtitles"
    )

    if "error" in result:
        print(f"\n❌ Error: {result['error']}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("✅ PROCESSING COMPLETE")
    print("=" * 60)

    if result.get("success"):
        video_info = result["video"]
        print(f"\n📹 Video Info:")
        print(f"   Duration: {video_info['duration']:.1f} seconds")
        print(f"   FPS: {video_info['fps']}")
        print(f"   Resolution: {video_info['resolution']}")

        analysis = result["analysis"]
        print(f"\n🔍 Analysis:")
        if analysis.get("fillers"):
            print(f"   Fillers found: {len(analysis['fillers'])}")
            for f in analysis["fillers"][:3]:
                print(f"     - {f}")
        if analysis.get("pauses"):
            print(f"   Long pauses: {len(analysis['pauses'])}")
            for p in analysis["pauses"][:3]:
                print(f"     - {p}")

        segments = result.get("segments", [])
        print(f"\n📊 Speech Segments: {len(segments)} found")
        for i, seg in enumerate(segments[:5], 1):
            print(f"   {i}. {seg['start']:.1f}s - {seg['end']:.1f}s ({seg['duration']:.1f}s)")
        if len(segments) > 5:
            print(f"   ... and {len(segments) - 5} more")

        print(f"\n✏️  EDIT PLAN:")
        print("-" * 60)
        plan = result["edit_plan"]
        if isinstance(plan, str):
            # Limit to first 1000 chars
            print(plan[:1000])
            if len(plan) > 1000:
                print(f"\n... (truncated, total {len(plan)} chars)")
        print("-" * 60)

        print(f"\n✨ Ready for editing! Use this plan with video-use to:")
        print("   - Remove detected filler words")
        print("   - Trim long pauses")
        print("   - Add subtitles")
        print("   - Apply color grading")


if __name__ == "__main__":
    main()
