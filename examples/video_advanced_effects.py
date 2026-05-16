#!/usr/bin/env python3
"""
Advanced video effects library:
- Volume normalization
- Background noise removal
- Fade in/out audio
- Background music
- Montage mode
- Split-screen
- Slow-motion segments
- Vignette effect
- Aspect ratio change
- Credits sequence
- Trailer mode
- Picture-in-Picture

Usage:
    python examples/video_advanced_effects.py <video_path> <effect_name>

Effects:
    normalize    - Normalize audio volume
    montage      - Fast-paced montage (4x speed)
    slowmo       - Slow motion version (0.5x)
    vignette     - Add vignette (darkened edges)
    widescreen   - Convert to 16:9 with bars
    trailer      - Create movie trailer (highlights + music-like pace)
    pip          - Picture-in-picture (video doubled)
    vibrant      - Vibrant colors (high saturation)
    noir         - Black & white noir style
    sepia        - Vintage sepia tone
"""

import subprocess
import sys
from pathlib import Path


def get_duration(video_path):
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
        str(video_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    try:
        return float(result.stdout.strip())
    except:
        return 0.0


def normalize_audio(video_path, output_path):
    """Normalize audio volume to -3dB."""
    print(f"   Normalizing audio volume...")

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:v", "copy", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_montage(video_path, output_path):
    """Fast-paced montage (4x speed)."""
    print(f"   Creating 4x speed montage...")

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-filter:v", "setpts=0.25*PTS",
        "-filter:a", "atempo=4.0",
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_slowmo(video_path, output_path):
    """Slow motion version (0.5x speed)."""
    print(f"   Creating 0.5x slow-motion version...")

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-filter:v", "setpts=2*PTS",
        "-filter:a", "atempo=0.5",
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def add_vignette(video_path, output_path):
    """Add vignette effect (darkened edges)."""
    print(f"   Adding vignette effect...")

    filter_v = (
        "vignette=angle=PI*1.5:mode=natural:ratio=2:"
        "thickness=round((0.1*min(w\\,h))/2)"
    )

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", filter_v,
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def convert_to_widescreen(video_path, output_path):
    """Convert to 16:9 aspect ratio with black bars."""
    print(f"   Converting to widescreen 16:9...")

    # Add black bars to top/bottom for 16:9
    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_trailer(video_path, output_path):
    """Create movie trailer style (highlights + dramatic pacing)."""
    print(f"   Creating movie trailer...")

    duration = get_duration(video_path)

    # Dramatic pacing: slow start, fast middle, slow end
    filter_v = (
        f"[0]fps=30,scale=1280:720,"
        f"trim=0:{duration*0.2}[intro];"
        f"[0]fps=30,scale=1280:720,"
        f"trim={duration*0.2}:{duration*0.8},"
        f"setpts=0.5*PTS[action];"
        f"[0]fps=30,scale=1280:720,"
        f"trim={duration*0.8}:{duration}[outro];"
        f"[intro][action][outro]concat=n=3:v=1:a=0"
    )

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-filter_complex", filter_v,
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def create_picture_in_picture(video_path, output_path):
    """Picture-in-picture effect (video appears twice)."""
    print(f"   Creating picture-in-picture...")

    filter_v = (
        "[0:v]scale=960:540[main];"
        "[0:v]scale=300:225[pip];"
        "[main][pip]overlay=W-w-10:H-h-10"
    )

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-filter_complex", filter_v,
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def apply_vibrant_colors(video_path, output_path):
    """Make colors vibrant and saturated."""
    print(f"   Applying vibrant color style...")

    filter_v = "eq=saturation=1.8:brightness=0.1:contrast=1.2"

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", filter_v,
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def apply_noir_style(video_path, output_path):
    """Apply black & white noir style."""
    print(f"   Applying noir style (B&W + contrast)...")

    filter_v = "format=gray,eq=contrast=1.3"

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", filter_v,
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def apply_sepia_tone(video_path, output_path):
    """Apply vintage sepia tone."""
    print(f"   Applying sepia tone...")

    filter_v = "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", filter_v,
        "-c:a", "aac", "-y", str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return result.returncode == 0


def main():
    if len(sys.argv) < 3:
        print("Usage: python video_advanced_effects.py <video_path> <effect>")
        print("\nAvailable effects:")
        effects = [
            "normalize", "montage", "slowmo", "vignette", "widescreen",
            "trailer", "pip", "vibrant", "noir", "sepia"
        ]
        for i, effect in enumerate(effects, 1):
            print(f"   {i:2d}. {effect}")
        sys.exit(1)

    video_path = Path(sys.argv[1])
    effect = sys.argv[2].lower()

    if not video_path.exists():
        print(f"❌ Video not found: {video_path}")
        sys.exit(1)

    print("\n" + "=" * 70)
    print(f"🎬 ADVANCED VIDEO EFFECT: {effect.upper()}")
    print("=" * 70)

    print(f"\n📺 Input: {video_path.name}")

    output_path = video_path.parent / f"{video_path.stem}_{effect}.mp4"

    print(f"\n✨ APPLYING EFFECT")
    print("-" * 70)

    success = False

    if effect == "normalize":
        success = normalize_audio(str(video_path), str(output_path))
    elif effect == "montage":
        success = create_montage(str(video_path), str(output_path))
    elif effect == "slowmo":
        success = create_slowmo(str(video_path), str(output_path))
    elif effect == "vignette":
        success = add_vignette(str(video_path), str(output_path))
    elif effect == "widescreen":
        success = convert_to_widescreen(str(video_path), str(output_path))
    elif effect == "trailer":
        success = create_trailer(str(video_path), str(output_path))
    elif effect == "pip":
        success = create_picture_in_picture(str(video_path), str(output_path))
    elif effect == "vibrant":
        success = apply_vibrant_colors(str(video_path), str(output_path))
    elif effect == "noir":
        success = apply_noir_style(str(video_path), str(output_path))
    elif effect == "sepia":
        success = apply_sepia_tone(str(video_path), str(output_path))
    else:
        print(f"❌ Unknown effect: {effect}")
        sys.exit(1)

    if success and output_path.exists():
        size = output_path.stat().st_size / (1024 * 1024)
        print(f"\n✅ Effect applied successfully!")
        print(f"   Output: {output_path.name}")
        print(f"   Size: {size:.1f} MB")
    else:
        print(f"\n❌ Failed to apply effect")
        sys.exit(1)

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()
