import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_use_onednn", "0")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


def rect_from_points(points):
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    x = min(xs)
    y = min(ys)
    return {"x": x, "y": y, "w": max(xs) - x, "h": max(ys) - y}


def main():
    parser = argparse.ArgumentParser(description="Run PaddleOCR for one image and print JSON.")
    parser.add_argument("image", nargs="?", help="Image path")
    parser.add_argument("--lang", default="th", help="PaddleOCR language, default th")
    parser.add_argument("--device", default="gpu", help="PaddleOCR device, for example gpu, gpu:0, or cpu")
    args = parser.parse_args()

    if not args.image:
        parser.print_help()
        return 0

    image_path = Path(args.image)
    if not image_path.exists():
        print(json.dumps({"ok": False, "error": f"Image not found: {image_path}"}))
        return 1

    try:
        from paddleocr import PaddleOCR
        from PIL import Image

        with Image.open(image_path) as img:
            width, height = img.size

        try:
            ocr = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                lang=args.lang,
                device=args.device,
            )
            result = ocr.predict(str(image_path))
        except TypeError:
            use_gpu = str(args.device).lower().startswith("gpu")
            ocr = PaddleOCR(use_angle_cls=True, lang=args.lang, use_gpu=use_gpu)
            result = ocr.ocr(str(image_path), cls=True)
        boxes = []

        for page in result or []:
            if isinstance(page, dict) and "rec_texts" in page:
                texts = page.get("rec_texts") or []
                scores = page.get("rec_scores") or []
                polys = page.get("rec_polys") or page.get("dt_polys") or []
                for idx, text_value in enumerate(texts):
                    text = str(text_value).strip()
                    if not text:
                        continue
                    polygon = polys[idx].tolist() if hasattr(polys[idx], "tolist") else polys[idx]
                    confidence = float(scores[idx]) if idx < len(scores) else 0.0
                    bbox_px = rect_from_points(polygon)
                    boxes.append({
                        "text": text,
                        "confidence": confidence,
                        "bbox_px": bbox_px,
                        "bbox": {
                            "x": bbox_px["x"] / width if width else 0,
                            "y": bbox_px["y"] / height if height else 0,
                            "w": bbox_px["w"] / width if width else 0,
                            "h": bbox_px["h"] / height if height else 0
                        },
                        "polygon": polygon
                    })
                continue

            for item in page or []:
                if not item or len(item) < 2:
                    continue
                polygon = item[0]
                text_info = item[1]
                text = str(text_info[0]).strip() if text_info else ""
                confidence = float(text_info[1]) if len(text_info) > 1 else 0.0
                if not text:
                    continue
                bbox_px = rect_from_points(polygon)
                boxes.append({
                    "text": text,
                    "confidence": confidence,
                    "bbox_px": bbox_px,
                    "bbox": {
                        "x": bbox_px["x"] / width if width else 0,
                        "y": bbox_px["y"] / height if height else 0,
                        "w": bbox_px["w"] / width if width else 0,
                        "h": bbox_px["h"] / height if height else 0
                    },
                    "polygon": polygon
                })

        print(json.dumps({"ok": True, "engine": "paddleocr", "width": width, "height": height, "boxes": boxes}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
