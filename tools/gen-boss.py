"""司令のイラストを画像生成AI（Gemini 3 Pro Image）で作る（制作用）。

    python3 tools/gen-boss.py A          # 案Aを1枚 → tools/boss/A.png
    python3 tools/gen-boss.py A --ref tools/boss/A.png --extra "..."   # 参照つきで描き直す

呼び方は ~/Desktop/variety-deck/gen_image.py と同じ。APIキーはそのフォルダの .env から読む
（このリポジトリは公開なので、キーは置かない）。
"""
import argparse
import base64
import json
import os
import urllib.request

MODEL = "gemini-3-pro-image"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
ENV = os.path.expanduser("~/Desktop/variety-deck/.env")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boss")

BASE = """Character illustration of "Commander Yamata", a lovable white snake who is the cool, capable commander of a secret spy unit.
Full body, centered, three-quarter view facing slightly left. The body is coiled in a loose S-shape resting on the ground; the neck clearly rises above the coil, and the tail tip is clearly visible and does not overlap the head.
Wearing dark rectangular sunglasses, a small black headset with a microphone arm, and two small golden horn-like crests on top of the head. Mouth closed with a gentle smile.
Pure white scales with soft pale-mint shading, a lighter belly stripe, clean confident outlines, smooth cel shading, high-quality anime / game character art.
Plain solid dark navy background (#16202E), no shadows on the background, no text, no logos, no other objects. Square image."""

STYLE = {
    "A": "Slender, elegant and grown-up proportions; a slight confident smirk.",
    "B": "Chibi proportions: a big round head, round cheeks with a light blush; sunglasses pushed up onto the forehead so big friendly eyes are visible.",
    "C": "Wears a navy officer cap with a gold emblem and a short navy cape; sunglasses slipped down the snout, one eye winking above them.",
}


def load_key():
    for line in open(ENV, encoding="utf-8"):
        if line.strip().startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY が見つかりません")


def find_image(node):
    if isinstance(node, dict):
        if isinstance(node.get("data"), str) and ("image" in str(node.get("mime_type", "")) or node.get("type") == "image"):
            return node["data"]
        for v in node.values():
            got = find_image(v)
            if got:
                return got
    elif isinstance(node, list):
        for v in node:
            got = find_image(v)
            if got:
                return got
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--ref")
    ap.add_argument("--extra", default="")
    ap.add_argument("--out")
    a = ap.parse_args()
    prompt = BASE + "\n" + STYLE.get(a.name[0], "") + ("\n" + a.extra if a.extra else "")
    payload = {"model": MODEL, "input": [{"type": "text", "text": prompt}],
               "response_format": {"type": "image", "aspect_ratio": "1:1", "image_size": "1K"}}
    if a.ref:
        payload["input"].append({"type": "image", "mime_type": "image/png",
                                 "data": base64.b64encode(open(a.ref, "rb").read()).decode("ascii")})
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": load_key()})
    with urllib.request.urlopen(req, timeout=240) as res:
        body = json.loads(res.read().decode("utf-8"))
    data = find_image(body)
    if not data:
        raise SystemExit("画像が返ってきませんでした: " + json.dumps(body)[:400])
    os.makedirs(OUT, exist_ok=True)
    path = a.out or os.path.join(OUT, a.name + ".png")
    open(path, "wb").write(base64.b64decode(data))
    print("保存:", path)


main()
