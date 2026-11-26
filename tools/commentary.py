"""Convert the recorded commentary in commentary/*.wav to small mono MP3s in
assets/commentary/, which is what the game loads. Run after adding or replacing a clip:

    python tools/commentary.py

Clip names the game looks for (see game/commentary.js):
    match intro, miss and leave, 0, 1, 2, 3, 4, 6, catch, bowled, runout,
    virat, bumrah, smith, starc
"""
import os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "commentary")
OUT = os.path.join(HERE, "..", "assets", "commentary")
ffmpeg = shutil.which("ffmpeg")
if not ffmpeg:
    sys.exit("ffmpeg not found on PATH")
os.makedirs(OUT, exist_ok=True)
for name in sorted(os.listdir(SRC)):
    if not name.lower().endswith(".wav"):
        continue
    slug = os.path.splitext(name)[0].strip().lower().replace(" ", "-")
    dst = os.path.join(OUT, slug + ".mp3")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", os.path.join(SRC, name), "-ac", "1", "-b:a", "64k", dst], check=True)
    print(f"{name} -> assets/commentary/{slug}.mp3 ({os.path.getsize(dst) // 1024} KB)")
