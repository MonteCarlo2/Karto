"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ImageIcon, Send, Loader2, Wrench } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
}

export function BugReportModal({ isOpen, onClose, user }: BugReportModalProps) {
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();

  // Обработка вставки через Ctrl+V
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      if (images.length >= 3) {
        showToast({
          type: "info",
          message: "Можно прикрепить не более 3 изображений",
        });
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleImageFile(file);
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isOpen, images.length]);

  // Обработка файла изображения
  const handleImageFile = async (file: File): Promise<void> => {
    if (!file.type.startsWith("image/")) {
      showToast({
        type: "error",
        message: "Можно прикрепить только изображения",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast({
        type: "error",
        message: "Размер изображения не должен превышать 5 МБ",
      });
      return;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImages((prev) => [...prev, result]);
        resolve();
      };
      reader.onerror = () => {
        showToast({
          type: "error",
          message: "Ошибка при чтении файла",
        });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  // Обработка выбора файлов
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remainingSlots = 3 - images.length;

    if (files.length > remainingSlots) {
      showToast({
        type: "info",
        message: `Можно прикрепить еще ${remainingSlots} изображений`,
      });
    }

    const filesToProcess = files.slice(0, remainingSlots);
    for (const file of filesToProcess) {
      await handleImageFile(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Удаление изображения
  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Отправка отчета
  const handleSubmit = async () => {
    if (!description.trim()) {
      showToast({
        type: "error",
        message: "Пожалуйста, опишите проблему",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Загружаем изображения в Supabase Storage
      const imageUrls: string[] = [];
      const supabase = createBrowserClient();

      for (const imageDataUrl of images) {
        try {
          // Конвертируем data URL в blob
          const response = await fetch(imageDataUrl);
          const blob = await response.blob();
          
          // Генерируем уникальное имя файла
          const fileName = `bug-reports/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
          
          // Загружаем в Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("bug-reports")
            .upload(fileName, blob, {
              contentType: "image/png",
              upsert: false,
            });

          if (uploadError) {
            // Если bucket не существует, просто пропускаем загрузку изображений
            // но продолжаем отправку отчета без изображений
            if (uploadError.message?.includes("Bucket not found") || uploadError.message?.includes("not found")) {
              console.warn("Bucket bug-reports не найден, пропускаем загрузку изображений");
              showToast({
                type: "info",
                message: "Изображения не загружены (bucket не настроен), но отчет отправлен",
              });
            } else {
              console.error("Ошибка загрузки изображения:", uploadError);
            }
            continue;
          }

          // Получаем публичный URL
          const { data: urlData } = supabase.storage
            .from("bug-reports")
            .getPublicUrl(fileName);

          if (urlData?.publicUrl) {
            imageUrls.push(urlData.publicUrl);
          }
        } catch (error) {
          console.error("Ошибка обработки изображения:", error);
          // Продолжаем выполнение даже при ошибке загрузки изображения
        }
      }

      // Отправляем отчет в API
      const response = await fetch("/api/bug-reports/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          image_urls: imageUrls,
          user_email: user?.email || "anonymous",
          user_name: user?.user_metadata?.name || user?.email?.split("@")[0] || "Пользователь",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Ошибка при отправке отчета");
      }

      showToast({
        type: "success",
        message: "Отчет успешно отправлен! Спасибо за обратную связь.",
      });

      // Очищаем форму
      setDescription("");
      setImages([]);
      onClose();
    } catch (error: any) {
      console.error("Ошибка отправки отчета:", error);
      showToast({
        type: "error",
        message: error.message || "Не удалось отправить отчет. Попробуйте позже.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Обработка drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (images.length >= 3) {
      showToast({
        type: "info",
        message: "Можно прикрепить не более 3 изображений",
      });
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const remainingSlots = 3 - images.length;
    const filesToProcess = files.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      await handleImageFile(file);
    }
  };

  // Автоматическое изменение размера textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [description]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal - панель справа как в AIORA */}
          <motion.div
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full h-full overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-900">Нашли дефект?</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isSubmitting}
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Опишите проблему
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Опишите проблему, которую вы обнаружили..."
                    className="w-full min-h-[120px] p-4 border-2 border-gray-200 rounded-xl resize-none focus:outline-none focus:border-[#1F4E3D] transition-colors text-gray-900 placeholder:text-gray-400"
                    disabled={isSubmitting}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    (Можно вставить скриншот через Ctrl+V)
                  </p>
                </div>

                {/* Images */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Прикрепить изображения (до 3 шт.)
                  </label>

                  {/* Drop zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-6 transition-colors ${
                      isDragging
                        ? "border-[#1F4E3D] bg-[#1F4E3D]/5"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting || images.length >= 3}
                      className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ImageIcon className="w-5 h-5 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Выбрать изображения
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={isSubmitting || images.length >= 3}
                    />
                  </div>

                  {/* Preview images */}
                  {images.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {images.map((img, index) => (
                        <div
                          key={index}
                          className="relative group aspect-square rounded-lg overflow-hidden border-2 border-gray-200"
                        >
                          <img
                            src={img}
                            alt={`Скриншот ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => handleRemoveImage(index)}
                            disabled={isSubmitting}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !description.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#1F4E3D] hover:bg-[#1a3f31] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Отправка...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Отправить отчет</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
