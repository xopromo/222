#!/usr/bin/env python3
"""
Remix video scenes while keeping original audio.

Split video into scenes, rearrange video, keep audio unchanged.

Usage:
    python examples/remix_video_scenes.py <video_path> [mode]

Modes:
    reverse   - Play video in reverse order, keep audio forward
    shuffle   - Random scene order, keep audio forward
    first-last - Swap first and last scenes
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path
from random import shuffle as random_shuffle


def get_duration(video_path):
    """Get video duration in seconds."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
        str(video_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    try:
        return float(result.stdout.strip())
    except:
        return 0.0


def extract_video_and_audio(video_path, temp_dir):
    """Extract video (no audio) and audio (no video) separately."""
    temp_dir = Path(temp_dir)
    video_only = temp_dir / "video_only.mp4"
    audio_only = temp_dir / "audio_only.aac"

    print(f"   Extracting video (no audio)...")
    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-an",  # No audio
        "-y",
        str(video_only)
    ]
    subprocess.run(cmd, capture_output=True, timeout=300)

    print(f"   Extracting audio...")
    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-q:a", "9",
        "-vn",  # No video
        "-y",
        str(audio_only)
    ]
    subprocess.run(cmd, capture_output=True, timeout=300)

    return str(video_only), str(audio_only)


def split_into_scenes(video_path, num_scenes=6):
    """Split video into equal-length scenes."""
    duration = get_duration(video_path)
    scene_duration = duration / num_scenes

    print(f"   Splitting into {num_scenes} scenes ({scene_duration:.1f}s each)...")

    scenes = []
    for i in range(num_scenes):
        start = i * scene_duration
        end = (i + 1) * scene_duration if i < num_scenes - 1 else duration

        scenes.append({
            "index": i,
            "start": start,
            "end": end,
            "duration": end - start
        })

    return scenes, duration


def create_concat_file(temp_dir, video_path, scene_order):
    """Create ffmpeg concat demuxer file for video scenes."""
    temp_dir = Path(temp_dir)
    concat_file = temp_dir / "scenes_concat.txt"

    with open(concat_file, "w") as f:
        for scene_idx in scene_order:
            scene = scenes[scene_idx]
            f.write(f"file '{video_path}'\n")
            f.write(f"inpoint {scene['start']:.3f}\n")
            f.write(f"outpoint {scene['end']:.3f}\n")

    return str(concat_file)


def recombine_with_audio(video_path, audio_path, output_path):
    """Combine remixed video with original audio."""
    print(f"   Recombining video with original audio...")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python remix_video_scenes.py <video_path> [mode]")
        print("Modes: reverse, shuffle, first-last (default: reverse)")
        sys.exit(1)

    video_path = Path(sys.argv[1])
    mode = sys.argv[2] if len(sys.argv) > 2 else "reverse"

    if not video_path.exists():
        print(f"❌ Video not found: {video_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎬 VIDEO SCENE REMIX (AUDIO UNCHANGED)")
    print("=" * 70)

    print(f"\n📊 ANALYZING VIDEO")
    print("-" * 70)
    print(f"   File: {video_path.name}")
    duration = get_duration(str(video_path))
    print(f"   Duration: {duration:.1f} seconds")

    # Create temp directory
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        # Step 1: Extract video and audio separately
        print(f"\n✂️  STEP 1: EXTRACT VIDEO & AUDIO")
        print("-" * 70)

        video_only, audio_only = extract_video_and_audio(str(video_path), temp_dir)

        # Step 2: Split video into scenes
        print(f"\n🎞️  STEP 2: SPLIT INTO SCENES")
        print("-" * 70)

        global scenes
        scenes, _ = split_into_scenes(video_only, num_scenes=6)

        for scene in scenes:
            print(f"   Scene {scene['index'] + 1}: {scene['start']:.1f}s - {scene['end']:.1f}s ({scene['duration']:.1f}s)")

        # Step 3: Determine scene order
        print(f"\n🔀 STEP 3: REORDER SCENES")
        print("-" * 70)

        scene_order = list(range(len(scenes)))

        if mode == "reverse":
            print(f"   Mode: REVERSE")
            scene_order.reverse()
        elif mode == "shuffle":
            print(f"   Mode: SHUFFLE (random)")
            random_shuffle(scene_order)
        elif mode == "first-last":
            print(f"   Mode: SWAP FIRST & LAST")
            scene_order[0], scene_order[-1] = scene_order[-1], scene_order[0]
        else:
            print(f"   Mode: {mode} (unknown, using reverse)")
            scene_order.reverse()

        print(f"   New order: {[i + 1 for i in scene_order]}")

        # Step 4: Create concat file for video
        print(f"\n📝 STEP 4: CREATE CONCAT FILE")
        print("-" * 70)

        concat_file = create_concat_file(temp_dir, video_only, scene_order)
        print(f"   Concat file created")

        # Step 5: Concat video scenes
        print(f"\n🎞️  STEP 5: CONCAT VIDEO SCENES")
        print("-" * 70)

        remixed_video = temp_dir / "remixed_video.mp4"
        print(f"   Running ffmpeg concat...")

        cmd = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-an",
            "-y",
            str(remixed_video)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            print(f"❌ Failed to concat video")
            sys.exit(1)

        print(f"   ✅ Video scenes concatenated")

        # Step 6: Combine with original audio
        print(f"\n🔊 STEP 6: ADD ORIGINAL AUDIO")
        print("-" * 70)

        output_path = video_path.parent / f"{video_path.stem}_remixed_{mode}.mp4"

        if recombine_with_audio(str(remixed_video), audio_only, str(output_path)):
            print(f"   ✅ Audio added")
        else:
            print(f"   ❌ Failed to add audio")
            sys.exit(1)

        # Results
        print(f"\n" + "=" * 70)
        print(f"✨ REMIX COMPLETE!")
        print("=" * 70)

        output_size = output_path.stat().st_size / (1024 * 1024)
        print(f"\n📁 OUTPUT FILE")
        print(f"   Path: {output_path}")
        print(f"   Size: {output_size:.1f} MB")
        print(f"   Mode: {mode}")
        print(f"\n💡 Result:")
        print(f"   ✅ Video scenes reordered ({mode})")
        print(f"   ✅ Audio remains ORIGINAL")
        print(f"   ✅ Audio & video may not sync (intentional!)")

        print(f"\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
