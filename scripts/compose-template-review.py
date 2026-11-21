"""Lay out the screenshots from render-template-catalog.mjs and the library thumbnail atlas."""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

source = Path(sys.argv[1])
report = Path(sys.argv[2])
atlas_path = Path(sys.argv[3])
metrics = json.loads((source / 'metrics.json').read_text())
background = '#f1f1ec'
paper = '#ffffff'
ink = '#1c2925'
muted = '#52645b'
font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def fit(path, size):
    with Image.open(path) as image:
        return ImageOps.contain(image.convert('RGB'), size, Image.Resampling.LANCZOS)


atlas = Image.new('RGB', (6 * 144, 9 * 160), background)
samples = [entry for entry in metrics if not entry['adverse']]
for position, row in enumerate(samples):
    image = fit(source / f"sample-{row['id']}.jpg", (136, 152))
    atlas.paste(image, ((position % 6) * 144 + (144 - image.width) // 2,
                        (position // 6) * 160 + (160 - image.height) // 2))
atlas.save(atlas_path, 'WEBP', quality=84, method=6)

pages = []
for challenging in (False, True):
    rows = [entry for entry in metrics if entry['adverse'] == challenging and entry['id'] != 'sem-modelo']
    label = 'Amostra de estresse' if challenging else 'Cardápio de referência'
    for first in range(0, len(rows), 10):
        sheet = Image.new('RGB', (1920, 1358), background)
        draw = ImageDraw.Draw(sheet)
        draw.text((50, 34), 'AutoMenu  |  Catálogo v3', font=ImageFont.truetype(bold_path, 35), fill=ink)
        draw.text((52, 85), f'{label}  ·  Modelos {first + 1:02d}–{first + 10:02d}',
                  font=ImageFont.truetype(font_path, 24), fill=muted)
        for offset, row in enumerate(rows[first:first + 10]):
            x = 50 + (offset % 5) * 368
            y = 145 + (offset // 5) * 575
            draw.rounded_rectangle((x, y, x + 346, y + 555), radius=13, fill=paper)
            prefix = 'adverse' if challenging else 'sample'
            image = fit(source / f"{prefix}-{row['id']}.jpg", (326, 466))
            sheet.paste(image, (x + (346 - image.width) // 2, y + 10 + (466 - image.height) // 2))
            draw.text((x + 12, y + 488), f"{first + offset + 1:02d}  {row['name']}",
                      font=ImageFont.truetype(bold_path, 16), fill=ink)
            draw.text((x + 12, y + 518), f"Primeira página de {row['pages']}  ·  {row['products']} produtos no total",
                      font=ImageFont.truetype(font_path, 13), fill=muted)
        pages.append(sheet)

pages[0].save(report, 'PDF', save_all=True, append_images=pages[1:],
              resolution=150, title='AutoMenu | Biblioteca de modelos v2', quality=89)
