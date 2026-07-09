import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_use_onednn", "0")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

SERVER_PREFIX = "ORDERLEDGER_PADDLE_JSON "


def rect_from_points(points):
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    x = min(xs)
    y = min(ys)
    return {"x": x, "y": y, "w": max(xs) - x, "h": max(ys) - y}


def emit(payload, prefixed=False):
    prefix = SERVER_PREFIX if prefixed else ""
    print(prefix + json.dumps(payload, ensure_ascii=False), flush=True)


def make_ocr_on_device(lang, device):
    from paddleocr import PaddleOCR

    try:
        return PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            lang=lang,
            device=device,
        )
    except TypeError:
        use_gpu = str(device).lower().startswith("gpu")
        return PaddleOCR(use_angle_cls=True, lang=lang, use_gpu=use_gpu)


def make_ocr(lang, device):
    """Returns (ocr, actual_device). A GPU env with broken CUDA DLLs can either raise or
    hard-crash the process; when it raises we retry once on CPU instead of failing the run."""
    try:
        return make_ocr_on_device(lang, device), device
    except Exception:
        if str(device).lower().startswith("gpu"):
            return make_ocr_on_device(lang, "cpu"), "cpu"
        raise


def predict(ocr, image_path):
    try:
        return ocr.predict(str(image_path))
    except AttributeError:
        return ocr.ocr(str(image_path), cls=True)


def extract_boxes(ocr, image_path):
    from PIL import Image

    with Image.open(image_path) as img:
        width, height = img.size

    result = predict(ocr, image_path)
    boxes = []

    for page in result or []:
        if isinstance(page, dict) and "rec_texts" in page:
            texts = page.get("rec_texts") or []
            scores = page.get("rec_scores") or []
            polys = page.get("rec_polys") or page.get("dt_polys") or []
            for idx, text_value in enumerate(texts):
                text = str(text_value).strip()
                if not text or idx >= len(polys):
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

    return {"ok": True, "engine": "paddleocr", "width": width, "height": height, "boxes": boxes}


def run_single(args):
    if not args.image:
        return 0

    image_path = Path(args.image)
    if not image_path.exists():
        emit({"ok": False, "error": f"Image not found: {image_path}"})
        return 1

    try:
        ocr, _device = make_ocr(args.lang, args.device)
        emit(extract_boxes(ocr, image_path))
        return 0
    except Exception as exc:
        emit({"ok": False, "error": str(exc)})
        return 1


def run_server(args):
    try:
        ocr, device = make_ocr(args.lang, args.device)
        emit({"ok": True, "ready": True, "engine": "paddleocr", "lang": args.lang, "device": device}, True)
    except Exception as exc:
        emit({"ok": False, "ready": False, "error": str(exc)}, True)
        return 1

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            image_path = Path(str(request.get("image") or ""))
            if not image_path.exists():
                raise FileNotFoundError(f"Image not found: {image_path}")
            payload = extract_boxes(ocr, image_path)
            payload["id"] = request_id
            emit(payload, True)
        except Exception as exc:
            emit({"ok": False, "id": request_id, "error": str(exc)}, True)

    return 0


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="Run PaddleOCR for one image or as a persistent JSON worker.")
    parser.add_argument("image", nargs="?", help="Image path")
    parser.add_argument("--server", action="store_true", help="Keep PaddleOCR loaded and process JSON lines from stdin")
    parser.add_argument("--lang", default="th", help="PaddleOCR language, default th")
    parser.add_argument("--device", default="gpu", help="PaddleOCR device, for example gpu, gpu:0, or cpu")
    args = parser.parse_args()

    if args.server:
        return run_server(args)

    if not args.image:
        parser.print_help()
        return 0

    return run_single(args)


if __name__ == "__main__":
    sys.exit(main())
