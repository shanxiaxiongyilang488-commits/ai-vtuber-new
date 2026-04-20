import os
import shutil
from PIL import Image, ImageStat

FRAMES_DIR = r"E:\Dev\ai-vtuber\static\frames"
OUT_DIR = r"E:\Dev\ai-vtuber\static\mouth"

os.makedirs(OUT_DIR, exist_ok=True)

files = sorted([f for f in os.listdir(FRAMES_DIR) if f.endswith(".png")])

scores = []

for file in files:
    path = os.path.join(FRAMES_DIR, file)

    img = Image.open(path).convert("L")
    w, h = img.size

    # 顔中央下部 = 口周辺想定
    crop = img.crop((
        int(w * 0.35),
        int(h * 0.58),
        int(w * 0.65),
        int(h * 0.78)
    ))

    stat = ImageStat.Stat(crop)
    score = stat.stddev[0]   # 変化量

    scores.append((file, score))

scores.sort(key=lambda x: x[1])

close_file = scores[0][0]
mid_file   = scores[len(scores)//2][0]
open_file  = scores[-1][0]

targets = [
    (close_file, "mouth_close.png"),
    (mid_file,   "mouth_mid.png"),
    (open_file,  "mouth_open.png")
]

for src, dst in targets:
    shutil.copy(
        os.path.join(FRAMES_DIR, src),
        os.path.join(OUT_DIR, dst)
    )

print("完了")
print("close:", close_file)
print("mid  :", mid_file)
print("open :", open_file)