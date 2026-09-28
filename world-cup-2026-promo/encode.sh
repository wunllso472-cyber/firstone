#!/bin/bash
# frames/*.jpg + score.wav -> two deliverables
#   wc2026-promo-60s.mp4            web master: H.264 High, 1080p30, AAC 320k, -14 LUFS
#   wc2026-promo-60s-broadcast.mp4  broadcast: 1080p29.97, -24 LKFS (ATSC A/85), -2 dBTP
set -e
FF=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
cd "$(dirname "$0")"
$FF -y -hide_banner -loglevel warning -framerate 30 -i frames/%06d.jpg -i score.wav -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 21 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -profile:v high -level 4.2 -tune film -g 60 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -af "loudnorm=I=-14.5:TP=-2:LRA=11,alimiter=limit=0.72:level=disabled" -ar 48000 -c:a aac -b:a 320k -shortest -movflags +faststart wc2026-promo-60s.mp4
$FF -y -hide_banner -loglevel warning -framerate 30000/1001 -i frames/%06d.jpg -i score.wav -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high -level 4.2 -tune film -g 15 -bf 2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -af "atempo=0.999001,loudnorm=I=-24:TP=-2:LRA=11,alimiter=limit=0.79:level=disabled" -ar 48000 -c:a aac -b:a 320k -shortest -movflags +faststart wc2026-promo-60s-broadcast.mp4
ls -la *.mp4
