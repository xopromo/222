#!/usr/bin/env python3
"""
Complete video editing pipeline:
1. Analyze video with Claude Haiku
2. Detect speech segments
3. Generate edit plan
4. Apply edits with ffmpeg
5. Save edited video

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python examples/edit_video.py /path/to/video.mp4
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.video_processor import VideoProcessor
from app.services.video_editor import VideoEditor


def main():
    if len(sys.argv) < 2:
        print("Usage: python edit_video.py <video_path>")
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY not set")
        print("Set it with: export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    video_path = sys.argv[1]
    video_path = Path(video_path)

    if not video_path.exists():
        print(f"❌ Video not found: {video_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎬 COMPLETE VIDEO EDITING PIPELINE")
    print("=" * 70)

    # Step 1: Analyze video
    print("\n📊 STEP 1: ANALYZE VIDEO WITH HAIKU")
    print("-" * 70)

    processor = VideoProcessor(api_key=api_key)
    analysis_result = processor.process_video_file(
        str(video_path),
        task_description="Optimize video by removing silence and pauses"
    )

    if "error" in analysis_result:
        print(f"❌ Error: {analysis_result['error']}")
        sys.exit(1)

    print("✅ Analysis complete!")

    video_info = analysis_result["video"]
    segments = analysis_result["segments"]

    print(f"\n   Video Duration: {video_info['duration']:.1f} seconds")
    print(f"   Speech Segments: {len(segments)}")

    total_speech_time = sum(s["duration"] for s in segments)
    total_silence_time = video_info["duration"] - total_speech_time

    print(f"   Total Speech: {total_speech_time:.1f}s")
    print(f"   Total Silence: {total_silence_time:.1f}s ({total_silence_time/video_info['duration']*100:.1f}%)")

    if segments:
        print(f"\n   Speech Segments:")
        for i, seg in enumerate(segments[:5], 1):
            print(f"      {i}. {seg['start']:.1f}s - {seg['end']:.1f}s ({seg['duration']:.1f}s)")
        if len(segments) > 5:
            print(f"      ... and {len(segments) - 5} more")

    # Step 2: Edit video
    print("\n\n✂️  STEP 2: EDIT VIDEO (REMOVE SILENCE)")
    print("-" * 70)

    editor = VideoEditor()
    output_path = video_path.parent / f"{video_path.stem}_edited.mp4"

    edit_result = editor.create_edited_video(
        str(video_path),
        segments,
        output_path=str(output_path),
        remove_silence=True,
        min_pause_duration=0.8
    )

    if "error" in edit_result:
        print(f"❌ Error: {edit_result['error']}")
        sys.exit(1)

    print("✅ Video edited successfully!")

    # Step 3: Show results
    print("\n\n📈 STEP 3: RESULTS")
    print("-" * 70)

    original_duration = edit_result["original_duration"]
    edited_duration = edit_result["edited_duration"]
    time_saved = edit_result["time_saved"]
    reduction = edit_result["reduction_percent"]

    print(f"\n   Original Duration: {original_duration:.1f}s")
    print(f"   Edited Duration:   {edited_duration:.1f}s")
    print(f"   Time Removed:      {time_saved:.1f}s")
    print(f"   Reduction:         {reduction:.1f}%")

    print(f"\n   Output file: {output_path}")
    print(f"   File size: {output_path.stat().st_size / (1024*1024):.1f} MB")

    # Step 4: Create comparison
    print("\n\n✨ STEP 4: CREATE VARIATIONS")
    print("-" * 70)

    # Option 1: Speed up version
    print("\n   1️⃣  Creating speed-up version (1.25x)...")
    speed_result = editor.speed_up_video(
        str(output_path),
        speed=1.25,
        output_path=str(video_path.parent / f"{video_path.stem}_edited_fast.mp4")
    )

    if speed_result.get("success"):
        print(f"      ✅ Duration: {speed_result['new_duration']:.1f}s (saved {speed_result['time_saved']:.1f}s more)")

    # Option 2: Trimmed version (first 10 seconds)
    if edited_duration > 10:
        print("\n   2️⃣  Creating trimmed version (first 10 seconds)...")
        trim_result = editor.trim_video(
            str(output_path),
            start_time=0,
            end_time=10,
            output_path=str(video_path.parent / f"{video_path.stem}_preview.mp4")
        )

        if trim_result.get("success"):
            print(f"      ✅ Preview created: {trim_result['output_path']}")

    # Step 5: Summary
    print("\n\n" + "=" * 70)
    print("🎉 EDITING COMPLETE!")
    print("=" * 70)

    print(f"\n📁 Generated Files:")
    print(f"   1. Edited (silence removed)")
    print(f"      → {output_path}")
    print(f"      → {edited_duration:.1f}s ({reduction:.1f}% shorter)")

    if speed_result.get("success"):
        print(f"   2. Speed-up version (1.25x)")
        print(f"      → {video_path.parent / f'{video_path.stem}_edited_fast.mp4'}")
        print(f"      → {speed_result['new_duration']:.1f}s")

    if edited_duration > 10 and trim_result.get("success"):
        print(f"   3. Preview (10 seconds)")
        print(f"      → {video_path.parent / f'{video_path.stem}_preview.mp4'}")

    print("\n💡 Next steps:")
    print("   • Download and watch the edited video")
    print("   • Compare with original to see improvements")
    print("   • Further editing possible with video-use")

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
