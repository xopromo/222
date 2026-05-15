#!/usr/bin/env python3
"""
Professional image-to-video generator with multiple music styles.

Usage:
    python image_to_video_pro.py <image_path> [duration] [music_style]

Music styles:
    upbeat      - Energetic, motivating
    cinematic   - Epic, dramatic
    uplifting   - Positive, inspiring
    ambient     - Calm, relaxing (default)

Example:
    python image_to_video_pro.py photo.jpg 15 cinematic
    python image_to_video_pro.py photo.jpg 10 upbeat
"""

import subprocess
import sys
import tempfile
from pathlib import Path


def generate_music(duration_sec, style, output_path):
    """Generate background music based on style."""
    print(f"   Generating {style} music ({duration_sec}s)...")

    if style == "upbeat":
        # Energetic: 220Hz, 330Hz, 440Hz
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
            "-volume", "0.2",
            "-q:a", "9",
            "-y",
            str(output_path)
        ]

    elif style == "cinematic":
        # Epic: Low frequencies
        cmd = [
            "ffmpeg",
            "-f", "lavfi",
            "-i", f"sine=frequency=110:duration={duration_sec}",
            "-f", "lavfi",
            "-i", f"sine=frequency=165:duration={duration_sec}",
            "-f", "lavfi",
            "-i", f"sine=frequency=220:duration={duration_sec}",
            "-filter_complex",
            "[0:a][1:a][2:a]amix=inputs=3:duration=first,"
            "volume=0.15,"
            "lowpass=cutoff=2000[a]",
            "-map", "[a]",
            "-q:a", "9",
            "-y",
            str(output_path)
        ]

    elif style == "uplifting":
        # Major chord: C-E-G
        cmd = [
            "ffmpeg",
            "-f", "lavfi",
            "-i", f"sine=frequency=262:duration={duration_sec}",
            "-f", "lavfi",
            "-i", f"sine=frequency=330:duration={duration_sec}",
            "-f", "lavfi",
            "-i", f"sine=frequency=392:duration={duration_sec}",
            "-filter_complex",
            "[0:a][1:a][2:a]amix=inputs=3:duration=first,"
            "volume=0.2[a]",
            "-map", "[a]",
            "-q:a", "9",
            "-y",
            str(output_path)
        ]

    else:  # ambient
        cmd = [
            "ffmpeg",
            "-f", "lavfi",
            "-i", f"sine=frequency=150:duration={duration_sec}",
            "-filter:a", "volume=0.1",
            "-q:a", "9",
            "-y",
            str(output_path)
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return result.returncode == 0


def create_video_with_music(image_path, duration_sec, music_style, output_path):
    """Create video from image with specified music style."""
    print(f"   Creating video with {music_style} music...")

    filter_complex = (
        f"[0:v]scale=1920:1080,"
        f"zoompan=z='min(zoom+0.05,1.5)':d=1:s=1920x1080:fps=30,"
        f"fade=t=in:st=0:d=1,"
        f"fade=t=out:st={duration_sec-1}:d=1[v]"
    )

    cmd = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-i", str(output_path),
        "-filter_complex", filter_complex,
        "-map", "[v]:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-y",
        str(output_path).replace(".aac", ".mp4")
    ]

    # Simpler command
    cmd2 = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-i", str(output_path),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-shortest",
        "-t", str(duration_sec),
        "-y",
        str(output_path).replace(".aac", ".mp4")
    ]

    result = subprocess.run(cmd2, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python image_to_video_pro.py <image_path> [duration] [music_style]")
        print("\nMusic styles:")
        print("  upbeat     - Energetic, motivating")
        print("  cinematic  - Epic, dramatic")
        print("  uplifting  - Positive, inspiring")
        print("  ambient    - Calm, relaxing (default)")
        sys.exit(1)

    image_path = Path(sys.argv[1])
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 15
    music_style = sys.argv[3].lower() if len(sys.argv) > 3 else "cinematic"

    if not image_path.exists():
        print(f"❌ Image not found: {image_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎬 IMAGE TO VIDEO PRO - WITH MUSIC")
    print("=" * 70)

    print(f"\n📸 Input: {image_path.name}")
    print(f"   Duration: {duration}s")
    print(f"   Music: {music_style}")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        # Generate music
        print(f"\n🎵 STEP 1: GENERATE MUSIC")
        print("-" * 70)

        audio_path = temp_dir / f"music_{music_style}.aac"
        if generate_music(duration, music_style, str(audio_path)):
            print(f"   ✅ {music_style} music generated")
        else:
            print(f"   ❌ Failed to generate music")
            sys.exit(1)

        # Create video
        print(f"\n🎨 STEP 2: CREATE VIDEO")
        print("-" * 70)

        output_dir = image_path.parent / "video_output"
        output_dir.mkdir(exist_ok=True)

        output_path = output_dir / f"{image_path.stem}_{music_style}_{duration}s.mp4"

        if create_video_with_music(str(image_path), duration, music_style, str(audio_path)):
            actual_output = str(audio_path).replace(".aac", ".mp4")
            if Path(actual_output).exists():
                # Copy to output dir
                subprocess.run(["cp", actual_output, str(output_path)], capture_output=True)
                size = output_path.stat().st_size / (1024 * 1024)
                print(f"   ✅ Video created")
                print(f"   📂 {output_path}")
                print(f"   💾 {size:.1f} MB")
            else:
                print(f"   ❌ Output file not found")
        else:
            print(f"   ❌ Failed to create video")

    # Summary
    print(f"\n" + "=" * 70)
    print(f"✨ DONE!")
    print("=" * 70)
    print(f"\n🎵 Music style: {music_style.upper()}")
    print(f"⏱️  Duration: {duration}s")
    print(f"🎬 Effects: Smooth zoom + fade in/out")
    print(f"\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
