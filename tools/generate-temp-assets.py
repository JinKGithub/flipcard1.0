from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CARD_DIR = ROOT / "assets" / "images" / "cards"
UI_DIR = ROOT / "assets" / "images" / "ui"
SHARE_DIR = ROOT / "assets" / "images" / "share"


CARD_COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
    "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
    "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
]


def ensure_dirs():
    """Create asset directories if they do not exist."""
    CARD_DIR.mkdir(parents=True, exist_ok=True)
    UI_DIR.mkdir(parents=True, exist_ok=True)
    SHARE_DIR.mkdir(parents=True, exist_ok=True)


def get_font(size=40, bold=False):
    """Load a system font, falling back to Pillow's default font."""
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    """Draw a rounded rectangle compatible with current Pillow versions."""
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_center(draw, box, text, font, fill):
    """Draw centered text inside a box."""
    left, top, right, bottom = box
    text_box = draw.textbbox((0, 0), text, font=font)
    text_w = text_box[2] - text_box[0]
    text_h = text_box[3] - text_box[1]
    x = left + (right - left - text_w) / 2
    y = top + (bottom - top - text_h) / 2 - text_box[1]
    draw.text((x, y), text, font=font, fill=fill)


def create_card(index, color):
    """Create one temporary card face with a unique color and number."""
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (10, 10, size - 10, size - 10), 28, color, "white", 4)

    # Simple inner geometry makes cards easier to distinguish during testing.
    draw.ellipse((52, 48, 204, 200), fill=(255, 255, 255, 52), outline=(255, 255, 255, 120), width=3)
    draw.polygon([(128, 42), (152, 112), (226, 112), (166, 154), (188, 224),
                  (128, 180), (68, 224), (90, 154), (30, 112), (104, 112)],
                 fill=(255, 255, 255, 54))

    font = get_font(72, bold=True)
    text_center(draw, (0, 0, size, size), str(index), font, "white")
    img.save(CARD_DIR / f"card-{index}.png")


def create_card_back():
    """Create the shared temporary card back."""
    size = 256
    img = Image.new("RGBA", (size, size), "#312e81")
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (10, 10, size - 10, size - 10), 28, "#4338ca", "#c4b5fd", 4)
    for offset in range(-256, 256, 28):
        draw.line((offset, 256, offset + 256, 0), fill=(255, 255, 255, 38), width=4)
    draw.ellipse((72, 72, 184, 184), outline="#fbbf24", width=8)
    text_center(draw, (0, 0, size, size), "?", get_font(92, bold=True), "#fbbf24")
    img.save(CARD_DIR / "back.png")


def create_logo():
    """Create a temporary transparent logo."""
    img = Image.new("RGBA", (512, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (32, 42, 480, 214), 28, "#667eea", "#fbbf24", 5)
    draw.text((82, 74), "Flip", font=get_font(62, bold=True), fill="white")
    draw.text((248, 74), "Battle", font=get_font(62, bold=True), fill="#fde68a")
    draw.text((156, 154), "TEMP LOGO", font=get_font(24, bold=True), fill=(255, 255, 255, 180))
    img.save(UI_DIR / "logo.png")


def create_avatar():
    """Create a default player avatar placeholder."""
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((8, 8, size - 8, size - 8), fill="#667eea", outline="#ffffff", width=6)
    draw.ellipse((82, 54, 174, 146), fill=(255, 255, 255, 225))
    draw.ellipse((52, 148, 204, 248), fill=(255, 255, 255, 225))
    img.save(UI_DIR / "default-avatar.png")


def create_button(name, fill, text):
    """Create a simple temporary button texture."""
    img = Image.new("RGBA", (360, 96), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (8, 8, 352, 88), 18, fill, (255, 255, 255, 90), 2)
    text_center(draw, (0, 0, 360, 96), text, get_font(30, bold=True), "white")
    img.save(UI_DIR / name)


def create_share_image(name, title, subtitle, fill):
    """Create a temporary share card image."""
    img = Image.new("RGBA", (500, 400), fill)
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (24, 24, 476, 376), 24, (255, 255, 255, 32), (255, 255, 255, 80), 2)
    draw.text((54, 78), title, font=get_font(46, bold=True), fill="white")
    draw.text((56, 150), subtitle, font=get_font(26, bold=False), fill=(255, 255, 255, 220))
    for i, color in enumerate(CARD_COLORS[:6]):
        x = 58 + i * 64
        rounded_rect(draw, (x, 230, x + 46, 292), 8, color, "white", 2)
    draw.text((56, 324), "Temporary share image", font=get_font(22), fill=(255, 255, 255, 170))
    img.save(SHARE_DIR / name)


def main():
    """Generate all temporary PNG assets for local testing."""
    ensure_dirs()
    create_card_back()
    for index, color in enumerate(CARD_COLORS, start=1):
        create_card(index, color)
    create_logo()
    create_avatar()
    create_button("button-primary.png", "#667eea", "Primary")
    create_button("button-secondary.png", "#764ba2", "Secondary")
    create_button("button-danger.png", "#ef4444", "Danger")
    create_share_image("invite.png", "Flip Battle", "Join my room and play", "#312e81")
    create_share_image("result-bg.png", "Battle Result", "Share your score", "#111827")

    generated = list(CARD_DIR.glob("*.png")) + list(UI_DIR.glob("*.png")) + list(SHARE_DIR.glob("*.png"))
    print(f"Generated {len(generated)} temporary PNG assets.")
    for path in sorted(generated):
        print(path.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
