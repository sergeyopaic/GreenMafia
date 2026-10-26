"""Rasterize the native GreenMafia emblem for PWA installation."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / 'public/assets/brand'
out.mkdir(parents=True, exist_ok=True)
for name, size, factor in [('icon-192.png', 192, 1), ('icon-512.png', 512, 1), ('icon-maskable.png', 512, .78)]:
    scale = 4
    im = Image.new('RGB', (size * scale, size * scale), '#08160f')
    d = ImageDraw.Draw(im)
    def point(x, y):
        return ((128 + (x - 128) * factor) / 256 * size * scale, (128 + (y - 128) * factor) / 256 * size * scale)
    for radius, width in [(111, 7), (98, 2)]:
        d.ellipse([*point(128-radius,128-radius), *point(128+radius,128+radius)], outline='#b4894a', width=max(1, round(width * size * scale / 256 * factor)))
    d.polygon([point(x,y) for x,y in [(65,183),(65,77),(87,77),(128,132),(169,77),(191,77),(191,183),(166,183),(166,118),(128,167),(90,118),(90,183)]], fill='#eee4cd')
    d.polygon([point(x,y) for x,y in [(128,35),(133,46),(128,57),(123,46)]], fill='#b9d94a')
    im.resize((size,size), Image.Resampling.LANCZOS).save(out / name)
print('Generated 3 app icons from the GreenMafia emblem.')
