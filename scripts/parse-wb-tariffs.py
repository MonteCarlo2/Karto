# -*- coding: utf-8 -*-
"""Parse Wildberries commission PDF → JSON for unit economics calculator."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "data" / "wb-tariffs" / "KVV_Wildberries_ru_20260630.pdf"
OUT = ROOT / "src" / "lib" / "unit-economics" / "data" / "wb"

ROW_END = re.compile(
    r"(\d+[,.]?\d*)\s+"
    r"(\d+[,.]?\d*)\s+"
    r"(\d+[,.]?\d*)\s+"
    r"(\d+[,.]?\d*)\s+"
    r"(\d+[,.]?\d*)\s+"
    r"(\d+[,.]?\d*)\s*$"
)
EFFECTIVE_RE = re.compile(r"(\d{1,2})\s+\S+\s+(\d{4})", re.I)


def parse_pct(raw: str) -> float:
    s = raw.strip().replace(",", ".")
    if not s:
        return 0.0
    if s.endswith("."):
        s += "0"
    return round(float(s), 3)


def slugify(*parts: str) -> str:
    raw = "|".join(p.strip().lower() for p in parts if p and str(p).strip())
    raw = raw.replace("ё", "е")
    raw = re.sub(r"[^a-z0-9а-я|]+", "-", raw, flags=re.I)
    raw = re.sub(r"-+", "-", raw).strip("-")
    return raw[:180] or "unknown"


def split_name(full_name: str, parent_hint: str) -> tuple[str, str, str]:
    text = re.sub(r"\s+", " ", full_name.strip())
    if not text:
        return parent_hint or "Прочее", parent_hint or "Прочее", "Товар"

    if parent_hint and text.startswith(parent_hint):
        product = text[len(parent_hint) :].strip(" ·-")
        if product:
            return parent_hint, parent_hint, product

    if " · " in text:
        parts = [p.strip() for p in text.split(" · ") if p.strip()]
        if len(parts) >= 3:
            return parts[0], parts[1], parts[-1]
        if len(parts) == 2:
            return parts[0], parts[0], parts[1]

    words = text.split()
    if len(words) >= 4:
        mid = max(2, len(words) // 2)
        parent = " ".join(words[:mid])
        product = " ".join(words[mid:])
        return parent, parent, product

    if parent_hint:
        return parent_hint, parent_hint, text

    return text, text, text


def extract_effective_from(text: str, source_name: str = "") -> str:
    m = EFFECTIVE_RE.search(text)
    if m:
        day, year = m.group(1), m.group(2)
        month = "06"
        lower = text.lower()
        if "июл" in lower:
            month = "07"
        elif "авг" in lower:
            month = "08"
        elif "мая" in lower or "май" in lower:
            month = "05"
        return f"{year}-{month}-{int(day):02d}"

    name = source_name.lower()
    if "202607" in name or "20260707" in name:
        return "2026-07-07"
    if "20260630" in name:
        return "2026-07-07"
    return "2026-07-07"


def parse_categories(path: Path) -> dict:
    reader = PdfReader(str(path))
    header_text = reader.pages[0].extract_text() or ""
    effective_from = extract_effective_from(header_text, path.name)

    items: list[dict] = []
    seen: set[str] = set()
    parent_hint = ""
    buffer = ""

    skip_markers = (
        "название родителя",
        "склад wb",
        "fbw",
        "fbs",
        "действует",
        "коэффициент",
        "вознагражден",
    )

    for page in reader.pages:
        for raw_line in (page.extract_text() or "").split("\n"):
            line = raw_line.strip().replace("\u00a0", " ")
            if not line:
                continue
            lower = line.lower()
            if any(marker in lower for marker in skip_markers):
                continue

            candidate = f"{buffer} {line}".strip() if buffer else line
            match = ROW_END.search(candidate.replace("\n", " "))
            if match:
                full_name = candidate[: match.start()].strip(" ·")
                pcts = [parse_pct(match.group(i)) for i in range(1, 7)]
                if pcts[0] > 80 or pcts[1] > 80:
                    buffer = candidate
                    continue

                parent_name, category_name, product_name = split_name(full_name, parent_hint)
                parent_hint = parent_name
                item_id = slugify(parent_name, category_name, product_name)
                if item_id in seen:
                    item_id = f"{item_id}-{len(items)}"
                seen.add(item_id)

                items.append(
                    {
                        "id": item_id,
                        "parentName": parent_name,
                        "categoryName": category_name,
                        "name": product_name,
                        "label": f"{parent_name} · {category_name} · {product_name}",
                        "commissionFbw": pcts[0],
                        "commissionFbs": pcts[1],
                    }
                )
                buffer = ""
            elif re.search(r"\d", line):
                buffer = candidate
            else:
                if len(line) > 2:
                    parent_hint = f"{parent_hint} {line}".strip() if parent_hint else line
                buffer = ""

    return {
        "effectiveFrom": effective_from,
        "sourceFile": path.name,
        "count": len(items),
        "items": items,
    }


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        print(f"File not found: {src}", file=sys.stderr)
        print("Place PDF at data/wb-tariffs/KVV_Wildberries_ru_20260630.pdf", file=sys.stderr)
        sys.exit(1)

    OUT.mkdir(parents=True, exist_ok=True)
    categories = parse_categories(src)

    meta_path = OUT / "meta.json"
    existing_meta = {}
    if meta_path.exists():
        existing_meta = json.loads(meta_path.read_text(encoding="utf-8"))

    meta = {
        "commissionsEffectiveFrom": categories["effectiveFrom"],
        "commissionSource": categories["sourceFile"],
        "categoryCount": categories["count"],
        "logisticsEffectiveFrom": existing_meta.get("logisticsEffectiveFrom"),
        "logisticsSource": existing_meta.get("logisticsSource"),
        "defaultCategoryId": "хозяйственные-товары|хозяйственные-товары|ведра-хозяйственные",
        "defaultWarehouseId": existing_meta.get("defaultWarehouseId", "volgograd"),
        "acquiringIncludedInCommission": True,
        "models": {
            "fbw": {"label": "FBO (FBW)", "description": "Склад Wildberries"},
            "fbs": {"label": "FBS (Маркетплейс)", "description": "Со склада продавца"},
        },
    }

    (OUT / "categories.json").write_text(
        json.dumps(categories, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"categories={categories['count']} effectiveFrom={categories['effectiveFrom']}")
    print(f"written -> {OUT}")


if __name__ == "__main__":
    main()
