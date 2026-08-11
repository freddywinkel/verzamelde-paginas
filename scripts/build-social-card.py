from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "og-background.png"
OUTPUT = ROOT / "public" / "og.jpg"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    windows_font = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(windows_font), size=size)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    canvas = ImageOps.fit(source, (1200, 630), method=Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(canvas, "RGBA")

    # A quiet paper veil keeps deterministic typography readable while retaining texture.
    for x in range(0, 700):
        alpha = int(85 * (1 - x / 700))
        draw.line([(x, 0), (x, 630)], fill=(255, 246, 229, max(0, alpha)))

    mono = font("consola.ttf", 18)
    display = font("georgia.ttf", 69)
    body = font("arial.ttf", 24)
    body_bold = font("arialbd.ttf", 22)

    rust = (142, 73, 55, 255)
    ink = (48, 40, 32, 255)
    muted = (82, 101, 96, 255)

    draw.text((76, 104), "PRIVÉ  ·  OFFLINE  ·  VAN JOU", font=mono, fill=rust)
    draw.rounded_rectangle((76, 144, 173, 150), radius=3, fill=rust)
    draw.text((72, 180), "Freddo's", font=display, fill=ink)
    draw.text((72, 258), "Mementos", font=display, fill=ink)
    draw.text((77, 371), "Een privéarchief voor gedichten,", font=body, fill=muted)
    draw.text((77, 407), "versies en je eigen stem.", font=body, fill=muted)

    draw.rounded_rectangle(
        (76, 494, 292, 544),
        radius=3,
        outline=(82, 101, 96, 220),
        width=2,
        fill=(255, 246, 229, 105),
    )
    draw.text((98, 508), "PRIVÉARCHIEF", font=body_bold, fill=muted)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"Built {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
