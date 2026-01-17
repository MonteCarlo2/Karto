"use client";

interface StageMenuProps {
  currentStage: "understanding" | "description" | "visual" | "price";
}

export function StageMenu({ currentStage }: StageMenuProps) {
  const stages = [
    { id: "understanding", label: "Понимание" },
    { id: "description", label: "Описание" },
    { id: "visual", label: "Визуал" },
    { id: "price", label: "Цена" },
  ];

  return (
    <div className="fixed top-8 right-8 z-50">
      <div className="flex items-center gap-4 px-6 py-3 rounded-full" style={{
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
      }}>
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full transition-all"
              style={{
                backgroundColor: currentStage === stage.id 
                  ? "#2E5A43" 
                  : "rgba(0, 0, 0, 0.2)",
                boxShadow: currentStage === stage.id
                  ? "0 0 8px rgba(46, 90, 67, 0.4)"
                  : "none",
              }}
            />
            <span
              className="text-sm font-medium transition-all"
              style={{
                color: currentStage === stage.id 
                  ? "#2E5A43" 
                  : "rgba(0, 0, 0, 0.6)",
                fontSize: currentStage === stage.id ? "15px" : "14px",
              }}
            >
              {stage.label}
            </span>
            {index < stages.length - 1 && (
              <div className="w-8 h-px mx-2" style={{ backgroundColor: "rgba(0, 0, 0, 0.1)" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
