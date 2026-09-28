#!/bin/bash
# frames/*.jpg + song.mp3 -> hackathon-mv.mp4
set -e
FF=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
cd "$(dirname "$0")"
$FF -y -hide_banner -loglevel warning -framerate 30 -i frames/%06d.jpg -i song.mp3 -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -shortest -movflags +faststart hackathon-mv.mp4
$FF -hide_banner -i hackathon-mv.mp4 2>&1 | grep -E "Duration|Stream" || true
