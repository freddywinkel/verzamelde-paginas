from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "icons"

DESK = "#E8DDCB"
PAPER = "#FFF6E5"
PAPER_DEEP = "#D8C7B1"
RUST = "#A9573F"
TEAL = "#526560"
INK = "#302820"


def rounded_page(draw, box, radius, fill, outline, width):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def build_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = size / 512
    image = Image.new("RGB", (size, size), TEAL if maskable else DESK)
    draw = ImageDraw.Draw(image)

    if not maskable:
        draw.ellipse(
            [int(-80 * scale), int(-60 * scale), int(270 * scale), int(290 * scale)],
            fill="#E2C9B5",
        )
        draw.ellipse(
            [int(285 * scale), int(150 * scale), int(620 * scale), int(500 * scale)],
            fill="#D0D8CF",
        )

    margin = 108 if maskable else 82
    page = [int(margin * scale), int(76 * scale), int((512 - margin) * scale), int(436 * scale)]
    offset = int(20 * scale)
    radius = max(2, int(11 * scale))
    line = max(1, int(4 * scale))

    rounded_page(draw, [page[0] + offset, page[1] - offset, page[2] + offset, page[3] - offset], radius, RUST, INK, line)
    rounded_page(draw, [page[0] - offset, page[1] + offset, page[2] - offset, page[3] + offset], radius, PAPER_DEEP, INK, line)
    rounded_page(draw, page, radius, PAPER, INK, line)

    tape_width = int(125 * scale)
    tape_height = max(4, int(28 * scale))
    tape_left = int(278 * scale)
    draw.rounded_rectangle(
        [tape_left, int(65 * scale), tape_left + tape_width, int(65 * scale) + tape_height],
        radius=max(1, int(3 * scale)),
        fill="#7F9992",
    )

    x1 = int(158 * scale)
    x2 = int(355 * scale)
    y = int(190 * scale)
    ink_width = max(2, int(7 * scale))
    for ratio in [1.0, 0.82, 0.93, 0.64, 0.76]:
        draw.line([x1, y, x1 + int((x2 - x1) * ratio), y], fill=INK, width=ink_width)
        y += int(39 * scale)
    draw.ellipse(
        [int(333 * scale), int(356 * scale), int(371 * scale), int(394 * scale)],
        fill=RUST,
        outline=INK,
        width=max(1, int(3 * scale)),
    )
    return image


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, size, maskable in [
        ("favicon-32.png", 32, False),
        ("apple-touch-icon.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]:
        build_icon(size, maskable).save(OUTPUT / name, "PNG", optimize=True)
    print(f"Generated icons in {OUTPUT}")


if __name__ == "__main__":
    main()
