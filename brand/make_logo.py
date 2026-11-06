"""Draws the Stubbed logo (two admission tickets) as SVG, in its three
variants, from one geometry. Standard library only.

  icon          (E1) the gradient tile with white outlined tickets: the app
                icon, Apple touch icon and PWA icons
  mark          (A2) gradient tickets, transparent: beside the wordmark on
                light backgrounds, and (squared up) the browser tab icon
  mark-outline  (E2) gradient outlines, transparent: empty states and large
                decorative uses on white; the base of the iOS dark and
                tinted icons

`python3 brand/make_logo.py` writes brand/svg/*.svg; `brand/render.sh` turns
them into every web and iOS asset (macOS: Quick Look and sips).
"""
import math
import os

# The tickets: a rounded rectangle with a semicircle notch in each short side.
W, H, R, NOTCH = 640, 380, 64, 58
BACK = dict(x=450, y=420, angle=-14)
FRONT = dict(x=590, y=610, angle=-7)
STROKE = 46  # outline weight
GAP = 36  # space between the front ticket and the back one
# The pair is scaled to 90% around the tile's centre, clear of iOS's rounded corners.
GROUP = 'translate(512 512) scale(0.9) translate(-520 -515)'

# The brand gradient: magenta to coral to amber, bottom-left to top-right.
SWEEP = [("0", "#e8247f"), ("0.5", "#ff5a5a"), ("1", "#ffa040")]
BACK_FILL = [("0", "#ee2a8e"), ("1", "#ff6f6a")]
FRONT_FILL = [("0", "#ff6a4d"), ("1", "#ffb347")]


def ticket_path(w=W, h=H, r=R, n=NOTCH):
    x, y = w / 2, h / 2
    return (f"M{-x + r},{-y} L{x - r},{-y} A{r},{r} 0 0 1 {x},{-y + r} L{x},{-n} A{n},{n} 0 0 0 {x},{n} "
            f"L{x},{y - r} A{r},{r} 0 0 1 {x - r},{y} L{-x + r},{y} A{r},{r} 0 0 1 {-x},{y - r} L{-x},{n} "
            f"A{n},{n} 0 0 0 {-x},{-n} L{-x},{-y + r} A{r},{r} 0 0 1 {-x + r},{-y} Z")


T = ticket_path()


def place(t):
    return f'translate({t["x"]} {t["y"]}) rotate({t["angle"]})'


def gradient(id_, stops, user_space=False):
    units = ' gradientUnits="userSpaceOnUse" x1="0" y1="1024" x2="1024" y2="0"' if user_space else ' x1="0" y1="1" x2="1" y2="0"'
    return f'<linearGradient id="{id_}"{units}>' + "".join(
        f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops) + "</linearGradient>"


def perforation(paint, end=H / 2 - 70):
    """A row of dots across the ticket's stub. `end` stops it short, so the
    back ticket of an outlined pair shows only whole dots beside the front one."""
    x = W / 2 - 150
    return (f'<line x1="{x}" y1="{-H / 2 + 70}" x2="{x}" y2="{end}" stroke="{paint}" '
            f'stroke-width="24" stroke-linecap="round" stroke-dasharray="0 50"/>')


def bounds(pad):
    """The pair's bounding box in tile space, for a tight viewBox."""
    xs, ys = [], []
    for t in (BACK, FRONT):
        a = math.radians(t["angle"])
        for cx, cy in ((-W / 2, -H / 2), (W / 2, -H / 2), (W / 2, H / 2), (-W / 2, H / 2)):
            x = t["x"] + cx * math.cos(a) - cy * math.sin(a)
            y = t["y"] + cx * math.sin(a) + cy * math.cos(a)
            xs.append(512 + 0.9 * (x - 520))
            ys.append(512 + 0.9 * (y - 515))
    x0, y0, x1, y1 = min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
    return f"{x0:.0f} {y0:.0f} {x1 - x0:.0f} {y1 - y0:.0f}"


def svg(view_box, defs, body, size=None):
    dims = f' width="{size}" height="{size}"' if size else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}"{dims}>'
            f"<defs>{defs}</defs>{body}</svg>\n")


# The back ticket is cut away where the front one covers it, with a gap.
KNOCKOUT = (f'<mask id="knockout" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1424" height="1424">'
            f'<rect x="-200" y="-200" width="1424" height="1424" fill="#fff"/>'
            f'<g transform="{GROUP}"><path transform="{place(FRONT)}" d="{T}" fill="#000" stroke="#000" '
            f'stroke-width="{{w}}" stroke-linejoin="round"/></g></mask>')


def icon(tile, line):
    """E1, and the iOS dark and tinted icons: outlined tickets on a full tile."""
    defs = gradient("sweep", SWEEP, user_space=True) + KNOCKOUT.format(w=STROKE + 2 * GAP)
    body = (f'<rect width="1024" height="1024" fill="{tile}"/>'
            f'<g mask="url(#knockout)"><g transform="{GROUP}"><g transform="{place(BACK)}">'
            f'<path d="{T}" fill="none" stroke="{line}" stroke-width="{STROKE}" stroke-linejoin="round"/>'
            f'{perforation(line, end=-30)}</g></g></g>'
            f'<g transform="{GROUP}"><g transform="{place(FRONT)}">'
            f'<path d="{T}" fill="none" stroke="{line}" stroke-width="{STROKE}" stroke-linejoin="round"/>'
            f'{perforation(line)}</g></g>')
    return svg("0 0 1024 1024", defs, body, 1024)


def mark():
    """A2: gradient tickets with white perforations, transparent around them."""
    defs = (gradient("back", BACK_FILL) + gradient("front", FRONT_FILL)
            + KNOCKOUT.format(w=2 * GAP))
    body = (f'<g mask="url(#knockout)"><g transform="{GROUP}"><g transform="{place(BACK)}">'
            f'<path d="{T}" fill="url(#back)"/>{perforation("#fff")}</g></g></g>'
            f'<g transform="{GROUP}"><g transform="{place(FRONT)}">'
            f'<path d="{T}" fill="url(#front)"/>{perforation("#fff")}</g></g>')
    return svg(bounds(8), defs, body)


def favicon():
    """The browser tab icon: the mark (A2), centred in a square, transparent."""
    x, y, w, h = map(float, bounds(8).split())
    side = max(w, h)
    square = f"{x - (side - w) / 2:.0f} {y - (side - h) / 2:.0f} {side:.0f} {side:.0f}"
    return mark().replace(f'viewBox="{bounds(8)}"', f'viewBox="{square}"')


def mark_outline(line="url(#sweep)"):
    """E2: gradient outlines, transparent inside and around."""
    defs = gradient("sweep", SWEEP, user_space=True) + KNOCKOUT.format(w=STROKE + 2 * GAP)
    body = (f'<g mask="url(#knockout)"><g transform="{GROUP}"><g transform="{place(BACK)}">'
            f'<path d="{T}" fill="none" stroke="{line}" stroke-width="{STROKE}" stroke-linejoin="round"/>'
            f'{perforation(line, end=-30)}</g></g></g>'
            f'<g transform="{GROUP}"><g transform="{place(FRONT)}">'
            f'<path d="{T}" fill="none" stroke="{line}" stroke-width="{STROKE}" stroke-linejoin="round"/>'
            f'{perforation(line)}</g></g>')
    return svg(bounds(STROKE / 2 + 8), defs, body)


def share_ticket():
    """Single front-ticket geometry for transparent sharing overlays."""
    body = f'<path d="{T}" fill="none" stroke="#fff" stroke-width="3.5"/>'
    return svg("-324 -194 648 388", "", body)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "svg")
    os.makedirs(out, exist_ok=True)
    files = {
        "stubbed-icon.svg": icon("url(#sweep)", "#fff"),
        "stubbed-mark.svg": mark(),
        "stubbed-mark-outline.svg": mark_outline(),
        "stubbed-share-ticket.svg": share_ticket(),
        "favicon.svg": favicon(),
        # iOS 18+ appearances: dark keeps the gradient lines on black; tinted is
        # white on black, which iOS recolours with the person's tint.
        "ios-icon-dark.svg": icon("#000", "url(#sweep)"),
        "ios-icon-tinted.svg": icon("#000", "#fff"),
    }
    for name, text in files.items():
        with open(os.path.join(out, name), "w") as f:
            f.write(text)
        print("wrote", name)
