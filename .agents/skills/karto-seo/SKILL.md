---
name: karto-seo
description: SEO-продвижение karto.pro через OpenSEO MCP и seo-workspace/karto-pro. Используй при запросах про продвижение сайта, ключи, конкурентов, GSC, мета-теги лендинга.
---

# KARTO SEO (karto.pro + OpenSEO)

## Когда применять

Пользователь просит: продвижение KARTO, SEO сайта, ключевые слова для лендинга, конкуренты в Google, Search Console, rank tracking — **не** SEO карточек на WB/Ozon (это продукт «Поток»).

## Обязательный контекст

1. Прочитай `seo-workspace/karto-pro/README.md`.
2. Проверь OpenSEO MCP: `list_projects`, при необходимости `get_search_console_performance` для `karto.pro`.
3. Если MCP недоступен — скажи подключить `.cursor/mcp.json` → `https://app.openseo.so/mcp` и залогиниться.

## Стек

| Слой | Где |
|------|-----|
| Данные (ключи, SERP, GSC) | OpenSEO MCP |
| Воркфлоу | Skills: `keyword-research`, `keyword-clustering`, `competitive-landscape`, `seo-project-setup` |
| Правки на сайте | `src/app/layout.tsx` (metadata), `src/app/sitemap.ts`, лендинги `src/app/page.tsx`, `src/app/pricing/` |
| Документация setup | `docs/SEO_OPENSEO_SETUP.md` |

## Типовые задачи → skill

| Задача | Skill / MCP |
|--------|-------------|
| Первый запуск | `seo-project-setup` |
| Не знаю с чего начать | `seo-coach` |
| Собрать ключи | `keyword-research` + сохранить в `seo-workspace/karto-pro/keywords/` |
| Разложить по страницам | `keyword-clustering` |
| Кто в выдаче | `competitive-landscape`, `competitor-analysis` |
| Реальные клики | MCP `get_search_console_performance` |
| Позиции | rank tracker в OpenSEO UI |

## Правки в репозитории

После исследования можно менять:

- `metadata` / JSON-LD в `src/app/layout.tsx`
- `src/app/sitemap.ts` — только публичные URL
- Тексты лендинга, FAQ, H1 — если пользователь просит внедрить

Не меняй логику оплаты, auth, студии без явного запроса.

## Выход

Краткий отчёт: ключи → страница → что поменять в коде → что отслеживать в OpenSEO.
