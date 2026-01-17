import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata: Metadata = {
  title: "KARTO Studio",
  description: "Рабочее пространство для создания карточек.",
}

export default function AppPage() {
  return (
    <div className="flex-grow flex items-center justify-center bg-muted/20 min-h-[60vh]">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold mb-3">KARTO Studio</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Мастер создания карточки товара находится в разработке. 
          Скоро здесь появится полноценный редактор.
        </p>
        
        <div className="space-y-4">
          <Button size="lg" className="w-full">
            Оставить заявку на ранний доступ
          </Button>
          
          <Button variant="ghost" asChild className="w-full">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Вернуться на главную
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
