"use client"

import * as React from "react"
import Image from "next/image"
import { 
  motion, 
  useMotionValue, 
  useTransform, 
  animate, 
  useMotionValueEvent, 
  useInView 
} from "framer-motion"

const PRIMARY = "#1F4E3D"
const BG = "#F5F5F0"

// --- ASSETS ---
const IMG_S1_START = "/demo/screen-etap-1.png" 
const IMG_S1_RESULT = "/demo/screen-etap-3.png" 
const IMG_S2_START = "/demo/step2-1.png"
const IMG_S2_RESULT = "/demo/step2-2.png"
const IMG_S3_START = "/demo/screen-etap-3-1.png"
const IMG_S3_RESULT = "/demo/screen-etap-3-2.png"
const IMG_S4_RESULT = "/demo/screen-etap-4-1.png"

const STEPS = [
  {
    id: "step1",
    title: "Понимание",
    description: "Выберите удобный способ: по фото или названию. Система сама определит категорию и подтянет контекст.",
  },
  {
    id: "step2",
    title: "Описание",
    description: "ИИ формирует продающую структуру и текст. Вам останется только проверить и утвердить.",
  },
  {
    id: "step3",
    title: "Визуал",
    description: "Генерация инфографики и визуального контента для вашей карточки.",
  },
  {
    id: "step4",
    title: "Ценовая политика",
    description: "Расчет оптимальной цены и анализ конкурентов для максимальной прибыли.",
  },
]

export function StickyScrollReveal() {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { amount: 0.3, once: true })
  
  const time = useMotionValue(0)
  const [activeStep, setActiveStep] = React.useState(0)

  React.useEffect(() => {
    if (!inView) return
    // Более спокойный и равномерный цикл
    const controls = animate(time, 1, {
      duration: 28,
      repeat: Infinity,
      ease: "linear",
      repeatDelay: 0 
    })
    return () => controls.stop()
  }, [inView, time])

  useMotionValueEvent(time, "change", (v) => {
    const step = Math.min(3, Math.floor(v * 4))
    if (step !== activeStep) setActiveStep(step)
  })

  // --- ЛОГИКА ТАЙМИНГОВ ---
  // 1. Движение: 0 -> 0.12 (2.88 сек)
  // 2. Клик: 0.12 -> 0.13 (0.24 сек)
  // 3. Смена экрана: 0.13
  // 4. Отъезд/Пауза: 0.15 -> 0.25
  
  const cursorX = useTransform(time, 
    // S1 | S2 | S3 | S4
    [0, 0.12, 0.15, 0.25, 
     0.251, 0.37, 0.40, 0.5, 
     0.501, 0.62, 0.64, 0.72, 0.74, 0.75,
     0.751, 0.88, 1], 
    ["10%", "29%", "35%", "35%", 
     "90%", "50%", "55%", "55%", 
     "72%", "92%", "92%", "93%", "93%", "93%",
     "91%", "78%", "68%"] 
  )
  
  const cursorY = useTransform(time,
     [0, 0.12, 0.15, 0.25, 
      0.251, 0.37, 0.40, 0.5, 
      0.501, 0.62, 0.64, 0.72, 0.74, 0.75,
      0.751, 0.88, 1],
     ["20%", "77%", "82%", "82%", 
      "30%", "85%", "90%", "90%", 
      "78%", "92%", "92%", "92%", "92%", "92%",
      "90%", "70%", "56%"]
  )

  const cursorScale = useTransform(time, 
    [
      0.119, 0.12, 0.13,     // click 1
      0.369, 0.37, 0.38,     // click 2
      0.632, 0.634, 0.644,   // click 3 (Выбрать)
      0.732, 0.734, 0.744    // click 4 (Продолжить)
    ], 
    [1, 0.85, 1,  1, 0.85, 1,  1, 0.84, 1,  1, 0.84, 1]
  )

  // --- СМЕНА ЭКРАНОВ ---
  
  // S1 Start
  const op_s1_1 = useTransform(time, [0, 0.13, 0.15], [1, 1, 0])
  // S1 Result
  const op_s1_2 = useTransform(time, [0.13, 0.15, 0.249, 0.25], [0, 1, 1, 0])

  // S2 Start
  const op_s2_1 = useTransform(time, [0.25, 0.251, 0.38, 0.40], [0, 1, 1, 0])
  // S2 Result
  const op_s2_2 = useTransform(time, [0.38, 0.40, 0.499, 0.50], [0, 1, 1, 0])

  // S3 Start
  const op_s3_1 = useTransform(time, [0.50, 0.501, 0.629, 0.64], [0, 1, 1, 0])
  // S3 Result
  const op_s3_2 = useTransform(time, [0.63, 0.64, 0.749, 0.75], [0, 1, 1, 0])
  // S4
  const op_s4 = useTransform(time, [0.75, 0.751, 0.999, 1], [0, 1, 1, 1])

  return (
    <section id="how-it-works" ref={containerRef} className="relative overflow-hidden py-24" style={{ backgroundColor: BG }}>
      {/* Фон сетка */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, ${PRIMARY} 1px, transparent 1px), linear-gradient(to bottom, ${PRIMARY} 1px, transparent 1px)`,
          backgroundSize: "32px 32px"
        }}
      />

      <motion.div
        className="relative max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8"
        initial={{ opacity: 0, y: 28 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        
        {/* Заголовок */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.1]" style={{ fontFamily: 'var(--font-serif)' }}>
            От идеи до карточки — <br/><span style={{ color: PRIMARY }}>за четыре шага.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-12 items-start">
          
          {/* Левая колонка: Текст (БЕЗ РАМОК, ПРЕМИУМ) */}
          <div className="space-y-8 lg:sticky lg:top-32 self-start">
            {STEPS.map((step, i) => {
              const isActive = i === activeStep
              return (
                <div 
                  key={step.id}
                  className={`pl-6 transition-all duration-500 relative cursor-default group`}
                >
                  {/* Индикатор слева */}
                  <div className={`absolute left-0 top-0 bottom-0 w-[2px] transition-all duration-500 rounded-full ${isActive ? 'bg-[#1F4E3D]' : 'bg-gray-200 group-hover:bg-gray-300'}`} 
                       style={{ height: '100%' }} // Линия во всю высоту
                  />
                  {/* Дополнительный "светящийся" активный индикатор поверх */}
                  <div className={`absolute left-0 top-0 w-[2px] transition-all duration-500 rounded-full bg-[#1F4E3D] shadow-[0_0_12px_rgba(31,78,61,0.5)]`}
                       style={{ height: isActive ? '100%' : '0%', opacity: isActive ? 1 : 0 }}
                  />

                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2 transition-colors duration-300" 
                       style={{ color: isActive ? PRIMARY : '#9CA3AF' }}>
                    Шаг 0{i + 1}
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-3 transition-colors duration-300 leading-tight"
                      style={{ 
                        fontFamily: 'var(--font-serif)', 
                        color: isActive ? '#000' : '#9CA3AF'
                      }}>
                    {step.title}
                  </h3>
                  
                  <div className={`overflow-hidden transition-all duration-500 ease-in-out`}
                       style={{ 
                         maxHeight: isActive ? '200px' : '0px', 
                         opacity: isActive ? 1 : 0 
                       }}>
                    <p className="text-sm text-gray-600 leading-relaxed pb-2">
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
            
            <div className="pt-8 pl-6" />
          </div>

          {/* Правая колонка: РАМКА ПО РАЗМЕРУ КАРТИНКИ */}
          <div className="rounded-xl border border-black/10 bg-white shadow-2xl overflow-hidden w-full h-auto">
            
            {/* Шапка браузера */}
            <div className="h-8 bg-gray-50/80 backdrop-blur border-b border-black/5 flex items-center px-4 gap-2 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
              </div>
              <div className="ml-4 flex-1 max-w-[200px] h-4 bg-black/5 rounded-full" />
            </div>

            {/* Контейнер для изображения (AUTO height) */}
            <div className="relative w-full">
              
              {/* ХАК: Невидимое изображение, которое задает высоту контейнера */}
              <img 
                src={IMG_S1_START} 
                alt="Spacer" 
                className="w-full h-auto opacity-0 pointer-events-none block" 
              />
              
              {/* S1.1 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s1_1 }}>
                <img src={IMG_S1_START} alt="Step 1 Start" className="w-full h-full object-contain" />
              </motion.div>
              {/* S1.2 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s1_2 }}>
                <img src={IMG_S1_RESULT} alt="Step 1 Result" className="w-full h-full object-contain" />
              </motion.div>

              {/* S2.1 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s2_1 }}>
                <img src={IMG_S2_START} alt="Step 2 Start" className="w-full h-full object-contain" />
              </motion.div>
              {/* S2.2 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s2_2 }}>
                <img src={IMG_S2_RESULT} alt="Step 2 Result" className="w-full h-full object-contain" />
              </motion.div>

              {/* S3.1 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s3_1 }}>
                <img src={IMG_S3_START} alt="Step 3 Start" className="w-full h-full object-contain" />
              </motion.div>

              {/* S3.2 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s3_2 }}>
                <img src={IMG_S3_RESULT} alt="Step 3 Result" className="w-full h-full object-contain" />
              </motion.div>

              {/* S4 */}
              <motion.div className="absolute inset-0" style={{ opacity: op_s4 }}>
                <img src={IMG_S4_RESULT} alt="Step 4" className="w-full h-full object-contain" />
              </motion.div>

              {/* Курсор */}
              <motion.div
                className="absolute z-30 pointer-events-none drop-shadow-xl"
                style={{ 
                  left: cursorX, 
                  top: cursorY,
                  scale: cursorScale
                }}
              >
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" className="drop-shadow-sm">
                  <path d="M3 3L10 21L12.5 14L19 12.5L3 3Z" fill="#D9F99D" stroke="#1F4E3D" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <motion.div
                  className="absolute -inset-2 rounded-full border-2 border-[#D9F99D]"
                  style={{
                     scale: cursorScale,
                     opacity: useTransform(cursorScale, [0.85, 1], [1, 0])
                  }}
                />
              </motion.div>

            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
