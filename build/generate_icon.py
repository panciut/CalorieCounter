"""Generate FoodBuddy icon - fork + leaf on dark green background."""
from PIL import Image, ImageDraw
import os

SIZE = 1024
C = SIZE // 2

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

BG    = (15, 52, 40)
CREAM = (245, 242, 235)
GREEN = (82, 183, 136)

# Background
draw.rounded_rectangle([40, 40, 984, 984], radius=200, fill=BG)

# --- Fork (left-center) ---
fx = C - 80          # fork axis x
fy0 = C - 310        # top of tines

TINE_W = 34
TINE_H = 230
GAP    = 22
NECK_W = 58
NECK_H = 70
HDL_W  = 62
HDL_H  = 260

# 3 tines
for i in (-1, 0, 1):
    tx = fx + i * (TINE_W + GAP)
    draw.rounded_rectangle(
        [tx - TINE_W//2, fy0, tx + TINE_W//2, fy0 + TINE_H],
        radius=TINE_W//2,
        fill=CREAM,
    )

# Neck
fy_neck = fy0 + TINE_H - 10
draw.rounded_rectangle(
    [fx - NECK_W//2, fy_neck, fx + NECK_W//2, fy_neck + NECK_H],
    radius=18,
    fill=CREAM,
)

# Handle
fy_hdl = fy_neck + NECK_H - 10
draw.rounded_rectangle(
    [fx - HDL_W//2, fy_hdl, fx + HDL_W//2, fy_hdl + HDL_H],
    radius=HDL_W//2,
    fill=CREAM,
)

# --- Leaf (right side) ---
lx = C + 200
ly = C - 80
LW, LH = 110, 220

draw.ellipse([lx - LW//2, ly - LH//2, lx + LW//2, ly + LH//2], fill=GREEN)
# Central vein
draw.line([(lx, ly - LH//2 + 18), (lx, ly + LH//2 - 18)], fill=BG, width=9)
# Side veins
for sy, sx_sign in [(-50, -1), (-50, 1), (0, -1), (0, 1), (50, -1), (50, 1)]:
    draw.line(
        [(lx, ly + sy), (lx + sx_sign * (LW//2 - 14), ly + sy - 30 * sx_sign * 0 - 25)],
        fill=BG, width=5,
    )
# Stem
draw.rounded_rectangle(
    [lx - 9, ly + LH//2 - 12, lx + 9, ly + LH//2 + 65],
    radius=9,
    fill=GREEN,
)

# ── Save 1024x1024 PNG ──────────────────────────────────────────────
build_dir = os.path.dirname(__file__)
icon_png = os.path.join(build_dir, "icon.png")
img.save(icon_png, "PNG")
print(f"Saved {icon_png}")

# ── Generate .iconset (macOS) ────────────────────────────────────────
iconset_dir = os.path.join(build_dir, "icon.iconset")
os.makedirs(iconset_dir, exist_ok=True)
for s in [16, 32, 64, 128, 256, 512, 1024]:
    img.resize((s, s), Image.LANCZOS).save(
        os.path.join(iconset_dir, f"icon_{s}x{s}.png"), "PNG"
    )
    if s <= 512:
        img.resize((s * 2, s * 2), Image.LANCZOS).save(
            os.path.join(iconset_dir, f"icon_{s}x{s}@2x.png"), "PNG"
        )
print(f"Iconset at {iconset_dir}")

# ── Generate .ico (Windows) ─────────────────────────────────────────
ico_path = os.path.join(build_dir, "icon.ico")
img.convert("RGBA").save(
    ico_path, format="ICO",
    sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)],
)
print(f"Saved {ico_path}")
