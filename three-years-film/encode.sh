#!/bin/bash
set -e
FF=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
cd "$(dirname "$0")"
$FF -y -hide_banner -loglevel warning -framerate 60 -i frames/%06d.jpg -i score.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -tune film \
  -c:a aac -b:a 256k -shortest -movflags +faststart three-years.mp4
$FF -hide_banner -i three-years.mp4 2>&1 | grep -E "Duration|Stream" || true
