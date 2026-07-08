import { NextResponse } from "next/server";
import {
  getOzonCategoryById,
  listOzonCategoryGroups,
  listOzonCategoryParents,
  listOzonCategoryTypes,
  searchOzonCategories,
} from "@/lib/unit-economics/ozon/tariffs";
import {
  getWbCategoryById,
  listWbCategoryGroups,
  listWbCategoryParents,
  listWbCategoryTypes,
  searchWbCategories,
} from "@/lib/unit-economics/wb/tariffs";

function isWb(marketplace: string | null): boolean {
  return marketplace === "wildberries" || marketplace === "wb";
}

/** GET: поиск и навигация по типам товара Ozon / Wildberries. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const marketplace = searchParams.get("marketplace");
  const q = searchParams.get("q") ?? "";
  const id = searchParams.get("id");
  const browse = searchParams.get("browse");
  const wb = isWb(marketplace);

  if (id) {
    const item = wb ? getWbCategoryById(id) : getOzonCategoryById(id);
    if (!item) {
      return NextResponse.json({ success: false, error: "Категория не найдена" }, { status: 404 });
    }
    return NextResponse.json({ success: true, item });
  }

  if (browse === "parents") {
    return NextResponse.json({
      success: true,
      level: "parents",
      items: wb ? listWbCategoryParents() : listOzonCategoryParents(),
    });
  }

  if (browse === "groups") {
    const parent = searchParams.get("parent")?.trim();
    if (!parent) {
      return NextResponse.json({ success: false, error: "Укажите parent" }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      level: "groups",
      parent,
      items: wb ? listWbCategoryGroups(parent) : listOzonCategoryGroups(parent),
    });
  }

  if (browse === "types") {
    const parent = searchParams.get("parent")?.trim();
    const group = searchParams.get("group")?.trim();
    if (!parent || !group) {
      return NextResponse.json({ success: false, error: "Укажите parent и group" }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      level: "types",
      parent,
      group,
      items: wb ? listWbCategoryTypes(parent, group) : listOzonCategoryTypes(parent, group),
    });
  }

  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 30));
  const items = wb ? searchWbCategories(q, limit) : searchOzonCategories(q, limit);
  return NextResponse.json({ success: true, items });
}
