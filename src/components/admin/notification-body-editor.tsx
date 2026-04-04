"use client";

import { useEffect, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyleKit } from "@tiptap/extension-text-style/text-style-kit";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  Undo2,
  Redo2,
  RemoveFormatting,
  Palette,
  Type,
} from "lucide-react";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "22px", "28px", "36px"] as const;
const COLORS = ["#111827", "#1F4E3D", "#84CC16", "#2563eb", "#dc2626", "#7c3aed"] as const;

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-neutral-700 transition-colors",
        active
          ? "border-[#84CC16]/70 bg-[#ECF7DB] text-[#14532d]"
          : "border-transparent bg-white/80 hover:border-[#2E5A43]/15 hover:bg-[#f4faf6]",
        disabled ? "pointer-events-none opacity-40" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Ссылка (https://…)", prev ?? "https://");
  if (url === null) return;
  const t = url.trim();
  if (t === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  if (!t.startsWith("http://") && !t.startsWith("https://")) {
    window.alert("Укажите ссылку с http:// или https://");
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: t }).run();
}

export function NotificationBodyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "text-[#1F4E3D] underline underline-offset-2",
        },
      }),
      TextStyleKit,
      Placeholder.configure({
        placeholder:
          "Текст уведомления… Можно вставить из Word или Google Docs — жирный, курсив, размеры сохранятся.",
      }),
    ],
    content: value || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[300px] max-h-[min(55vh,520px)] overflow-y-auto px-3 py-3 text-[15px] leading-relaxed text-neutral-900 focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (value !== cur) {
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="min-h-[300px] animate-pulse rounded-lg border border-[#e5e7eb] bg-[#f9fafb]" />
    );
  }

  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white shadow-inner overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#e5e7eb] bg-[#f8faf8] px-2 py-2">
        <ToolbarButton
          title="Жирный"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Курсив"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Подчёркивание"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Зачёркивание"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[#e5e7eb]" aria-hidden />
        <ToolbarButton
          title="Заголовок 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Заголовок 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Заголовок 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[#e5e7eb]" aria-hidden />
        <ToolbarButton
          title="Маркированный список"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Нумерованный список"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Цитата"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-[#e5e7eb]" aria-hidden />
        <ToolbarButton title="Ссылка" onClick={() => setLink(editor)}>
          <Link2 className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <div className="relative inline-flex h-8 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-1.5">
          <Type className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2} />
          <select
            aria-label="Размер шрифта"
            className="max-w-[5.5rem] cursor-pointer bg-transparent py-1 text-[12px] font-medium text-neutral-800 outline-none"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              editor.chain().focus().setFontSize(v).run();
              e.target.value = "";
            }}
          >
            <option value="">Размер</option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="relative inline-flex h-8 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-1.5">
          <Palette className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2} />
          <select
            aria-label="Цвет текста"
            className="max-w-[6rem] cursor-pointer bg-transparent py-1 text-[12px] font-medium outline-none"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              editor.chain().focus().setColor(v).run();
              e.target.value = "";
            }}
          >
            <option value="">Цвет</option>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <span className="mx-1 h-6 w-px bg-[#e5e7eb]" aria-hidden />
        <ToolbarButton title="Отменить" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton title="Повторить" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Сбросить форматирование"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting className="h-4 w-4" strokeWidth={2.25} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
