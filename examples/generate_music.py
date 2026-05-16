#!/usr/bin/env python3
"""
Generate better background music with various styles.

Styles:
- upbeat: Energetic, motivating
- cinematic: Epic, dramatic
- ambient: Calm, relaxing
- uplifting: Positive, inspiring
"""

import subprocess
import sys
from pathlib import Path


def generate_upbeat_music(duration_sec, output_path):
    """Generate upbeat, energetic music."""
    print(f"   Generating upbeat music ({duration_sec}s)...")

    # Combine multiple frequencies for upbeat effect
    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"sine=frequency=220:duration={duration_sec}",
        "-f", "lavfi",
        "-i", f"sine=frequency=330:duration={duration_sec}",
        "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration_sec}",
        "-filter_complex",
        "[0:a][1:a][2:a]amix=inputs=3:duration=first[a]",
        "-map", "[a]",
        "-q:a", "9",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return result.returncode == 0


def generate_cinematic_music(duration_sec, output_path):
    """Generate cinematic, epic music."""
    print(f"   Generating cinematic music ({duration_sec}s)...")

    # Lower frequencies for epic feel
    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"sine=frequency=110:duration={duration_sec}",
        "-f", "lavfi",
        "-i", f"sine=frequency=165:duration={duration_sec}",
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=first,"
        "volume=0.3,"
        "lowpass=cutoff=3000[a]",
        "-map", "[a]",
        "-q:a", "9",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return result.returncode == 0


def generate_uplifting_music(duration_sec, output_path):
    """Generate uplifting, positive music."""
    print(f"   Generating uplifting music ({duration_sec}s)...")

    # Major chord frequencies
    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"sine=frequency=262:duration={duration_sec}",  # C
        "-f", "lavfi",
        "-i", f"sine=frequency=330:duration={duration_sec}",  # E
        "-f", "lavfi",
        "-i", f"sine=frequency=392:duration={duration_sec}",  # G
        "-filter_complex",
        "[0:a][1:a][2:a]amix=inputs=3:duration=first,"
        "volume=0.25[a]",
        "-map", "[a]",
        "-q:a", "9",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return result.returncode == 0


def main():
    styles = ["upbeat", "cinematic", "uplifting"]

    if len(sys.argv) < 2:
        print("Usage: python generate_music.py <style> [duration_seconds]")
        print(f"Available styles: {', '.join(styles)}")
        sys.exit(1)

    style = sys.argv[1].lower()
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 15

    if style not in styles:
        print(f"❌ Unknown style. Choose from: {', '.join(styles)}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print(f"🎵 GENERATE MUSIC: {style.upper()}")
    print("=" * 70)

    output_path = Path.cwd() / f"music_{style}_{duration}s.aac"

    print(f"\n🎶 Generating {style} music...")
    print(f"   Duration: {duration}s")

    success = False

    if style == "upbeat":
        success = generate_upbeat_music(duration, str(output_path))
    elif style == "cinematic":
        success = generate_cinematic_music(duration, str(output_path))
    elif style == "uplifting":
        success = generate_uplifting_music(duration, str(output_path))

    if success and output_path.exists():
        size = output_path.stat().st_size / 1024
        print(f"\n✅ Music generated!")
        print(f"   File: {output_path}")
        print(f"   Size: {size:.1f} KB")
    else:
        print(f"\n❌ Failed to generate music")
        sys.exit(1)

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
