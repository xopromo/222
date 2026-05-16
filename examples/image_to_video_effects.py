#!/usr/bin/env python3
"""
Generate dynamic video from image with effects + music.

Effects:
- Zoom in/out
- Pan (camera movement)
- Fade in/out
- Rotate
- Multiple combined effects

Usage:
    python examples/image_to_video_effects.py <image_path> [duration_seconds]

Example:
    python examples/image_to_video_effects.py dentist.jpg 15
"""

import subprocess
import sys
from pathlib import Path


def generate_background_music(duration_sec, output_path):
    """Generate royalty-free background music (ambient tone)."""
    print(f"   Generating background music ({duration_sec}s)...")

    # Create a simple ambient pad using sine wave
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


def create_zoom_in_video(image_path, duration_sec, output_path, audio_path):
    """Create zoom-in effect video with audio."""
    print(f"   Creating zoom-in effect ({duration_sec}s)...")

    filter_complex = (
        f"[0:v]scale=1920:1080,"
        f"zoompan=z='min(zoom+0.05,2)':d=1:s=1920x1080:fps=30,"
        f"fade=t=in:st=0:d=1,"
        f"fade=t=out:st={duration_sec-1}:d=1[v]"
    )

    cmd = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[v]:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_pan_video(image_path, duration_sec, output_path, audio_path):
    """Create pan (camera movement) effect video."""
    print(f"   Creating pan effect ({duration_sec}s)...")

    # Pan from left to right
    filter_complex = (
        f"[0:v]scale=2560:1440,"
        f"crop=1920:1080:w=t*1920/{duration_sec}:h=0,"
        f"pad=1920:1080:0:0,"
        f"fade=t=in:st=0:d=1,"
        f"fade=t=out:st={duration_sec-1}:d=1[v]"
    )

    cmd = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[v]:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_ken_burns_video(image_path, duration_sec, output_path, audio_path):
    """Create Ken Burns effect (zoom + pan combined)."""
    print(f"   Creating Ken Burns effect ({duration_sec}s)...")

    filter_complex = (
        f"[0:v]scale=1920:1080,"
        f"zoompan=z='1.0+0.04*t':d=1:s=1920x1080:x='0.5*w*(1-z)':y='0.5*h*(1-z)':fps=30,"
        f"fade=t=in:st=0:d=1,"
        f"fade=t=out:st={duration_sec-1}:d=1[v]"
    )

    cmd = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[v]:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_rotate_video(image_path, duration_sec, output_path, audio_path):
    """Create rotation effect."""
    print(f"   Creating rotation effect ({duration_sec}s)...")

    filter_complex = (
        f"[0:v]scale=1080:1080,"
        f"rotate='2*PI*t/{duration_sec}',"
        f"scale=1920:1080,"
        f"fade=t=in:st=0:d=1,"
        f"fade=t=out:st={duration_sec-1}:d=1[v]"
    )

    cmd = [
        "ffmpeg",
        "-loop", "1",
        "-i", str(image_path),
        "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[v]:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python image_to_video_effects.py <image_path> [duration_seconds]")
        sys.exit(1)

    image_path = Path(sys.argv[1])
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 12

    if not image_path.exists():
        print(f"❌ Image not found: {image_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎬 IMAGE TO VIDEO WITH EFFECTS + MUSIC")
    print("=" * 70)

    print(f"\n📸 Input: {image_path.name}")
    print(f"   Duration: {duration}s")

    import tempfile
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        # Step 1: Generate music
        print(f"\n🎵 STEP 1: GENERATE BACKGROUND MUSIC")
        print("-" * 70)

        audio_path = temp_dir / "background.aac"
        if generate_background_music(duration, str(audio_path)):
            print(f"   ✅ Music generated (ambient pad, {duration}s)")
        else:
            print(f"   ❌ Failed to generate music")
            sys.exit(1)

        # Step 2: Create different effect versions
        print(f"\n🎨 STEP 2: CREATE VIDEO EFFECTS")
        print("-" * 70)

        output_dir = image_path.parent / "image_videos"
        output_dir.mkdir(exist_ok=True)

        effects = [
            ("zoom_in", create_zoom_in_video),
            ("ken_burns", create_ken_burns_video),
            ("pan", create_pan_video),
            ("rotate", create_rotate_video),
        ]

        results = {}

        for effect_name, effect_func in effects:
            print(f"\n{effect_name.upper()}")
            output_path = output_dir / f"{image_path.stem}_{effect_name}.mp4"

            if effect_func(str(image_path), duration, str(output_path), str(audio_path)):
                size = output_path.stat().st_size / (1024 * 1024)
                print(f"   ✅ {output_path.name} ({size:.1f} MB)")
                results[effect_name] = output_path
            else:
                print(f"   ❌ Failed")

    # Summary
    print(f"\n" + "=" * 70)
    print(f"✨ VIDEO GENERATION COMPLETE!")
    print("=" * 70)

    print(f"\n📁 OUTPUT FILES ({len(results)} videos):")

    effect_descriptions = {
        "zoom_in": "Smooth zoom in with fade",
        "ken_burns": "Professional Ken Burns effect (zoom + pan)",
        "pan": "Camera pan across image",
        "rotate": "360° rotation effect",
    }

    for i, (effect_name, path) in enumerate(results.items(), 1):
        size = path.stat().st_size / (1024 * 1024)
        desc = effect_descriptions.get(effect_name, effect_name)
        print(f"\n   {i}. {effect_name.upper()}")
        print(f"      📂 {path}")
        print(f"      💾 {size:.1f} MB")
        print(f"      📝 {desc}")

    print(f"\n💡 FEATURES:")
    print(f"   ✅ Professional effects (Ken Burns, zoom, pan, rotate)")
    print(f"   ✅ Background music (ambient pad)")
    print(f"   ✅ Smooth fade in/out transitions")
    print(f"   ✅ 1080p HD quality")
    print(f"   ✅ Royalty-free music")

    print(f"\n🎯 RECOMMENDATION:")
    print(f"   Watch: KEN_BURNS first (most professional looking)")
    print(f"   Then: ZOOM_IN (dramatic effect)")

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
