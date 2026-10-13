"""Compare a rendered invoice to Cadi's template at 791x1024.

Usage:
  python3 scripts/invoice-overlay.py template.png ours.png out-prefix
Writes:
  {prefix}-overlay.png  ours at 50% over the template
  {prefix}-diff.png     absolute difference, contrast stretched
  {prefix}-sbs.png      template | ours
"""

import sys
from PIL import Image
import numpy as np

FRAME = (791, 1024)


def load(path: str) -> Image.Image:
    image = Image.open(path).convert("RGB")
    if image.size != FRAME:
        image = image.resize(FRAME, Image.Resampling.LANCZOS)
    return image


def main() -> None:
    template_path, ours_path, prefix = sys.argv[1:4]
    template = load(template_path)
    ours = load(ours_path)
    overlay = Image.blend(template, ours, 0.5)
    diff = np.abs(np.array(template).astype(np.int16) - np.array(ours).astype(np.int16))
    mean = float(diff.mean())
    stretched = np.clip(diff * 3, 0, 255).astype(np.uint8)
    diff_image = Image.fromarray(stretched)
    gap = Image.new("RGB", (16, FRAME[1]), (255, 255, 255))
    side = Image.new("RGB", (FRAME[0] * 2 + 16, FRAME[1]), (255, 255, 255))
    side.paste(template, (0, 0))
    side.paste(gap, (FRAME[0], 0))
    side.paste(ours, (FRAME[0] + 16, 0))
    overlay.save(f"{prefix}-overlay.png")
    diff_image.save(f"{prefix}-diff.png")
    side.save(f"{prefix}-sbs.png")
    print(f"mean abs {mean:.2f}  overlay {overlay.size}  sbs {side.size}")


if __name__ == "__main__":
    main()
