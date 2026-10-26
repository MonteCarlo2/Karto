"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, MoreHorizontal, Plus, X } from "lucide-react";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";
import { CardSellability } from "./hub-card-sellability";
import {
  listSellerHubWarehouses,
  readSellerHubCard,
  saveSellerHubMedia,
  searchSellerHubCategories,
  updateSellerHubCard,
  updateSellerHubPrices,
  updateSellerHubStocks,
  uploadSellerHubPhoto,
} from "@/lib/seller-hub/client-api";
import { appendHubJournal } from "@/lib/seller-hub/journal";
import { claimPriceSubmit, priceJournalEntry, priceWriteView, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import { descriptionForWb } from "@/lib/seller-hub/wb-description";
import type { SellerCatalogItem, SellerPromotionRow } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatRub,
  hub,
  HubBadge,
  HubButton,
  HubPhoto,
  hubNumeric,
  hubSans,
} from "./hub-ui";

const CardVideo = dynamic(() => import("./hub-card-video").then((mod) => mod.CardVideo), { ssr: false });

function wbFullPhoto(url: string): string {
  return url
    .replace("/images/tm/", "/images/c516x688/")
    .replace("/images/c246x328/", "/images/c516x688/")
    .replace("/images/square/", "/images/c516x688/");
}

export function HubProductDrawer({
  item,
  promotions,
  onClose,
  onOpenPrices,
  onPatched,
  connected,
}: {
  item: SellerCatalogItem;
  promotions?: SellerPromotionRow[];
  onClose: () => void;
  onOpenPrices?: (itemId: string) => void;
  onPatched?: (patch: Partial<SellerCatalogItem> & { id: string }) => void;
  connected?: boolean;
}) {
  const photos = useMemo(() => {
    const raw = item.imageUrls?.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : [];
    return raw.map(wbFullPhoto);
  }, [item.imageUrl, item.imageUrls]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [priceInput, setPriceInput] = useState(String(Math.round(item.discountedPrice ?? item.price ?? 0) || ""));
  const [discountInput, setDiscountInput] = useState(item.discountPercent != null ? String(item.discountPercent) : "0");
  const [lengthInput, setLengthInput] = useState(item.dimensions?.length != null ? String(item.dimensions.length) : "");
  const [widthInput, setWidthInput] = useState(item.dimensions?.width != null ? String(item.dimensions.width) : "");
  const [heightInput, setHeightInput] = useState(item.dimensions?.height != null ? String(item.dimensions.height) : "");
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [vendorCode, setVendorCode] = useState(item.vendorCode);
  const [category, setCategory] = useState(item.category ?? "");
  const [subjects, setSubjects] = useState<{ id: number; name: string; parent: string }[]>([]);
  const [subjectsNote, setSubjectsNote] = useState("Ищу предметы WB…");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [fbsInput, setFbsInput] = useState(item.stockFbs != null ? String(item.stockFbs) : "");
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState<string[]>(photos);
  const [videoUrl, setVideoUrl] = useState(item.videoUrl ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const priceLockRef = useRef(false);
  const replaceRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const itemPromos = useMemo(() => {
    const ids = new Set(item.promotionIds ?? []);
    if (ids.size === 0) return [];
    return (promotions ?? []).filter((p) => ids.has(p.id));
  }, [item.promotionIds, promotions]);

  useEffect(() => {
    setPhotoIndex(0);
    setVideoOpen(false);
    setLightbox(false);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setPriceInput(String(Math.round(item.discountedPrice ?? item.price ?? 0) || ""));
    setDiscountInput(item.discountPercent != null ? String(item.discountPercent) : "0");
    setLengthInput(item.dimensions?.length != null ? String(item.dimensions.length) : "");
    setWidthInput(item.dimensions?.width != null ? String(item.dimensions.width) : "");
    setHeightInput(item.dimensions?.height != null ? String(item.dimensions.height) : "");
    setPriceNote(null);
    setVendorCode(item.vendorCode);
    setCategory(item.category ?? "");
    setFbsInput(item.stockFbs != null ? String(item.stockFbs) : "");
    setCategoryOpen(false);
    setEditing(false);
    setGallery(photos);
    setVideoUrl(item.videoUrl ?? "");
    setMenuOpen(false);
    // Сброс только при смене артикула. Обновление той же карточки не должно стирать уже введённое.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.externalId]);

  useEffect(() => {
    if (!connected) return;
    const nmId = Number(item.externalId);
    if (!Number.isFinite(nmId)) return;
    let cancelled = false;
    void readSellerHubCard({ nmId }).then((result) => {
      if (cancelled || !result.ok || !result.card) return;
      const card = result.card;
      const urls = card.imageUrls.map(wbFullPhoto);
      setTitle(card.title || item.title);
      setDescription(card.description);
      setVendorCode(card.vendorCode || item.vendorCode);
      setCategory(card.category || item.category || "");
      if (card.dimensions?.length != null) setLengthInput(String(card.dimensions.length));
      if (card.dimensions?.width != null) setWidthInput(String(card.dimensions.width));
      if (card.dimensions?.height != null) setHeightInput(String(card.dimensions.height));
      if (urls.length > 0) setGallery(urls);
      setVideoUrl(card.videoUrl);
      onPatched?.({
        id: item.id,
        title: card.title || item.title,
        description: card.description,
        vendorCode: card.vendorCode || item.vendorCode,
        brand: card.brand || undefined,
        category: card.category || undefined,
        imageUrl: card.imageUrls[0],
        imageUrls: card.imageUrls.length > 0 ? card.imageUrls : undefined,
        videoUrl: card.videoUrl || undefined,
        dimensions: card.dimensions,
      });
    });
    return () => {
      cancelled = true;
    };
    // Читаем карточку один раз на артикул. onPatched обновляет таблицу и не должен запускать повторный запрос.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, item.externalId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) setLightbox(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!editing || !categoryOpen || !connected) return;
    const query = category.trim().replace(/ё/gi, "е");
    const timer = window.setTimeout(() => {
      setSubjectsNote("Ищу предметы WB…");
      void searchSellerHubCategories({ query }).then((result) => {
        if (result.ok) {
          const rows = result.subjects ?? [];
          setSubjects(rows);
          setSubjectsNote(rows.length === 0 ? "Такого предмета на WB нет." : "");
        } else {
          setSubjects([]);
          setSubjectsNote(result.error ?? "Предметы WB не открылись.");
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [editing, categoryOpen, category, connected]);

  async function sendPhoto(file: File, photoNumber: number, index: number | null) {
    const nmId = Number(item.externalId);
    if (!connected || !Number.isFinite(nmId)) {
      setPriceNote("Кабинет не подключён.");
      return;
    }
    setBusy(true);
    const result = await uploadSellerHubPhoto({ nmId, photoNumber, file });
    setBusy(false);
    if (!result.ok) {
      setPriceNote(result.error ?? "Фото не загрузилось.");
      return;
    }
    const url = URL.createObjectURL(file);
    setGallery((current) => (index == null ? [...current, url] : current.map((src, i) => (i === index ? url : src))));
    setPriceNote(index == null ? "Фото добавлено на карточку." : "Фото заменено.");
    setMenuOpen(false);
  }

  async function removePhoto() {
    const nmId = Number(item.externalId);
    const keep = gallery.filter((url, i) => i !== photoIndex && url.startsWith("http"));
    if (!connected || !Number.isFinite(nmId)) {
      setPriceNote("Кабинет не подключён.");
      return;
    }
    if (gallery.length <= 1) {
      setPriceNote("Последнее фото не удаляю.");
      setMenuOpen(false);
      return;
    }
    setBusy(true);
    const result = await saveSellerHubMedia({ nmId, urls: keep });
    setBusy(false);
    if (!result.ok) {
      setPriceNote(result.error ?? "Фото не удалилось.");
      return;
    }
    setGallery((current) => current.filter((_, i) => i !== photoIndex));
    setPhotoIndex(0);
    setMenuOpen(false);
    setPriceNote("Фото убрано из карточки.");
  }

  function fileVideo(url: string): boolean {
    return /\.(mp4|mov)(\?|$)/i.test(url);
  }

  async function persistOrder(nextPhotos: string[]) {
    const nmId = Number(item.externalId);
    if (!connected || !Number.isFinite(nmId)) {
      setPriceNote("Кабинет не подключён.");
      return false;
    }
    if (nextPhotos.some((url) => !url.startsWith("http"))) {
      setPriceNote("Порядок отправлю, когда у всех фото будут ссылки WB.");
      return false;
    }
    if (videoUrl && !fileVideo(videoUrl)) {
      setPriceNote("Порядок не отправил: видео WB — поток, и замена набора стёрла бы его.");
      return false;
    }
    const urls = videoUrl && fileVideo(videoUrl) ? [videoUrl, ...nextPhotos] : nextPhotos;
    const result = await saveSellerHubMedia({ nmId, urls });
    if (!result.ok) {
      setPriceNote(result.error ?? "Порядок фото не ушёл.");
      return false;
    }
    setPriceNote("WB принял порядок фото. Первая картинка — главная.");
    onPatched?.({ id: item.id, imageUrl: nextPhotos[0], imageUrls: nextPhotos, videoUrl: videoUrl || undefined });
    return true;
  }

  async function movePhoto(from: number, to: number) {
    if (to < 0 || to >= gallery.length || from === to) return;
    const next = gallery.slice();
    const [row] = next.splice(from, 1);
    if (!row) return;
    next.splice(to, 0, row);
    const previous = gallery;
    setGallery(next);
    setPhotoIndex(to);
    const ok = await persistOrder(next);
    if (!ok) setGallery(previous);
  }

  async function sendVideo(file: File) {
    const nmId = Number(item.externalId);
    if (!connected || !Number.isFinite(nmId)) {
      setPriceNote("Кабинет не подключён.");
      return;
    }
    setBusy(true);
    const result = await uploadSellerHubPhoto({ nmId, photoNumber: 1, file });
    setBusy(false);
    if (!result.ok) {
      setPriceNote(result.error ?? "Видео не загрузилось.");
      return;
    }
    setVideoUrl(URL.createObjectURL(file));
    setPriceNote("WB принял видео. В списке медиа оно первое, главной остаётся первая фотография.");
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[620px] flex-col border-l bg-white shadow-[-12px_0_40px_-20px_rgba(0,0,0,0.45)]"
        style={{ borderColor: hub.border, backgroundColor: hub.canvas }}
        role="dialog"
        aria-label={item.title}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {editing ? (
                <textarea
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-label="Название товара"
                  rows={2}
                  className="w-full resize-none rounded-[4px] border bg-white px-3 py-2 text-[22px] font-semibold leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                  style={{ ...hubSans, color: hub.text, borderColor: hub.ink }}
                />
              ) : (
                <h2 className="break-words text-[26px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                  {title}
                  <CopyButton text={title} label="Скопировать название" />
                </h2>
              )}
              <p className="mt-1 flex items-center gap-2 font-mono text-[12px]" style={{ color: hub.textMuted }}>
                <span>{vendorCode} · nmID {item.externalId}</span>
                <CopyButton text={vendorCode} label="Скопировать артикул" />
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-[10px] p-2 transition-colors hover:bg-black/[0.05]"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" style={{ color: hub.textMuted }} />
            </button>
          </div>
          {editing ? null : (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex min-h-[36px] items-center rounded-[4px] border bg-white px-3.5 text-[13px] font-semibold"
                style={{ borderColor: hub.ink, color: hub.ink }}
              >
                Редактировать
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 pb-8">
          {gallery.length > 0 || videoUrl ? (
            <div className="relative">
              <div className="relative mx-auto w-fit max-w-full">
                {videoOpen && videoUrl ? (
                  <CardVideo src={videoUrl} mode="stage" />
                ) : gallery[photoIndex] ? (
                  <button type="button" onClick={() => { if (!editing) setLightbox(true); }} className="block">
                    <img src={gallery[photoIndex]} alt="" className="mx-auto max-h-[480px] w-auto max-w-full object-contain" />
                  </button>
                ) : null}
                {editing && !videoOpen ? (
                  <div ref={menuRef} className="absolute right-3 top-3">
                    <button
                      type="button"
                      aria-label="Действия с фото"
                      aria-expanded={menuOpen}
                      className="flex h-8 w-8 items-center justify-center rounded-full border bg-white"
                      style={{ borderColor: hub.ink, color: hub.ink }}
                      onClick={() => setMenuOpen((open) => !open)}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuOpen ? (
                      <div
                        className="absolute right-0 z-20 mt-1 min-w-[148px] rounded-[4px] border bg-white py-1"
                        style={{ borderColor: hub.ink, boxShadow: "0 8px 24px rgba(14,17,22,0.12)" }}
                      >
                        <button type="button" className="block w-full px-3 py-2 text-left text-[13px] font-medium hover:bg-[#F4F6F8]" style={{ color: hub.text }} onClick={() => replaceRef.current?.click()}>
                          Заменить
                        </button>
                        <button type="button" className="block w-full px-3 py-2 text-left text-[13px] font-medium hover:bg-[#F4F6F8]" style={{ color: hub.danger }} onClick={() => void removePhoto()}>
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {videoUrl || gallery.length > 1 || editing ? (
                <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-2">
                  {videoUrl ? (
                    <button
                      type="button"
                      aria-label="Видеообложка"
                      onClick={() => setVideoOpen(true)}
                      className={`flex h-20 w-[60px] items-center justify-center overflow-hidden bg-black ring-2 ${
                        videoOpen ? "ring-[#B9FF4B]" : "ring-transparent"
                      }`}
                    >
                      <CardVideo src={videoUrl} mode="thumb" />
                    </button>
                  ) : null}
                  {gallery.map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      draggable={editing}
                      onDragStart={() => { dragFrom.current = i; }}
                      onDragOver={(event) => { if (editing) event.preventDefault(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = dragFrom.current;
                        dragFrom.current = null;
                        if (from == null) return;
                        void movePhoto(from, i);
                      }}
                      onClick={() => { setVideoOpen(false); setPhotoIndex(i); }}
                      className={`flex h-20 w-[60px] items-center justify-center overflow-hidden bg-[#F4F6F8] ring-2 ${
                        !videoOpen && photoIndex === i ? "ring-[#B9FF4B]" : "ring-transparent"
                      }`}
                    >
                      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                    </button>
                  ))}
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="flex h-20 w-[60px] items-center justify-center border border-dashed bg-white"
                        style={{ borderColor: hub.ink, color: hub.textMuted }}
                        aria-label="Добавить фото"
                        onClick={() => addRef.current?.click()}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        className="flex h-20 w-[60px] items-center justify-center border border-dashed bg-white text-[11px] font-semibold"
                        style={{ borderColor: hub.ink, color: hub.text }}
                        onClick={() => videoRef.current?.click()}
                      >
                        Видео
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <HubPhoto className="mx-auto h-[280px] w-full max-w-[220px]" iconClassName="h-8 w-8" />
          )}

          <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/gif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendPhoto(file, photoIndex + 1, photoIndex); event.target.value = ""; }} />
          <input ref={addRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/gif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendPhoto(file, gallery.length + 1, null); event.target.value = ""; }} />
          <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendVideo(file); event.target.value = ""; }} />

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/studio/visual"
              onClick={() =>
                writeHubCardSeed({
                  title,
                  vendorCode: item.vendorCode,
                  externalId: item.externalId,
                  description,
                })
              }
            >
              <span className="inline-flex min-h-[36px] items-center rounded-[4px] border bg-white px-3.5 text-[13px] font-semibold" style={{ borderColor: hub.ink, color: hub.ink }}>Инфографика в Потоке</span>
            </a>
            <a
              href="/studio/description"
              onClick={() =>
                writeHubCardSeed({
                  title,
                  vendorCode: item.vendorCode,
                  externalId: item.externalId,
                  description,
                })
              }
            >
              <span className="inline-flex min-h-[36px] items-center rounded-[4px] border bg-white px-3.5 text-[13px] font-semibold" style={{ borderColor: hub.ink, color: hub.ink }}>Собрать описание</span>
            </a>
          </div>
          {editing ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="rounded-[4px] border bg-white px-3.5 py-2.5" style={{ borderColor: hub.ink }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: hub.textSubtle }}>Артикул продавца</span>
                <input value={vendorCode} onChange={(event) => setVendorCode(event.target.value)} className="mt-1 w-full bg-transparent text-[15px] font-semibold outline-none" style={{ color: hub.text }} />
              </label>
              <label className="col-span-2 rounded-[4px] border bg-white px-3.5 py-2.5" style={{ borderColor: hub.ink }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: hub.textSubtle }}>Категория</span>
                <input
                  value={category}
                  onChange={(event) => { setCategory(event.target.value); setCategoryOpen(true); }}
                  onFocus={() => setCategoryOpen(true)}
                  onBlur={() => setCategoryOpen(false)}
                  className="mt-1 w-full bg-transparent text-[15px] font-semibold outline-none"
                  style={{ color: hub.text }}
                  placeholder="Начните вводить, например ёмкости"
                />
                {categoryOpen ? (
                  <ul className="mt-2 max-h-64 overflow-y-auto rounded-[4px] border bg-white py-1" style={{ borderColor: hub.border }}>
                    {subjects.length === 0 ? (
                      <li className="px-3 py-2 text-[13px]" style={{ color: hub.textMuted }}>{subjectsNote}</li>
                    ) : subjects.map((subject) => (
                      <li key={subject.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-[#F4F6F8]"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setCategory(subject.name);
                            setCategoryOpen(false);
                          }}
                        >
                          <span className="block text-[13px] font-medium" style={{ color: hub.text }}>{subject.name}</span>
                          {subject.parent ? <span className="block text-[11px]" style={{ color: hub.textSubtle }}>{subject.parent}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {category.trim() !== (item.category ?? "").trim() ? (
                  <p className="mt-2 text-[12px] leading-[1.45]" style={{ color: hub.textMuted }}>
                    Предмет уже созданной карточки WB не меняет. Это подсказка, в кабинет её не отправлю.
                  </p>
                ) : null}
              </label>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            {editing ? (
              <label className="rounded-[4px] border bg-white px-3.5 py-2.5" style={{ borderColor: hub.ink }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: hub.textSubtle }}>Цена, ₽</span>
                <input value={priceInput} onChange={(event) => setPriceInput(event.target.value)} inputMode="numeric" className="mt-1 w-full bg-transparent text-[18px] font-semibold outline-none" style={{ ...hubSans, ...hubNumeric, color: hub.text }} />
              </label>
            ) : (
              <Stat label="Цена" value={formatRub(item.discountedPrice ?? item.price)} />
            )}
            {editing ? (
              <label className="rounded-[4px] border bg-white px-3.5 py-2.5" style={{ borderColor: hub.ink }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: hub.textSubtle }}>Скидка, %</span>
                <input value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} inputMode="numeric" className="mt-1 w-full bg-transparent text-[18px] font-semibold outline-none" style={{ ...hubSans, ...hubNumeric, color: hub.text }} />
              </label>
            ) : (
              <Stat label="Скидка" value={`${item.discountPercent ?? 0}%`} />
            )}
            <Stat label="FBO" value={item.stockFbo != null ? formatInt(item.stockFbo) : "—"} />
            {editing ? (
              <label className="rounded-[4px] border bg-white px-3.5 py-2.5" style={{ borderColor: hub.ink }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: hub.textSubtle }}>FBS</span>
                <input value={fbsInput} onChange={(event) => setFbsInput(event.target.value)} inputMode="numeric" className="mt-1 w-full bg-transparent text-[18px] font-semibold outline-none" style={{ ...hubNumeric, color: hub.text }} />
              </label>
            ) : (
              <Stat label="FBS" value={item.stockFbs != null ? formatInt(item.stockFbs) : "—"} />
            )}
          </div>
          {priceNote ? <p className="mt-3 text-[13px]" style={{ color: hub.textMuted }}>{priceNote}</p> : null}

          <div className="mt-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>Описание</p>
            {editing ? (
              <>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={8}
                  className="mt-2 w-full resize-y rounded-[4px] border bg-white px-3 py-3 text-[16px] leading-[1.6] outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                  style={{ ...hubSans, color: hub.text, borderColor: hub.ink }}
                />
                <p className="mt-2 text-[12px] leading-[1.45]" style={{ color: hub.textMuted }}>
                  В кабинет уходит тот же текст, что вы видите: абзацы остаются переносами строк. Рич-макет блоками API отдельно не отдаёт, его вёрстку отсюда не меняю. Картинки из текста показываю как пришли.
                </p>
              </>
            ) : (
              <>
              <DescriptionView text={description} />
              <CardSellability
                title={title}
                description={description}
                brand={item.brand}
                category={item.category}
                photos={item.imageUrls?.length ?? (item.imageUrl ? 1 : 0)}
                hasVideo={Boolean(item.videoUrl)}
                dimensions={
                  [item.dimensions?.length, item.dimensions?.width, item.dimensions?.height].every((value) => value != null)
                    ? `${item.dimensions?.length}×${item.dimensions?.width}×${item.dimensions?.height} см`
                    : null
                }
              />
              </>
            )}
          </div>

          <div className="mt-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>Габариты, см</p>
            {editing ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <DimField label="Длина" value={lengthInput} onChange={setLengthInput} />
                <DimField label="Ширина" value={widthInput} onChange={setWidthInput} />
                <DimField label="Высота" value={heightInput} onChange={setHeightInput} />
              </div>
            ) : (
              <p className="mt-2 text-[16px]" style={{ ...hubSans, color: hub.text }}>
                {[lengthInput, widthInput, heightInput].filter(Boolean).join(" × ") || "—"}
                {item.dimensions?.weightKg != null ? ` · ${item.dimensions.weightKg} кг` : ""}
              </p>
            )}
          </div>

          {itemPromos.length > 0 ? (
            <div className="mt-6">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
                Акции
              </p>
              <ul className="mt-2 space-y-2">
                {itemPromos.map((promo) => (
                  <li
                    key={promo.id}
                    className="rounded-[4px] border px-3.5 py-2.5"
                    style={{ borderColor: hub.borderSoft }}
                  >
                    <p className="text-[13.5px] font-medium" style={{ ...hubSans, color: hub.text }}>
                      {promo.name}
                    </p>
                    {promo.description ? (
                      <p className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: hub.textMuted }}>
                        {promo.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {promo.type ? <HubBadge tone="accent">{promo.type}</HubBadge> : null}
                      {promo.endAt ? (
                        <span className="text-[12px]" style={{ color: hub.textSubtle }}>
                          до {new Date(promo.endAt).toLocaleDateString("ru-RU")}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

        </div>
        {editing ? (
          <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ backgroundColor: hub.canvas }}>
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center rounded-[4px] border bg-white px-3.5 text-[13px] font-semibold"
              style={{ borderColor: hub.ink, color: hub.ink }}
              onClick={() => {
                setTitle(item.title);
                setDescription(item.description ?? "");
                setPriceInput(String(Math.round(item.discountedPrice ?? item.price ?? 0) || ""));
                setDiscountInput(item.discountPercent != null ? String(item.discountPercent) : "0");
                setLengthInput(item.dimensions?.length != null ? String(item.dimensions.length) : "");
                setWidthInput(item.dimensions?.width != null ? String(item.dimensions.width) : "");
                setHeightInput(item.dimensions?.height != null ? String(item.dimensions.height) : "");
                setVendorCode(item.vendorCode);
                setCategory(item.category ?? "");
                setFbsInput(item.stockFbs != null ? String(item.stockFbs) : "");
                setCategoryOpen(false);
                setGallery(photos);
                setEditing(false);
              }}
            >
              Выйти
            </button>
            <HubButton
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!claimPriceSubmit(priceLockRef)) return;
                void (async () => {
                  setBusy(true);
                  setPriceNote(null);
                  const notes: string[] = [];
                  let failed = false;
                  const nmId = Number(item.externalId);
                  const nextPrice = Number(priceInput.replace(/\s/g, ""));
                  const nextDiscount = Number(discountInput || "0");
                  const prevPrice = Math.round(item.discountedPrice ?? item.price ?? 0);
                  const prevDiscount = item.discountPercent ?? 0;
                  const priceChanged = nextPrice !== prevPrice || nextDiscount !== prevDiscount;
                  const nextLength = lengthInput.trim() === "" ? undefined : Number(lengthInput);
                  const nextWidth = widthInput.trim() === "" ? undefined : Number(widthInput);
                  const nextHeight = heightInput.trim() === "" ? undefined : Number(heightInput);
                  const cardChanged =
                    title.trim() !== item.title.trim() ||
                    description !== (item.description ?? "") ||
                    vendorCode.trim() !== item.vendorCode.trim() ||
                    (nextLength ?? null) !== (item.dimensions?.length ?? null) ||
                    (nextWidth ?? null) !== (item.dimensions?.width ?? null) ||
                    (nextHeight ?? null) !== (item.dimensions?.height ?? null);
                  const nextFbs = Number(fbsInput.replace(/\s/g, ""));
                  const fbsChanged = fbsInput.trim() !== "" && Number.isFinite(nextFbs) && nextFbs !== (item.stockFbs ?? null);
                  const dimsBroken = [lengthInput, widthInput, heightInput].some((value) => value.trim() !== "" && !Number.isFinite(Number(value)));
                  const dimCleared =
                    (lengthInput.trim() === "" && item.dimensions?.length != null) ||
                    (widthInput.trim() === "" && item.dimensions?.width != null) ||
                    (heightInput.trim() === "" && item.dimensions?.height != null);
                  try {
                    if (dimsBroken || dimCleared) {
                      notes.push(dimsBroken ? "Габариты — это числа в сантиметрах." : "Пустое поле не стирает габарит на WB. Впишите число или нажмите «Выйти».");
                      failed = true;
                    } else if (!connected || !Number.isFinite(nmId)) {
                      if (cardChanged || priceChanged || fbsChanged) {
                        notes.push("Кабинет не подключён.");
                        failed = true;
                      }
                    } else {
                      if (cardChanged) {
                        const result = await updateSellerHubCard({
                          nmId,
                          title: title.trim(),
                          description,
                          vendorCode: vendorCode.trim(),
                          length: nextLength,
                          width: nextWidth,
                          height: nextHeight,
                        });
                        if (result.ok) notes.push("WB принял название, артикул, описание и габариты.");
                        else {
                          notes.push(result.error ?? "Карточка не ушла.");
                          failed = true;
                        }
                      }
                      if (priceChanged) {
                        if (!Number.isFinite(nextPrice)) {
                          notes.push("Цена не ушла: нет числа.");
                          failed = true;
                        } else {
                          const result = await updateSellerHubPrices({
                            updates: [{ nmId, price: nextPrice, discount: nextDiscount, expected: { price: item.price ?? null, discount: item.discountPercent ?? null } }],
                          });
                          const view = priceWriteView({
                            outcome: result.outcome,
                            uploadId: result.uploadId,
                            error: result.error,
                            read: result.verified ? "match" : result.outcome === "processed" ? "unread" : undefined,
                          });
                          notes.push(result.message);
                          appendHubJournal(priceJournalEntry({
                            rows: [{
                              nmId,
                              beforePrice: item.price,
                              beforeDiscount: prevDiscount,
                              price: nextPrice,
                              discount: nextDiscount,
                            }],
                            view: { ...view, text: result.message },
                          }));
                          if (!view.applyLocal) failed = true;
                          else {
                            onPatched?.({
                              id: item.id,
                              price: nextPrice,
                              discountPercent: nextDiscount,
                              discountedPrice: Math.round(nextPrice * (1 - nextDiscount / 100)),
                            });
                          }
                        }
                      }
                      if (fbsChanged) {
                        const warehouses = await listSellerHubWarehouses();
                        const list = warehouses.warehouses ?? [];
                        if (!warehouses.ok) {
                          notes.push(warehouses.error ?? "Склад FBS не открылся.");
                          failed = true;
                        } else if (list.length !== 1) {
                          notes.push("Складов FBS несколько. Остаток не отправил, чтобы не угадывать склад.");
                          failed = true;
                        } else {
                          const result = await updateSellerHubStocks({
        warehouseId: list[0]?.id,
                            updates: [{ nmId, amount: nextFbs }],
                          });
                          if (result.ok) notes.push("WB принял остаток FBS.");
                          else {
                            notes.push(result.error ?? "Остаток FBS не ушёл.");
                            failed = true;
                          }
                        }
                      }
                    }
                    if (category.trim() !== (item.category ?? "").trim()) {
                      notes.push("Категорию существующей карточки WB не меняет — в кабинет её не отправил.");
                    }
                    if (notes.length > 0) setPriceNote(notes.join(" "));
                    if (!failed) setEditing(false);
                  } finally {
                    releasePriceSubmit(priceLockRef);
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? "Отправляю" : "Применить"}
            </HubButton>
          </div>
        ) : null}
      </aside>

      {lightbox && gallery[photoIndex] ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightbox(false)}
            aria-label="Закрыть"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={gallery[photoIndex]}
            alt=""
            className="max-h-[80vh] max-w-[90vw] object-contain"
          />
        </div>
      ) : null}
    </>
  );
}

function DescriptionView({ text }: { text: string }) {
  const images = Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi)).map((match) => match[0]);
  const plain = descriptionForWb(text);
  return (
    <div className="mt-2">
      <p className="whitespace-pre-wrap text-[16px] leading-[1.6]" style={{ ...hubSans, color: hub.text }}>
        {plain || "Описания в ответе WB нет."}
      </p>
      {images.map((src) => (
        <img key={src} src={src} alt="" className="mt-3 max-h-[420px] max-w-full object-contain" />
      ))}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      className="ml-1 inline-flex align-middle rounded-[4px] p-1 hover:bg-black/[0.05]"
      style={{ backgroundColor: done ? hub.lime : undefined }}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? (
        <Check className="h-3.5 w-3.5" style={{ color: hub.green }} />
      ) : (
        <Copy className="h-3.5 w-3.5" style={{ color: hub.textSubtle }} />
      )}
    </button>
  );
}

function DimField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px]" style={{ color: hub.textSubtle }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="mt-1 w-full rounded-[4px] border bg-white px-2 py-1.5 text-[15px] outline-none"
        style={{ color: hub.text, borderColor: hub.ink }}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[4px] border px-3.5 py-2.5"
      style={{ borderColor: hub.borderSoft, backgroundColor: hub.surfaceMuted }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: hub.textSubtle }}>
        {label}
      </p>
      <p
        className="mt-1 text-[15px] font-semibold"
        style={{ ...hubSans, ...hubNumeric, color: hub.text }}
      >
        {value}
      </p>
    </div>
  );
}
