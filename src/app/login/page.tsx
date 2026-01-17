import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"

export const metadata: Metadata = {
  title: "Вход — KARTO",
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-muted/20">
      <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-xl shadow-sm border border-border">
        <div className="flex flex-col items-center">
          <Logo className="mb-6 text-2xl" />
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Войдите в свой аккаунт
          </h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              id="email"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="name@example.com"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-1">Пароль</label>
            <input
              type="password"
              id="password"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <Button className="w-full mt-6">
            Войти
          </Button>
          
          <div className="text-center text-sm text-muted-foreground mt-4">
            <Link href="#" className="hover:text-primary underline">Забыли пароль?</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
