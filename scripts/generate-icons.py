from pathlib import Path

from PIL import Image, ImageColor, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "icons"

BASE_SIZE = 512
RENDER_SIZE = 2048

DESK = "#E8DDCB"
PAPER = "#FFF6E5"
RUST = "#A9573F"
TEAL = "#526560"
INK = "#302820"


def scaled(value: float, scale: float) -> int:
    return round(value * scale)


def scaled_box(box: tuple[float, float, float, float], scale: float) -> tuple[int, int, int, int]:
    return tuple(scaled(value, scale) for value in box)


def rounded_page(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    radius: float,
    fill: str,
    outline: str,
    width: float,
    scale: float,
) -> None:
    draw.rounded_rectangle(
        scaled_box(box, scale),
        radius=scaled(radius, scale),
        fill=fill,
        outline=outline,
        width=scaled(width, scale),
    )


def rounded_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    width: float,
    fill: str,
    scale: float,
) -> None:
    x1, y1 = start
    x2, y2 = end
    radius = width / 2
    draw.rounded_rectangle(
        scaled_box((x1 - radius, y1 - radius, x2 + radius, y2 + radius), scale),
        radius=scaled(radius, scale),
        fill=fill,
    )


def draw_waveform(
    draw: ImageDraw.ImageDraw,
    center: tuple[float, float],
    scale: float,
    compact: bool,
) -> None:
    center_x, center_y = center
    if compact:
        heights = [22, 42, 66, 88, 66, 42, 22]
        bar_width = 15
        step = 25
    else:
        heights = [12, 14, 24, 36, 50, 64, 78, 64, 50, 36, 24, 14, 12]
        bar_width = 8
        step = 15

    first_x = center_x - (len(heights) - 1) * step / 2
    radius = bar_width / 2
    for index, height in enumerate(heights):
        x = first_x + index * step
        draw.rounded_rectangle(
            scaled_box(
                (
                    x - radius,
                    center_y - height / 2,
                    x + radius,
                    center_y + height / 2,
                ),
                scale,
            ),
            radius=scaled(radius, scale),
            fill=INK,
        )


def draw_mark(draw: ImageDraw.ImageDraw, maskable: bool, compact: bool, scale: float) -> None:
    if maskable:
        # Every non-background pixel stays inside the W3C maskable safe circle.
        back_page = (138, 103, 396, 389)
        front_page = (116, 119, 380, 407)
        outline_width = 8
    elif compact:
        # The favicon uses fewer, heavier details so the motif survives at 32 px.
        back_page = (126, 78, 414, 396)
        front_page = (96, 105, 390, 430)
        outline_width = 16
    else:
        back_page = (126, 78, 414, 396)
        front_page = (96, 105, 390, 430)
        outline_width = 8

    rounded_page(draw, back_page, 20, TEAL, INK, outline_width, scale)
    rounded_page(draw, front_page, 18, PAPER, INK, outline_width, scale)

    left, top, right, bottom = front_page
    line_width = 14 if compact else 9

    if compact:
        rounded_line(draw, (left + 54, top + 82), (right - 44, top + 82), line_width, INK, scale)
        draw_waveform(draw, ((left + right) / 2, top + 176), scale, compact=True)
        rounded_line(draw, (left + 54, top + 254), (right - 82, top + 254), line_width, INK, scale)
        dot_radius = 19
        dot_center = (right - 47, bottom - 45)
    else:
        top_lines = [
            (top + 68, right - 40),
            (top + 102, right - 54),
            (top + 136, right - 38),
        ]
        for y, line_right in top_lines:
            rounded_line(draw, (left + 48, y), (line_right, y), line_width, INK, scale)

        draw_waveform(draw, ((left + right) / 2, top + 181), scale, compact=False)

        rounded_line(draw, (left + 48, top + 235), (right - 40, top + 235), line_width, INK, scale)
        rounded_line(draw, (left + 48, top + 270), (right - 78, top + 270), line_width, INK, scale)
        dot_radius = 14
        dot_center = (right - 32, bottom - 30)

    center_x, center_y = dot_center
    draw.ellipse(
        scaled_box(
            (
                center_x - dot_radius,
                center_y - dot_radius,
                center_x + dot_radius,
                center_y + dot_radius,
            ),
            scale,
        ),
        fill=RUST,
    )


def build_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = RENDER_SIZE / BASE_SIZE
    source = Image.new("RGB", (RENDER_SIZE, RENDER_SIZE), DESK)
    draw = ImageDraw.Draw(source)
    draw_mark(draw, maskable=maskable, compact=size <= 32, scale=scale)
    return source.resize((size, size), Image.Resampling.LANCZOS)


def validate_maskable_safe_zone(image: Image.Image) -> None:
    background = ImageColor.getrgb(DESK)
    center = image.width / 2
    safe_radius = image.width * 0.4
    outside_pixels = 0

    for y in range(image.height):
        for x in range(image.width):
            if (x + 0.5 - center) ** 2 + (y + 0.5 - center) ** 2 <= safe_radius**2:
                continue
            if image.getpixel((x, y)) != background:
                outside_pixels += 1

    if outside_pixels:
        raise ValueError(f"Maskable artwork exceeds the safe zone by {outside_pixels} pixels")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    icons = [
        ("favicon-v2-32.png", "favicon-32.png", 32, False),
        ("apple-touch-icon-v2.png", "apple-touch-icon.png", 180, False),
        ("icon-v2-192.png", "icon-192.png", 192, False),
        ("icon-v2-512.png", "icon-512.png", 512, False),
        ("icon-maskable-v2-512.png", "icon-maskable-512.png", 512, True),
    ]

    for name, legacy_name, size, maskable in icons:
        image = build_icon(size, maskable)
        if maskable:
            validate_maskable_safe_zone(image)
        image.save(OUTPUT / name, "PNG", optimize=True, compress_level=9)
        # Keep the prior URLs available while installed copies move to v2 paths.
        image.save(OUTPUT / legacy_name, "PNG", optimize=True, compress_level=9)

    print(f"Generated Stem tussen de regels icons in {OUTPUT}")


if __name__ == "__main__":
    main()
