#!/usr/bin/env python3
"""
Complete video editing pipeline (NO API NEEDED!):
1. Detect speech segments locally with librosa
2. Remove silence/pauses
3. Apply edits with ffmpeg
4. Save edited video

Usage:
    python examples/edit_video_free.py /path/to/video.mp4
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.video_processor import VideoProcessor
from app.services.video_editor import VideoEditor


def main():
    if len(sys.argv) < 2:
        print("Usage: python edit_video_free.py <video_path>")
        sys.exit(1)

    video_path = Path(sys.argv[1])

    if not video_path.exists():
        print(f"❌ Video not found: {video_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎬 VIDEO EDITING (NO API KEY NEEDED!)")
    print("=" * 70)

    # Step 1: Detect speech segments (local, free)
    print("\n📊 STEP 1: DETECT SPEECH SEGMENTS")
    print("-" * 70)

    processor = VideoProcessor()  # No API key needed

    print(f"   Analyzing: {video_path.name}")
    info = processor.get_video_info(str(video_path))
    print(f"   Duration: {info['duration']:.1f}s, FPS: {info['fps']}, Size: {info['resolution']}")

    # Extract audio
    audio_path = processor._extract_audio(str(video_path))
    if not audio_path:
        print("❌ Failed to extract audio")
        sys.exit(1)
    print(f"   Audio extracted")

    # Detect speech
    print(f"   Detecting speech segments...")
    segments = processor._detect_speech_segments(audio_path)

    print(f"✅ Detection complete!")

    if not segments:
        print("   ❌ No speech segments detected")
        Path(audio_path).unlink(missing_ok=True)
        sys.exit(1)

    print(f"   Found {len(segments)} speech segments")

    total_speech = sum(s["duration"] for s in segments)
    total_silence = info["duration"] - total_speech

    print(f"\n   📈 Statistics:")
    print(f"      Total Duration: {info['duration']:.1f}s")
    print(f"      Speech Time:    {total_speech:.1f}s ({total_speech/info['duration']*100:.1f}%)")
    print(f"      Silence Time:   {total_silence:.1f}s ({total_silence/info['duration']*100:.1f}%)")

    print(f"\n   🔊 Speech Segments:")
    for i, seg in enumerate(segments[:10], 1):
        print(f"      {i:2d}. {seg['start']:6.2f}s - {seg['end']:6.2f}s ({seg['duration']:5.2f}s)")
    if len(segments) > 10:
        print(f"      ... and {len(segments) - 10} more segments")

    # Step 2: Edit video
    print("\n\n✂️  STEP 2: CREATE EDITED VIDEO")
    print("-" * 70)

    editor = VideoEditor()
    output_path = video_path.parent / f"{video_path.stem}_edited.mp4"

    print(f"   Creating edited video...")
    print(f"   Removing pauses longer than 0.8 seconds...")

    edit_result = editor.create_edited_video(
        str(video_path),
        segments,
        output_path=str(output_path),
        remove_silence=True,
        min_pause_duration=0.8
    )

    Path(audio_path).unlink(missing_ok=True)  # Cleanup audio

    if "error" in edit_result:
        print(f"❌ Error: {edit_result['error']}")
        sys.exit(1)

    print("✅ Editing complete!")

    # Step 3: Show results
    print("\n\n📊 STEP 3: RESULTS & COMPARISON")
    print("-" * 70)

    original_dur = edit_result["original_duration"]
    edited_dur = edit_result["edited_duration"]
    saved = edit_result["time_saved"]
    percent = edit_result["reduction_percent"]

    print(f"\n   Original Video:  {original_dur:7.1f}s")
    print(f"   Edited Video:    {edited_dur:7.1f}s")
    print(f"   Time Removed:    {saved:7.1f}s")
    print(f"   Reduction:       {percent:7.1f}%")

    # File info
    original_size = video_path.stat().st_size / (1024 * 1024)
    edited_size = Path(output_path).stat().st_size / (1024 * 1024)

    print(f"\n   Original Size:   {original_size:7.1f} MB")
    print(f"   Edited Size:     {edited_size:7.1f} MB")
    print(f"   Size Reduction:  {(1 - edited_size/original_size)*100:7.1f}%")

    # Step 4: Create variations
    print("\n\n✨ STEP 4: CREATE VARIATIONS")
    print("-" * 70)

    variations = []

    # Speed up
    print("\n   1️⃣  Speed-up version (1.25x)...")
    speed_path = video_path.parent / f"{video_path.stem}_edited_1.25x.mp4"
    speed_result = editor.speed_up_video(
        str(output_path),
        speed=1.25,
        output_path=str(speed_path)
    )

    if speed_result.get("success"):
        print(f"      ✅ {speed_result['new_duration']:.1f}s (saved {speed_result['time_saved']:.1f}s more)")
        variations.append(("1.25x Speed", str(speed_path), speed_result['new_duration']))
    else:
        speed_path.unlink(missing_ok=True)

    # Trim to first 8 seconds (preview)
    if edited_dur > 8:
        print("\n   2️⃣  Preview version (first 8 seconds)...")
        preview_path = video_path.parent / f"{video_path.stem}_preview_8s.mp4"
        trim_result = editor.trim_video(
            str(output_path),
            start_time=0,
            end_time=8,
            output_path=str(preview_path)
        )

        if trim_result.get("success"):
            print(f"      ✅ Created")
            variations.append(("8s Preview", str(preview_path), 8.0))
        else:
            preview_path.unlink(missing_ok=True)

    # Step 5: Summary
    print("\n\n" + "=" * 70)
    print("🎉 VIDEO EDITING COMPLETE!")
    print("=" * 70)

    print(f"\n📁 GENERATED FILES:")
    print(f"\n   📹 Main Edited Video")
    print(f"      Path: {output_path}")
    print(f"      Duration: {edited_dur:.1f}s")
    print(f"      Size: {edited_size:.1f} MB")
    print(f"      Improvement: {percent:.1f}% shorter, removed {saved:.1f}s of silence")

    if variations:
        print(f"\n   📹 Variations:")
        for i, (name, path, duration) in enumerate(variations, 1):
            size = Path(path).stat().st_size / (1024 * 1024)
            print(f"      {i}. {name:20} → {duration:6.1f}s, {size:6.1f}MB")

    print(f"\n💡 Next steps:")
    print(f"   1. Download and watch the edited videos")
    print(f"   2. Compare with original to see quality")
    print(f"   3. Use the fastest version (1.25x) for more impact")

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
