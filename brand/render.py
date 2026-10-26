"""Renders brand/svg/*.svg (from make_logo.py) into every web and iOS asset.
Standard library only; draws with a headless Chromium (Playwright's, or set
STUBBED_CHROME to any Chrome binary), which keeps transparency.

  python3 brand/make_logo.py && python3 brand/render.py
"""
import glob
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, "brand", "svg")
WEB_PUBLIC = os.path.join(ROOT, "apps", "web", "public", "brand")
WEB_APP = os.path.join(ROOT, "apps", "web", "src", "app")
IOS_ASSETS = os.path.join(ROOT, "apps", "ios", "Stubbed", "Assets.xcassets")


def chrome():
    if os.environ.get("STUBBED_CHROME"):
        return os.environ["STUBBED_CHROME"]
    found = sorted(glob.glob(os.path.expanduser(
        "~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))
    if not found:
        raise SystemExit("No headless Chrome found: run `npx playwright install chromium-headless-shell` or set STUBBED_CHROME")
    return found[-1]


def view_box(svg_path):
    _, _, w, h = map(float, re.search(r'viewBox="([^"]+)"', open(svg_path).read()).group(1).split())
    return w, h


def render(name, out, width):
    """`name`.svg at `width` px wide (height from its viewBox), transparent."""
    src = os.path.join(SVG, name + ".svg")
    w, h = view_box(src)
    height = round(width * h / w)
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "page.html")
        with open(page, "w") as f:
            f.write(f'<html><body style="margin:0;background:transparent">'
                    f'<img src="file://{src}" style="display:block;width:{width}px;height:{height}px"></body></html>')
        shot = os.path.join(tmp, "shot.png")
        subprocess.run([chrome(), "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
                        f"--window-size={width},{height}", f"--screenshot={shot}", f"file://{page}"],
                       check=True, capture_output=True, timeout=60)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.copy(shot, out)
    return out


# PNG helpers: read RGBA, write RGB (App Store icons must not have an alpha channel).
def read_rgba(path):
    data = open(path, "rb").read()
    pos, idat = 8, b""
    while pos < len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        if kind == b"IHDR":
            w, h, depth, color = struct.unpack(">IIBB", data[pos + 8:pos + 18])
            assert depth == 8 and color in (2, 6), "expects 8-bit RGB or RGBA"
        elif kind == b"IDAT":
            idat += data[pos + 8:pos + 8 + n]
        pos += 12 + n
    bpp = 4 if color == 6 else 3
    raw, stride = zlib.decompress(idat), w * bpp
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b, c = prev[i], prev[i - bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        if bpp == 3:  # add an opaque alpha channel
            line = b"".join(bytes(line[i:i + 3]) + b"\xff" for i in range(0, stride, 3))
        rows.append(bytes(line))
    return w, h, rows


def write_png(path, w, h, rows, alpha):
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)
    if alpha:
        pixels = b"".join(b"\0" + r for r in rows)
    else:  # flatten onto white, drop the alpha channel
        out = []
        for r in rows:
            line = bytearray()
            for i in range(0, len(r), 4):
                a = r[i + 3]
                line += bytes(((r[i + k] * a + 255 * (255 - a)) // 255) for k in range(3))
            out.append(b"\0" + bytes(line))
        pixels = b"".join(out)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6 if alpha else 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(pixels, 9)) + chunk(b"IEND", b""))


def opaque(name, out, width):
    """Rendered, then written without an alpha channel. Chrome already writes
    a fully opaque image as RGB, so that is used as it is."""
    with tempfile.TemporaryDirectory() as tmp:
        shot = render(name, os.path.join(tmp, "x.png"), width)
        if open(shot, "rb").read()[25] == 2:  # PNG colour type 2: RGB, no alpha
            shutil.copy(shot, out)
            return
        w, h, rows = read_rgba(shot)
        write_png(out, w, h, rows, alpha=False)


def ico(name, out, sizes=(16, 32, 48)):
    """A favicon.ico holding PNG images at each size. ICO readers want RGBA
    PNGs, so the opaque renders get an alpha channel back."""
    images = []
    with tempfile.TemporaryDirectory() as tmp:
        for s in sizes:
            w, h, rows = read_rgba(render(name, os.path.join(tmp, f"{s}.png"), s))
            path = os.path.join(tmp, f"{s}-rgba.png")
            write_png(path, w, h, rows, alpha=True)
            images.append(open(path, "rb").read())
    header = struct.pack("<HHH", 0, 1, len(images))
    offset, entries = 6 + 16 * len(images), b""
    for s, img in zip(sizes, images):
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(img), offset)
        offset += len(img)
    with open(out, "wb") as f:
        f.write(header + entries + b"".join(images))


def ios_icon_set():
    folder = os.path.join(IOS_ASSETS, "AppIcon.appiconset")
    for f in glob.glob(os.path.join(folder, "*.png")):
        os.remove(f)
    opaque("stubbed-icon", os.path.join(folder, "AppIcon.png"), 1024)
    opaque("ios-icon-dark", os.path.join(folder, "AppIcon-Dark.png"), 1024)
    opaque("ios-icon-tinted", os.path.join(folder, "AppIcon-Tinted.png"), 1024)
    entry = lambda file, appearance=None: {
        **{"filename": file, "idiom": "universal", "platform": "ios", "size": "1024x1024"},
        **({"appearances": [{"appearance": "luminosity", "value": appearance}]} if appearance else {}),
    }
    contents = {"images": [entry("AppIcon.png"), entry("AppIcon-Dark.png", "dark"), entry("AppIcon-Tinted.png", "tinted")],
                "info": {"author": "xcode", "version": 1}}
    json.dump(contents, open(os.path.join(folder, "Contents.json"), "w"), indent=2)


def ios_brand_mark():
    """The A2 mark for in-app use, as transparent PNGs (the asset catalog's SVG
    support doesn't reliably draw masks). 200pt wide at @2x and @3x."""
    folder = os.path.join(IOS_ASSETS, "BrandMark.imageset")
    if os.path.isdir(folder):
        shutil.rmtree(folder)
    os.makedirs(folder)
    render("stubbed-mark", os.path.join(folder, "BrandMark@2x.png"), 400)
    render("stubbed-mark", os.path.join(folder, "BrandMark@3x.png"), 600)
    json.dump({"images": [{"filename": "BrandMark@2x.png", "idiom": "universal", "scale": "2x"},
                          {"filename": "BrandMark@3x.png", "idiom": "universal", "scale": "3x"}],
               "info": {"author": "xcode", "version": 1}},
              open(os.path.join(folder, "Contents.json"), "w"), indent=2)


if __name__ == "__main__":
    os.makedirs(WEB_PUBLIC, exist_ok=True)
    for name in ("stubbed-icon", "stubbed-mark", "stubbed-mark-outline"):
        shutil.copy(os.path.join(SVG, name + ".svg"), os.path.join(WEB_PUBLIC, name + ".svg"))
        render(name, os.path.join(WEB_PUBLIC, name + ".png"), 1024)  # downloads, transparent where the mark is
    render("stubbed-icon", os.path.join(WEB_PUBLIC, "icon-192.png"), 192)
    render("stubbed-icon", os.path.join(WEB_PUBLIC, "icon-512.png"), 512)
    # The browser tab shows the mark, like the header; home-screen icons need the full tile.
    shutil.copy(os.path.join(SVG, "favicon.svg"), os.path.join(WEB_APP, "icon.svg"))
    ico("favicon", os.path.join(WEB_APP, "favicon.ico"))
    opaque("stubbed-icon", os.path.join(WEB_APP, "apple-icon.png"), 180)
    ios_icon_set()
    ios_brand_mark()
    print("done")
