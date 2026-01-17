"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StageMenu } from "@/components/ui/stage-menu";
import { Upload, Type, Check } from "lucide-react";

// Статичный эффект рельефной бумаги
function CanvasTexture({ patternAlpha = 12 }: { patternAlpha?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasSize = 512;

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
    };

    const drawTexture = () => {
      const imageData = ctx.createImageData(canvasSize, canvasSize);
      const data = imageData.data;
      
      for (let y = 0; y < canvasSize; y++) {
        for (let x = 0; x < canvasSize; x++) {
          const index = (y * canvasSize + x) * 4;
          const noise = Math.random() * 0.4 + 0.6;
          const value = Math.floor(noise * 255);
          
          data[index] = value;
          data[index + 1] = value;
          data[index + 2] = value;
          data[index + 3] = patternAlpha;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    };

    resize();
    drawTexture();

    const handleResize = () => {
      resize();
      drawTexture();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [patternAlpha]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0"
      style={{ 
        imageRendering: "crisp-edges",
        mixBlendMode: "multiply",
        opacity: 0.4,
        zIndex: 0,
      }}
    />
  );
}

type FlowStartMethod = "photo" | "name" | null;

export default function UnderstandingPage() {
  const [selectedMethod, setSelectedMethod] = useState<FlowStartMethod>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const handleMethodSelect = (method: FlowStartMethod) => {
    setSelectedMethod(method);
    // Задержка для показа функционала после завершения анимации расширения
    setTimeout(() => {
      setIsExpanded(true);
    }, 600); // Время должно совпадать с duration анимации
  };

  const handleBack = () => {
    setIsExpanded(false);
    setTimeout(() => {
      setSelectedMethod(null);
    }, 50);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setPhotoFile(file);
    }
  };

  useEffect(() => {
    // Скрываем navbar и footer на этой странице
    const navbar = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (navbar) {
      navbar.style.display = 'none';
    }
    if (footer) {
      footer.style.display = 'none';
    }
    return () => {
      if (navbar) {
        navbar.style.display = '';
      }
      if (footer) {
        footer.style.display = '';
      }
    };
  }, []);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: "#f5f3ef" }}>
      {/* Эффект холста художника - многослойный */}
      <div className="absolute inset-0" style={{
        boxShadow: `
          inset 0 0 100px rgba(0,0,0,0.06),
          inset 0 2px 4px rgba(0,0,0,0.08),
          inset 0 -2px 4px rgba(0,0,0,0.08),
          0 1px 3px rgba(0,0,0,0.1)
        `,
        border: '1px solid rgba(0,0,0,0.04)',
        background: `
          linear-gradient(to bottom, rgba(255,255,255,0.03) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.02) 100%),
          linear-gradient(to right, rgba(0,0,0,0.01) 0%, transparent 50%, rgba(0,0,0,0.01) 100%)
        `,
      }}></div>
      
      {/* Дополнительная текстура холста */}
      <CanvasTexture patternAlpha={8} />
      
      {/* Меню стадий */}
      <StageMenu currentStage="understanding" />

      {/* Контент */}
      <div className="relative" style={{ zIndex: 1, minHeight: "100vh", padding: "24px" }}>
        {/* Заголовок и подзаголовок - в самом левом верхнем углу */}
        <div className="mb-8" style={{ paddingLeft: "0", marginLeft: "0" }}>
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              color: "#2E5A43",
              marginLeft: "0",
              paddingLeft: "0",
            }}
          >
            Понимание
          </h1>
          <p
            className="text-base md:text-lg"
            style={{
              fontFamily: "var(--font-sans), Inter, sans-serif",
              color: "#666666",
            }}
          >
            Соберём основу: что это и как лучше назвать.
          </p>
        </div>

        {!selectedMethod && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-8 text-center">
              <h2
                className="text-3xl md:text-4xl font-bold mb-3"
                style={{
                  fontFamily: "var(--font-serif), Georgia, serif",
                  color: "#000000",
                }}
              >
                Как начнём Поток?
              </h2>
              <p
                className="text-base md:text-lg"
                style={{
                  fontFamily: "var(--font-sans), Inter, sans-serif",
                  color: "#666666",
                }}
              >
                Выберите удобный способ — результат будет одинаковый.
              </p>
            </div>

              {/* Карточки выбора с анимацией расширения */}
              <div className="flex gap-6" style={{ minHeight: "60vh" }}>
                {/* Карточка 1: С фото */}
                <motion.div
                  layout
                  initial={false}
                  animate={{
                    width: selectedMethod === "photo" ? "85%" : selectedMethod === "name" ? "15%" : "50%",
                    opacity: selectedMethod === "name" ? 0.3 : 1,
                  }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  onClick={() => !selectedMethod && handleMethodSelect("photo")}
                  className="relative rounded-3xl cursor-pointer flex flex-col group overflow-hidden"
                  style={{
                    background: "#ffffff",
                    border: "2px solid rgba(46, 90, 67, 0.15)",
                    boxShadow: `
                      0 8px 24px rgba(0, 0, 0, 0.08),
                      0 2px 8px rgba(0, 0, 0, 0.04),
                      inset 0 1px 0 rgba(255, 255, 255, 0.8)
                    `,
                    minHeight: "500px",
                  }}
                >
                  <div className="p-10 flex flex-col h-full">
                    {/* Бейдж "Рекомендуем" */}
                    {(!selectedMethod || selectedMethod === "photo") && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute top-5 right-5 px-4 py-1.5 rounded-full text-xs font-semibold z-10"
                        style={{
                          background: "#2E5A43",
                          color: "#ffffff",
                          boxShadow: "0 2px 8px rgba(46, 90, 67, 0.3)",
                        }}
                      >
                        Рекомендуем
                      </motion.div>
                    )}

                    {!isExpanded || selectedMethod !== "photo" ? (
                      <>
                        <div className="mb-8 flex-grow">
                          {/* Иконка в красивом контейнере */}
                          <div 
                            className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-all group-hover:scale-110"
                            style={{
                              background: "linear-gradient(135deg, rgba(46, 90, 67, 0.1) 0%, rgba(46, 90, 67, 0.05) 100%)",
                            }}
                          >
                            <Upload className="w-8 h-8" style={{ color: "#2E5A43" }} />
                          </div>
                          
                          <h3
                            className="text-3xl font-bold mb-3"
                            style={{
                              fontFamily: "var(--font-serif), Georgia, serif",
                              color: "#000000",
                            }}
                          >
                            С фото товара
                          </h3>
                          <p
                            className="text-base leading-relaxed"
                            style={{
                              fontFamily: "var(--font-sans), Inter, sans-serif",
                              color: "#666666",
                            }}
                          >
                            Быстрее и точнее — распознаем предмет по изображению.
                          </p>
                        </div>

                        <button
                          className="w-full py-5 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all mt-auto group-hover:shadow-lg"
                          style={{
                            background: "#2E5A43",
                            color: "#ffffff",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(46, 90, 67, 0.2)",
                          }}
                        >
                          <Check className="w-5 h-5" />
                          ВЫБРАТЬ
                        </button>
                      </>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col h-full"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBack();
                          }}
                          className="text-sm mb-6 inline-flex items-center gap-2 self-start"
                          style={{ color: "#666666" }}
                        >
                          ← Назад к выбору
                        </button>
                        <h2
                          className="text-4xl md:text-5xl font-bold mb-3"
                          style={{
                            fontFamily: "var(--font-serif), Georgia, serif",
                            color: "#000000",
                          }}
                        >
                          Загрузите фото
                        </h2>
                        <p
                          className="text-base md:text-lg mb-6"
                          style={{
                            fontFamily: "var(--font-sans), Inter, sans-serif",
                            color: "#666666",
                          }}
                        >
                          Мы распознаем товар и предложим точное название.
                        </p>

                        <div
                          onDrop={handleDrop}
                          onDragOver={(e) => e.preventDefault()}
                          className="p-12 rounded-2xl text-center border-2 border-dashed transition-all flex-1 flex items-center justify-center"
                          style={{
                            background: "#fafafa",
                            borderColor: "rgba(0, 0, 0, 0.2)",
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                            id="photo-upload"
                          />
                          <label htmlFor="photo-upload" className="cursor-pointer block w-full">
                            {photoFile ? (
                              <div>
                                <p className="text-lg font-medium mb-2" style={{ color: "#000000" }}>
                                  {photoFile.name}
                                </p>
                                <p className="text-sm" style={{ color: "#666666" }}>
                                  Нажмите для замены
                                </p>
                              </div>
                            ) : (
                              <div>
                                <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: "#2E5A43" }} />
                                <p className="text-lg mb-2" style={{ color: "#000000" }}>
                                  Перетащите фото или нажмите, чтобы выбрать
                                </p>
                              </div>
                            )}
                          </label>
                        </div>

                        <button
                          disabled={!photoFile}
                          className="w-full mt-6 py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: photoFile ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                            color: "#ffffff",
                            border: "none",
                          }}
                        >
                          <Check className="w-5 h-5" />
                          Определить товар
                        </button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>

                {/* Карточка 2: С названия */}
                <motion.div
                  layout
                  initial={false}
                  animate={{
                    width: selectedMethod === "name" ? "85%" : selectedMethod === "photo" ? "15%" : "50%",
                    opacity: selectedMethod === "photo" ? 0.3 : 1,
                  }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  onClick={() => !selectedMethod && handleMethodSelect("name")}
                  className="relative rounded-3xl cursor-pointer flex flex-col group overflow-hidden"
                  style={{
                    background: "#ffffff",
                    border: "2px solid rgba(46, 90, 67, 0.15)",
                    boxShadow: `
                      0 8px 24px rgba(0, 0, 0, 0.08),
                      0 2px 8px rgba(0, 0, 0, 0.04),
                      inset 0 1px 0 rgba(255, 255, 255, 0.8)
                    `,
                    minHeight: "500px",
                  }}
                >
                  <div className="p-10 flex flex-col h-full">
                    {!isExpanded || selectedMethod !== "name" ? (
                      <>
                        <div className="mb-8 flex-grow">
                          {/* Иконка в красивом контейнере */}
                          <div 
                            className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-all group-hover:scale-110"
                            style={{
                              background: "linear-gradient(135deg, rgba(46, 90, 67, 0.1) 0%, rgba(46, 90, 67, 0.05) 100%)",
                            }}
                          >
                            <Type className="w-8 h-8" style={{ color: "#2E5A43" }} />
                          </div>
                          
                          <h3
                            className="text-3xl font-bold mb-3"
                            style={{
                              fontFamily: "var(--font-serif), Georgia, serif",
                              color: "#000000",
                            }}
                          >
                            С названия товара
                          </h3>
                          <p
                            className="text-base leading-relaxed"
                            style={{
                              fontFamily: "var(--font-sans), Inter, sans-serif",
                              color: "#666666",
                            }}
                          >
                            Если фото нет под рукой — начнём с текста и уточним детали.
                          </p>
                        </div>

                        <button
                          className="w-full py-5 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all mt-auto group-hover:shadow-lg"
                          style={{
                            background: "#2E5A43",
                            color: "#ffffff",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(46, 90, 67, 0.2)",
                          }}
                        >
                          <Check className="w-5 h-5" />
                          ВЫБРАТЬ
                        </button>
                      </>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col h-full"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBack();
                          }}
                          className="text-sm mb-6 inline-flex items-center gap-2 self-start"
                          style={{ color: "#666666" }}
                        >
                          ← Назад к выбору
                        </button>
                        <h2
                          className="text-4xl md:text-5xl font-bold mb-3"
                          style={{
                            fontFamily: "var(--font-serif), Georgia, serif",
                            color: "#000000",
                          }}
                        >
                          Введите название
                        </h2>
                        <p
                          className="text-base md:text-lg mb-6"
                          style={{
                            fontFamily: "var(--font-sans), Inter, sans-serif",
                            color: "#666666",
                          }}
                        >
                          ИИ уточнит категорию и ключевые свойства.
                        </p>

                        <input
                          type="text"
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          placeholder='Например: "ведро строительное 12 л"'
                          className="w-full py-4 px-6 rounded-xl text-lg mb-4 outline-none transition-all flex-1"
                          style={{
                            background: "#ffffff",
                            border: "2px solid rgba(0, 0, 0, 0.1)",
                            color: "#000000",
                          }}
                        />

                        <p
                          className="text-sm mb-6"
                          style={{ color: "#666666" }}
                        >
                          Можно добавить 2–3 детали: цвет, объём, материал.
                        </p>

                        <button
                          disabled={!productName.trim()}
                          className="w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: productName.trim() ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                            color: "#ffffff",
                            border: "none",
                          }}
                        >
                          <Check className="w-5 h-5" />
                          Определить товар
                        </button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
