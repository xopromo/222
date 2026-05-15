#!/usr/bin/env python3
"""
Compress video to fit within 30MB limit for web upload.

Usage:
    python examples/compress_for_upload.py /path/to/video.mp4
"""

import subprocess
import sys
from pathlib import Path


def get_file_size_mb(path):
    """Get file size in MB."""
    return path.stat().st_size / (1024 * 1024)


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


def compress_video(input_path, output_path, target_size_mb=28):
    """
    Compress video to fit within target size.

    Uses bitrate calculation to achieve target file size.
    """
    input_path = Path(input_path)
    output_path = Path(output_path)

    original_size = get_file_size_mb(input_path)
    duration = get_duration(str(input_path))

    if duration == 0:
        print("❌ Could not determine video duration")
        return False

    print(f"\n📊 COMPRESSION INFO")
    print("-" * 60)
    print(f"   Original: {original_size:.1f} MB")
    print(f"   Duration: {duration:.1f}s")
    print(f"   Target: {target_size_mb} MB")

    # Calculate bitrate for target size
    # target_size_mb * 8 * 1000 / duration = bitrate in kbps
    # Reserve 1MB for audio
    video_size_mb = target_size_mb - 1
    video_bitrate_kbps = int(video_size_mb * 8 * 1000 / duration)
    audio_bitrate = "64k"  # Low quality audio

    print(f"   Target bitrate: {video_bitrate_kbps} kbps")

    # Run ffmpeg
    print(f"\n🎬 COMPRESSING...")
    print("-" * 60)

    cmd = [
        "ffmpeg",
        "-i", str(input_path),
        "-c:v", "libx264",
        "-preset", "slow",  # Slower = better compression
        "-b:v", f"{video_bitrate_kbps}k",
        "-crf", "28",  # Higher CRF = more compression
        "-c:a", "aac",
        "-b:a", audio_bitrate,
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode == 0 and output_path.exists():
        compressed_size = get_file_size_mb(output_path)
        reduction = ((original_size - compressed_size) / original_size) * 100

        print(f"✅ COMPRESSION COMPLETE")
        print("-" * 60)
        print(f"   Original: {original_size:.1f} MB")
        print(f"   Compressed: {compressed_size:.1f} MB")
        print(f"   Reduction: {reduction:.1f}%")
        print(f"   Fits 30MB limit: {'✅ YES' if compressed_size < 30 else '❌ NO'}")
        print(f"\n   Ready to upload! 📤")
        print(f"   Path: {output_path}")

        return True
    else:
        print(f"❌ Compression failed")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python compress_for_upload.py <video_path> [target_size_mb]")
        print("Example: python compress_for_upload.py video.mp4 28")
        sys.exit(1)

    input_path = sys.argv[1]
    target_size = int(sys.argv[2]) if len(sys.argv) > 2 else 28

    input_path = Path(input_path)
    if not input_path.exists():
        print(f"❌ File not found: {input_path}")
        sys.exit(1)

    output_path = input_path.parent / f"{input_path.stem}_compressed.mp4"

    print("\n" + "=" * 60)
    print("🎥 VIDEO COMPRESSION FOR WEB UPLOAD (30MB limit)")
    print("=" * 60)

    success = compress_video(str(input_path), str(output_path), target_size)

    if success:
        print("\n" + "=" * 60)
        print("✨ Ready to upload to Claude Code web!")
        print("=" * 60 + "\n")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
