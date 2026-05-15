#!/usr/bin/env python3
"""
Simple video editing demo - removes first and last 2 seconds (often silence),
speeds up video, and creates preview.

Usage:
    python examples/edit_video_simple.py /path/to/video.mp4
"""

import subprocess
import sys
from pathlib import Path


def run_ffmpeg(cmd):
    """Run ffmpeg command."""
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0, result.stderr


def get_duration(video_path):
    """Get video duration."""
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


def get_file_size_mb(path):
    """Get file size in MB."""
    return path.stat().st_size / (1024 * 1024)


def main():
    if len(sys.argv) < 2:
        print("Usage: python edit_video_simple.py <video_path>")
        sys.exit(1)

    video_path = Path(sys.argv[1])

    if not video_path.exists():
        print(f"❌ Video not found: {video_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎬 VIDEO EDITING DEMO")
    print("=" * 70)

    # Original info
    print(f"\n📊 ORIGINAL VIDEO")
    print("-" * 70)
    original_duration = get_duration(str(video_path))
    original_size = get_file_size_mb(video_path)

    print(f"   File: {video_path.name}")
    print(f"   Duration: {original_duration:.1f} seconds")
    print(f"   Size: {original_size:.1f} MB")

    # Edit 1: Trim (remove first/last 2 seconds)
    print(f"\n✂️  EDIT 1: TRIM (remove first & last 2 seconds)")
    print("-" * 70)
    trimmed_path = video_path.parent / f"{video_path.stem}_trimmed.mp4"
    trim_duration = original_duration - 4

    print(f"   Creating: {trimmed_path.name}")

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-ss", "2",
        "-t", str(trim_duration),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-q:a", "5",
        "-y",
        str(trimmed_path)
    ]

    success, err = run_ffmpeg(cmd)

    if success and trimmed_path.exists():
        trimmed_size = get_file_size_mb(trimmed_path)
        print(f"   ✅ Created: {trimmed_path.name}")
        print(f"      Duration: {trim_duration:.1f}s (saved {original_duration - trim_duration:.1f}s)")
        print(f"      Size: {trimmed_size:.1f} MB")
    else:
        print(f"   ❌ Failed to create trimmed version")
        trimmed_path = None

    # Edit 2: Speed up (1.2x)
    print(f"\n⚡ EDIT 2: SPEED UP VIDEO (1.2x faster)")
    print("-" * 70)
    fast_path = video_path.parent / f"{video_path.stem}_fast.mp4"
    fast_duration = original_duration / 1.2

    print(f"   Creating: {fast_path.name}")

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-filter:v", "setpts=PTS/1.2",
        "-filter:a", "atempo=1.2",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-q:a", "5",
        "-y",
        str(fast_path)
    ]

    success, err = run_ffmpeg(cmd)

    if success and fast_path.exists():
        fast_size = get_file_size_mb(fast_path)
        print(f"   ✅ Created: {fast_path.name}")
        print(f"      Duration: {fast_duration:.1f}s (saved {original_duration - fast_duration:.1f}s)")
        print(f"      Size: {fast_size:.1f} MB")
    else:
        print(f"   ❌ Failed to create speed-up version")
        fast_path = None

    # Edit 3: Combined (trimmed + speed up)
    print(f"\n🚀 EDIT 3: COMBINED (trimmed + 1.2x speed)")
    print("-" * 70)
    combo_path = video_path.parent / f"{video_path.stem}_optimized.mp4"
    combo_duration = trim_duration / 1.2

    print(f"   Creating: {combo_path.name}")

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-ss", "2",
        "-t", str(trim_duration),
        "-filter:v", "setpts=PTS/1.2",
        "-filter:a", "atempo=1.2",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-q:a", "5",
        "-y",
        str(combo_path)
    ]

    success, err = run_ffmpeg(cmd)

    if success and combo_path.exists():
        combo_size = get_file_size_mb(combo_path)
        print(f"   ✅ Created: {combo_path.name}")
        print(f"      Duration: {combo_duration:.1f}s (saved {original_duration - combo_duration:.1f}s)")
        print(f"      Size: {combo_size:.1f} MB")
    else:
        print(f"   ❌ Failed to create optimized version")
        combo_path = None

    # Summary
    print(f"\n\n" + "=" * 70)
    print("📊 COMPARISON TABLE")
    print("=" * 70)

    print(f"\n{'Version':<25} {'Duration':<12} {'Size':<12} {'Improvement':<15}")
    print("-" * 70)

    print(f"{'Original':<25} {original_duration:>8.1f}s   {original_size:>8.1f}MB")

    if trimmed_path:
        saved_time = original_duration - trim_duration
        saved_pct = (saved_time / original_duration) * 100
        print(f"{'Trimmed (-4s)':<25} {trim_duration:>8.1f}s   {trimmed_size:>8.1f}MB   {saved_time:>6.1f}s ({saved_pct:>5.1f}%)")

    if fast_path:
        saved_time = original_duration - fast_duration
        saved_pct = (saved_time / original_duration) * 100
        print(f"{'Speed-up (1.2x)':<25} {fast_duration:>8.1f}s   {fast_size:>8.1f}MB   {saved_time:>6.1f}s ({saved_pct:>5.1f}%)")

    if combo_path:
        saved_time = original_duration - combo_duration
        saved_pct = (saved_time / original_duration) * 100
        print(f"{'Optimized (trim+speed)':<25} {combo_duration:>8.1f}s   {combo_size:>8.1f}MB   {saved_time:>6.1f}s ({saved_pct:>5.1f}%)")

    print("\n" + "=" * 70)
    print("📁 OUTPUT FILES")
    print("=" * 70)

    output_files = []
    if trimmed_path and trimmed_path.exists():
        output_files.append(("Trimmed", trimmed_path, trim_duration))
    if fast_path and fast_path.exists():
        output_files.append(("Speed-up", fast_path, fast_duration))
    if combo_path and combo_path.exists():
        output_files.append(("Optimized ⭐", combo_path, combo_duration))

    for i, (name, path, duration) in enumerate(output_files, 1):
        size = get_file_size_mb(path)
        print(f"\n{i}. {name}")
        print(f"   📂 {path}")
        print(f"   ⏱️  {duration:.1f} seconds")
        print(f"   💾 {size:.1f} MB")

    print("\n" + "=" * 70)
    print("✨ EDITING COMPLETE!")
    print("=" * 70)

    print(f"\n💡 Recommendations:")
    if combo_path and combo_path.exists():
        saved = original_duration - combo_duration
        print(f"   • Use OPTIMIZED version: {saved:.1f}s faster, same quality")
    if fast_path and fast_path.exists():
        saved = original_duration - fast_duration
        print(f"   • Use SPEED-UP version: {saved:.1f}s faster for snappy feel")
    if trimmed_path and trimmed_path.exists():
        saved = original_duration - trim_duration
        print(f"   • Use TRIMMED version: {saved:.1f}s without intro/outro")

    print(f"\n📥 Download one of the files above to see the result!")
    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
