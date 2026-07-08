"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { UE } from "@/components/unit-economics/unit-economics-ui";
import { cn } from "@/lib/utils";

type CategoryItem = {
  id: string;
  label: string;
  name: string;
  parentName?: string;
  categoryName?: string;
  commissionFbw?: number;
  commissionFbs?: number;
};

type BrowseEntry = {
  label: string;
  count: number;
};

type Props = {
  categoryId: string;
  onChange: (categoryId: string) => void;
  marketplace?: "ozon" | "wildberries";
};

function apiMarketplace(marketplace: "ozon" | "wildberries"): string {
  return marketplace === "wildberries" ? "wildberries" : "ozon";
}

function withMarketplace(url: string, marketplace: "ozon" | "wildberries"): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}marketplace=${apiMarketplace(marketplace)}`;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const tokens = useMemo(
    () =>
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length),
    [query]
  );

  if (!tokens.length) return <>{text}</>;

  const lower = text.toLowerCase();
  const ranges: { start: number; end: number }[] = [];

  for (const token of tokens) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(token, from);
      if (idx < 0) break;
      ranges.push({ start: idx, end: idx + token.length });
      from = idx + token.length;
    }
  }

  if (!ranges.length) return <>{text}</>;

  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, i) => {
    if (cursor < range.start) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark
        key={`${range.start}-${i}`}
        className="rounded-[2px] bg-[rgba(185,255,75,0.55)] px-0.5 font-semibold text-inherit"
      >
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

export function OzonCategorySearch({ categoryId, onChange, marketplace = "ozon" }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CategoryItem | null>(null);
  const [searchItems, setSearchItems] = useState<CategoryItem[]>([]);
  const [browseEntries, setBrowseEntries] = useState<BrowseEntry[]>([]);
  const [browseTypes, setBrowseTypes] = useState<CategoryItem[]>([]);
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseGroup, setBrowseGroup] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isEditing, setIsEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const trimmedQuery = query.trim();
  const isSearchMode = trimmedQuery.length >= 1;
  const browseLevel = browseGroup ? "types" : browseParent ? "groups" : "parents";
  const listLength = isSearchMode
    ? searchItems.length
    : browseLevel === "types"
      ? browseTypes.length
      : browseEntries.length;

  useEffect(() => {
    if (!categoryId) {
      setSelected(null);
      if (!isEditing) setQuery("");
      return;
    }
    let cancelled = false;
    fetch(withMarketplace(`/api/unit-economics/categories?id=${encodeURIComponent(categoryId)}`, marketplace))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.success || !data.item) return;
        setSelected(data.item);
        if (!isEditing) setQuery(data.item.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [categoryId, isEditing, marketplace]);

  const loadBrowse = useCallback(
    async (parent: string | null, group: string | null, signal?: AbortSignal) => {
      setLoading(true);
      setFetchError(null);
      try {
        let url = withMarketplace("/api/unit-economics/categories?browse=parents", marketplace);
        if (parent && !group) {
          url = withMarketplace(
            `/api/unit-economics/categories?browse=groups&parent=${encodeURIComponent(parent)}`,
            marketplace
          );
        } else if (parent && group) {
          url = withMarketplace(
            `/api/unit-economics/categories?browse=types&parent=${encodeURIComponent(parent)}&group=${encodeURIComponent(group)}`,
            marketplace
          );
        }

        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (signal?.aborted) return;

        if (parent && group) {
          setBrowseTypes(data.success ? data.items : []);
          setBrowseEntries([]);
        } else {
          const entries: BrowseEntry[] = data.success ? data.items : [];
          setBrowseEntries(entries);
          setBrowseTypes([]);
          if (
            marketplace === "wildberries" &&
            parent &&
            !group &&
            entries.length === 1
          ) {
            setBrowseGroup(entries[0].label);
          }
        }
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setFetchError("Не удалось загрузить категории. Проверьте соединение и попробуйте снова.");
        setBrowseEntries([]);
        setBrowseTypes([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [marketplace]
  );

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setSearchItems([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        withMarketplace(
          `/api/unit-economics/categories?q=${encodeURIComponent(trimmed)}&limit=24`,
          marketplace
        ),
        { signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (signal?.aborted) return;
      setSearchItems(data.success ? data.items : []);
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setFetchError("Не удалось выполнить поиск. Проверьте соединение и попробуйте снова.");
      setSearchItems([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [marketplace]);

  useEffect(() => {
    if (!open || !isEditing) return;

    const controller = new AbortController();

    if (isSearchMode) {
      const timer = setTimeout(() => {
        void search(query, controller.signal);
      }, 150);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }

    void loadBrowse(browseParent, browseGroup, controller.signal);
    return () => controller.abort();
  }, [query, open, isEditing, isSearchMode, browseParent, browseGroup, search, loadBrowse]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setIsEditing(false);
        setActiveIndex(-1);
        if (selected) setQuery(selected.name);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [selected]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const showDropdown = open && isEditing;

  const pickItem = (item: CategoryItem) => {
    onChange(item.id);
    setSelected(item);
    setQuery(item.name);
    setIsEditing(false);
    setOpen(false);
    setActiveIndex(-1);
    setBrowseParent(null);
    setBrowseGroup(null);
    inputRef.current?.blur();
  };

  const openBrowse = (parent: string | null = null, group: string | null = null) => {
    setFetchError(null);
    setBrowseParent(parent);
    setBrowseGroup(group);
    setIsEditing(true);
    setOpen(true);
    setActiveIndex(-1);
  };

  const startEditing = () => {
    openBrowse(null, null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (query) inputRef.current?.select();
    });
  };

  const clearCategory = () => {
    onChange("");
    setSelected(null);
    setQuery("");
    setSearchItems([]);
    openBrowse(null, null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const goBrowseRoot = () => {
    setBrowseParent(null);
    setBrowseGroup(null);
    setActiveIndex(-1);
  };

  const goBrowseParent = () => {
    setBrowseGroup(null);
    setActiveIndex(-1);
  };

  const drillBrowseEntry = (label: string, count?: number) => {
    if (browseLevel === "parents") {
      setBrowseParent(label);
      if (marketplace === "wildberries" && count === 1) {
        setBrowseGroup(label);
      } else {
        setBrowseGroup(null);
      }
    } else if (browseLevel === "groups") {
      setBrowseGroup(label);
    }
    setActiveIndex(-1);
  };

  const activateRow = (index: number) => {
    if (isSearchMode) {
      const item = searchItems[index];
      if (item) pickItem(item);
      return;
    }
    if (browseLevel === "types") {
      const item = browseTypes[index];
      if (item) pickItem(item);
      return;
    }
    const entry = browseEntries[index];
    if (entry) drillBrowseEntry(entry.label, entry.count);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        startEditing();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (listLength === 0) return;
      setActiveIndex((i) => Math.min(i + 1, listLength - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (listLength === 0) return;
      activateRow(activeIndex >= 0 ? activeIndex : 0);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setIsEditing(false);
      setActiveIndex(-1);
      if (selected) setQuery(selected.name);
    }
    if (e.key === "Backspace" && !isSearchMode && browseGroup) {
      goBrowseParent();
    }
  };

  const showClear = Boolean(categoryId || query);

  return (
    <div
      ref={rootRef}
      className="rounded-[14px] border-2 p-3.5 transition-shadow"
      style={{
        borderColor: open ? UE.greenPayout : UE.lime,
        backgroundColor: "rgba(185, 255, 75, 0.07)",
        boxShadow: open
          ? "0 0 0 3px rgba(185, 255, 75, 0.35), 0 4px 20px -6px rgba(31, 78, 61, 0.15)"
          : "0 2px 12px -4px rgba(31, 78, 61, 0.08)",
      }}
    >
      <div className="mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: UE.green }}>
          Категория
        </span>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
          strokeWidth={2.25}
          style={{ color: UE.textMuted }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsEditing(true);
            setOpen(true);
            setActiveIndex(-1);
            if (e.target.value.trim()) {
              setBrowseParent(null);
              setBrowseGroup(null);
            }
          }}
          onFocus={startEditing}
          onKeyDown={onKeyDown}
          placeholder="Введите название или выберите по разделам"
          className={cn(
            "w-full rounded-[10px] border bg-white py-3 pl-10 text-base font-medium outline-none transition",
            "border-black/10 pr-16 focus:border-black/25 focus:bg-white"
          )}
          style={{ color: UE.text }}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {showClear ? (
            <button
              type="button"
              onClick={clearCategory}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-black/40 transition hover:bg-black/[0.05] hover:text-black/70"
              aria-label="Сбросить категорию"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : startEditing())}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-black/40 transition hover:bg-black/[0.05] hover:text-black/70"
            aria-label={open ? "Свернуть список" : "Открыть список"}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform duration-200", open ? "rotate-180" : "")}
              strokeWidth={2.25}
            />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showDropdown ? (
          <motion.div
            key="category-dropdown"
            initial={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.22, bounce: 0 }}
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-[14px] border border-black/[0.08] bg-white shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.04)]"
            role="presentation"
          >
            {!isSearchMode && (browseParent || browseGroup) ? (
              <div
                className="flex flex-wrap items-center gap-1 border-b border-[#F0F0F0] px-3.5 py-2.5 text-xs"
                style={{ color: UE.textMuted }}
              >
                <button
                  type="button"
                  className="font-semibold transition hover:text-black"
                  onClick={goBrowseRoot}
                >
                  Все разделы
                </button>
                {browseParent ? (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-40" strokeWidth={2.5} />
                    <button
                      type="button"
                      className={cn(
                        "font-semibold transition hover:text-black",
                        browseGroup ? "" : "text-black"
                      )}
                      style={browseGroup ? undefined : { color: UE.text }}
                      onClick={goBrowseParent}
                    >
                      {browseParent}
                    </button>
                  </>
                ) : null}
                {browseGroup ? (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-40" strokeWidth={2.5} />
                    <span className="font-semibold text-black">{browseGroup}</span>
                  </>
                ) : null}
              </div>
            ) : null}

            {!isSearchMode && browseLevel === "parents" && !fetchError ? (
              <div
                className="border-b border-[#F0F0F0] px-4 py-2.5 text-sm leading-relaxed"
                style={{ color: UE.textMuted }}
              >
                {marketplace === "wildberries"
                  ? "Начните вводить название товара — так проще, чем по разделам. Комиссии FBW/FBS показываем в результатах поиска."
                  : "Проще всего — начните вводить название товара. Или выберите раздел ниже."}
              </div>
            ) : null}

            <ul ref={listRef} className="max-h-[min(320px,50vh)] overflow-auto py-1.5" role="listbox">
              {fetchError ? (
                <li className="px-4 py-3">
                  <p className="text-sm text-red-600">{fetchError}</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold transition hover:opacity-80"
                    style={{ color: UE.green }}
                    onClick={() => {
                      setFetchError(null);
                      if (isSearchMode) void search(query);
                      else void loadBrowse(browseParent, browseGroup);
                    }}
                  >
                    Повторить
                  </button>
                </li>
              ) : null}

              {!fetchError && loading ? (
                <li className="px-4 py-3 text-sm" style={{ color: UE.textMuted }}>
                  {isSearchMode ? "Ищем тип товара…" : "Загружаем разделы…"}
                </li>
              ) : null}

              {!fetchError && !loading && isSearchMode && searchItems.length === 0 ? (
                <li className="px-4 py-3">
                  <p className="text-sm leading-relaxed" style={{ color: UE.textMuted }}>
                    Ничего не нашли по запросу «{trimmedQuery}».
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold transition hover:opacity-80"
                    style={{ color: UE.green }}
                    onClick={() => {
                      setQuery("");
                      openBrowse(null, null);
                    }}
                  >
                    Выбрать по разделам
                  </button>
                </li>
              ) : null}

              {!fetchError && !loading && !isSearchMode && browseLevel !== "types" && browseEntries.length === 0 ? (
                <li className="px-4 py-3 text-sm" style={{ color: UE.textMuted }}>
                  Разделы не найдены
                </li>
              ) : null}

              {!fetchError && !loading && isSearchMode
                ? searchItems.map((item, index) => {
                    const isSelected = item.id === categoryId;
                    const isActive = index === activeIndex;
                    const breadcrumb = [item.parentName, item.categoryName].filter(Boolean).join(" · ");

                    return (
                      <li key={item.id} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition",
                            isActive || isSelected
                              ? "bg-[rgba(185,255,75,0.18)]"
                              : "hover:bg-[#FAFAF8]"
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => pickItem(item)}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-[15px] font-semibold leading-snug"
                              style={{ color: UE.text }}
                            >
                              <HighlightMatch text={item.name} query={query} />
                            </div>
                            {breadcrumb ? (
                              <div
                                className="mt-0.5 text-xs leading-snug"
                                style={{ color: UE.textMuted }}
                              >
                                <HighlightMatch text={breadcrumb} query={query} />
                              </div>
                            ) : null}
                            {marketplace === "wildberries" &&
                            item.commissionFbw != null &&
                            item.commissionFbs != null ? (
                              <div className="mt-1 text-xs font-medium tabular-nums" style={{ color: UE.green }}>
                                FBW {item.commissionFbw}% · FBS {item.commissionFbs}%
                              </div>
                            ) : null}
                          </div>
                          {isSelected ? (
                            <Check
                              className="mt-0.5 h-4 w-4 shrink-0"
                              strokeWidth={2.75}
                              style={{ color: UE.greenPayout }}
                            />
                          ) : (
                            <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })
                : null}

              {!fetchError && !loading && !isSearchMode && browseLevel !== "types"
                ? browseEntries.map((entry, index) => {
                    const isActive = index === activeIndex;
                    return (
                      <li key={entry.label} role="option" aria-selected={false}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition",
                            isActive ? "bg-[rgba(185,255,75,0.18)]" : "hover:bg-[#FAFAF8]"
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => drillBrowseEntry(entry.label, entry.count)}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-[15px] font-semibold leading-snug"
                              style={{ color: UE.text }}
                            >
                              {entry.label}
                            </div>
                            <div className="mt-0.5 text-xs" style={{ color: UE.textMuted }}>
                              {entry.count}{" "}
                              {entry.count % 10 === 1 && entry.count % 100 !== 11
                                ? "тип"
                                : entry.count % 10 >= 2 &&
                                    entry.count % 10 <= 4 &&
                                    (entry.count % 100 < 10 || entry.count % 100 >= 20)
                                  ? "типа"
                                  : "типов"}
                            </div>
                          </div>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-black/30"
                            strokeWidth={2.25}
                          />
                        </button>
                      </li>
                    );
                  })
                : null}

              {!fetchError && !loading && !isSearchMode && browseLevel === "types"
                ? browseTypes.map((item, index) => {
                    const isSelected = item.id === categoryId;
                    const isActive = index === activeIndex;
                    const showCommission =
                      marketplace === "wildberries" &&
                      item.commissionFbw != null &&
                      item.commissionFbs != null;
                    return (
                      <li key={item.id} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition",
                            isActive || isSelected
                              ? "bg-[rgba(185,255,75,0.18)]"
                              : "hover:bg-[#FAFAF8]"
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => pickItem(item)}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-[15px] font-semibold leading-snug"
                              style={{ color: UE.text }}
                            >
                              {item.name}
                            </div>
                            {showCommission ? (
                              <div
                                className="mt-0.5 text-xs font-medium tabular-nums"
                                style={{ color: UE.green }}
                              >
                                FBW {item.commissionFbw}% · FBS {item.commissionFbs}%
                              </div>
                            ) : null}
                          </div>
                          {isSelected ? (
                            <Check
                              className="mt-0.5 h-4 w-4 shrink-0"
                              strokeWidth={2.75}
                              style={{ color: UE.greenPayout }}
                            />
                          ) : (
                            <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })
                : null}
            </ul>
          </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {selected && !isEditing ? (
        <p className="mt-2 text-xs leading-snug" style={{ color: UE.textMuted }}>
          {selected.parentName && selected.categoryName
            ? `${selected.parentName} · ${selected.categoryName}`
            : selected.label}
        </p>
      ) : null}
    </div>
  );
}
