"""Generate and decode-check the public website QR using the installed OpenCV."""
from pathlib import Path
import cv2

URL = 'https://egz-gesture-studio.netlify.app'
params = cv2.QRCodeEncoder_Params()
params.correction_level = cv2.QRCodeEncoder_CORRECT_LEVEL_H
matrix = cv2.QRCodeEncoder_create(params).encode(URL)
matrix = cv2.copyMakeBorder(matrix, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
image = cv2.resize(matrix, None, fx=12, fy=12, interpolation=cv2.INTER_NEAREST)
detector = cv2.QRCodeDetector()
for size in [image.shape[0], 180]:
    preview = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA)
    decoded, _, _ = detector.detectAndDecode(preview)
    if decoded != URL:
        raise RuntimeError(f'QR round-trip failed at {size}px')
output = Path(__file__).resolve().parents[1] / 'docs/media/website-qr.png'
output.parent.mkdir(parents=True, exist_ok=True)
if not cv2.imwrite(str(output), image):
    raise OSError('QR image could not be written')
print('Website QR verified at full resolution and README display size.')
