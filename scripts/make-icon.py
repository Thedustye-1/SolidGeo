from PIL import Image, ImageDraw, ImageFilter
import math, os

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded square gradient background
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(bg)
for y in range(S):
    t = y / S
    r = int(7 + 18 * t)
    g = int(14 + 30 * t)
    b = int(28 + 48 * t)
    bd.line([(0, y), (S, y)], fill=(r, g, b, 255))
mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([24, 24, S - 24, S - 24], radius=220, fill=255)
img.paste(bg, (0, 0), mask)

# Ambient glow
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([90, 100, 760, 770], fill=(34, 211, 238, 95))
gd.ellipse([400, 260, 980, 840], fill=(129, 140, 248, 80))
glow = glow.filter(ImageFilter.GaussianBlur(130))
img = Image.alpha_composite(img, glow)
d = ImageDraw.Draw(img)

# Cube geometry (isometric)
cx, cy = S * 0.5, S * 0.54
w = 270
h = 165
top = [(cx, cy - h - 125), (cx + w, cy - h - 10), (cx, cy - h + 105), (cx - w, cy - h - 10)]
left = [(cx - w, cy - h - 10), (cx, cy - h + 105), (cx, cy + h + 135), (cx - w, cy + h + 20)]
right = [(cx + w, cy - h - 10), (cx, cy - h + 105), (cx, cy + h + 135), (cx + w, cy + h + 20)]

def poly(points, fill):
    d.polygon(points, fill=fill)

poly(top, (103, 232, 249, 48))
poly(left, (56, 189, 248, 28))
poly(right, (129, 140, 248, 36))

# Edge glow
edges = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ed = ImageDraw.Draw(edges)
for pts in (top, left, right):
    ed.line(pts + [pts[0]], fill=(103, 232, 249, 115), width=18, joint="curve")
ed.line([(cx, cy - h + 105), (cx, cy + h + 135)], fill=(103, 232, 249, 120), width=18)
edges = edges.filter(ImageFilter.GaussianBlur(22))
img = Image.alpha_composite(img, edges)
d = ImageDraw.Draw(img)

for pts in (top, left, right):
    d.line(pts + [pts[0]], fill=(220, 252, 255, 235), width=8, joint="curve")
d.line([(cx, cy - h + 105), (cx, cy + h + 135)], fill=(165, 243, 252, 225), width=7)
d.line([(cx, cy - h + 105), (cx + w, cy - h - 10)], fill=(196, 181, 253, 210), width=6)

# Nodes
for (x, y), color, r in [
    ((cx, cy - h - 125), (224, 242, 254, 255), 15),
    ((cx + w, cy - h - 10), (196, 181, 253, 255), 13),
    ((cx - w, cy - h - 10), (125, 211, 252, 255), 13),
    ((cx, cy - h + 105), (224, 242, 254, 255), 14),
    ((cx, cy + h + 135), (103, 232, 249, 255), 12),
]:
    d.ellipse([x - r, y - r, x + r, y + r], fill=color)

# Subtle corner accents
d.arc([70, 70, 260, 260], 180, 270, fill=(125, 211, 252, 130), width=6)
d.arc([S - 260, S - 260, S - 70, S - 70], 0, 90, fill=(167, 139, 250, 120), width=6)

os.makedirs("build", exist_ok=True)
img.save("build/icon.png")
img.resize((512, 512), Image.LANCZOS).save("build/icon-512.png")
img.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icon written")
