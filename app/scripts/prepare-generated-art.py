"""Encode the reviewed image_gen outputs as WebP; originals stay in generated_images."""
from pathlib import Path
from PIL import Image, ImageStat

root = Path(__file__).resolve().parents[1]
source = Path.home() / '.codex/generated_images/01a177a7-6808-7852-9b62-846a6907f855'
files = {
    'roles/civilian': 'exec-8d739dee-b7fa-4ea6-8445-acdeca8b4c33.png',
    'roles/mafia': 'exec-2b3e02d0-3580-4708-98f1-34dbd3e6a84c.png',
    'roles/don': 'exec-72c5d58d-e6e2-469f-bc24-26b4fc91882a.png',
    'roles/commissar': 'exec-edeb7a1f-892b-4a4e-8325-97917739fa0e.png',
    'roles/doctor': 'exec-b77f9b64-d195-464f-b2ca-b4cd7e104394.png',
    'roles/lover': 'exec-7ce45df6-fd80-42a9-aaee-6c4cf7e11cd7.png',
    'roles/maniac': 'exec-56baa128-3bbf-43ec-9b27-b0cb7570de39.png',
    'textures/paper': 'exec-e5b7a1b3-688e-4602-a410-4de708dc31cc.png',
    'textures/cardboard': 'exec-5c95549b-4978-402b-a61d-cd94cf1f2f36.png',
}
for name, filename in files.items():
    target = root / 'src/assets' / f'{name}.webp'
    if target.exists():
        raise SystemExit(f'Refusing to overwrite {target}')
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source / filename) as image:
        image.convert('RGB').save(target, 'WEBP', quality=85, method=6)
        print(f'{name}: {image.size}, {target.stat().st_size // 1024} KiB')
