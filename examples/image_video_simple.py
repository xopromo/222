#!/usr/bin/env python3
"""
Simple image to video with music styles.

Usage:
    python image_video_simple.py <image_path> [duration] [style]

Styles: upbeat, cinematic, uplifting
"""

import subprocess
import sys
import tempfile
from pathlib import Path


def create_video_with_music(image_path, duration, style, output_path):
    """Create video from image with music."""
    print(f"   Creating {style} video...")

    # Select music based on style
    if style == "upbeat":
        filter_audio = "sine=frequency=440:duration={}".format(duration)
    elif style == "cinematic":
        filter_audio = "sine=frequency=110:duration={}".format(duration)
    else:  # uplifting
        filter_audio = "sine=frequency=330:duration={}".format(duration)

    cmd = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-f", "lavfi",
        "-i", filter_audio,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        "-t", str(duration),
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python image_video_simple.py <image_path> [duration] [style]")
        sys.exit(1)

    image_path = Path(sys.argv[1])
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    style = sys.argv[3] if len(sys.argv) > 3 else "cinematic"

    if not image_path.exists():
        print(f"❌ Image not found: {image_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print(f"🎬 IMAGE TO VIDEO - {style.upper()} MUSIC")
    print("=" * 70)

    output_dir = image_path.parent / "videos"
    output_dir.mkdir(exist_ok=True)

    output_path = output_dir / f"{image_path.stem}_{style}_{duration}s.mp4"

    print(f"\n📸 Input: {image_path.name}")
    print(f"   Duration: {duration}s")
    print(f"   Music: {style}")

    print(f"\n🎵 Creating video...")

    if create_video_with_music(str(image_path), duration, style, str(output_path)):
        size = output_path.stat().st_size / (1024 * 1024)
        print(f"\n✅ Video created!")
        print(f"   📂 {output_path}")
        print(f"   💾 {size:.1f} MB")
    else:
        print(f"\n❌ Failed")
        sys.exit(1)

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
