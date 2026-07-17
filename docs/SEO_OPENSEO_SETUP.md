# OpenSEO для продвижения karto.pro

OpenSEO **не встраивается в код KARTO** для пользователей. Это **внутренний SEO-инструмент команды**: отдельное приложение + MCP в Cursor + skills в `.agents/skills/`.

## Архитектура (как это реально работает)

```text
┌─────────────────┐     MCP      ┌──────────────────┐     API      ┌─────────────┐
│ Cursor (вы)     │ ──────────► │ OpenSEO          │ ───────────► │ DataForSEO  │
│ + Agent Skills  │             │ app.openseo.so   │              │ (платно)    │
└────────┬────────┘             └────────┬─────────┘              └─────────────┘
         │                               │
         │ правки кода                   │ GSC OAuth
         ▼                               ▼
┌─────────────────┐             ┌──────────────────┐
│ karto-new repo  │             │ Google Search    │
│ layout, sitemap │             │ Console          │
└─────────────────┘             └──────────────────┘
```

1. **OpenSEO** даёт данные: ключи, SERP, позиции, аудит, GSC.
2. **MCP** подключает эти данные к Cursor — агент исследует, не выдумывает volume/KD.
3. **Skills** (`keyword-research`, …) — пошаговые сценарии.
4. **seo-workspace/karto-pro/** — контекст проекта KARTO.
5. **Вы** (или агент) вносите правки в `layout.tsx`, лендинги, `sitemap.ts`.

---

## Вариант A — быстрый старт (рекомендуется)

Без Docker, hosted OpenSEO.

### 1. Аккаунт и ключ DataForSEO

1. Зарегистрируйтесь на [openseo.so](https://openseo.so) или подключите DataForSEO в настройках.
2. [DataForSEO API Access](https://app.dataforseo.com/api-access) → скопируйте **Base64** credentials (есть $1 на тест).

### 2. MCP в Cursor (уже в репозитории)

Файл `.cursor/mcp.json` в gitignore — скопируйте шаблон:

```bash
mkdir -p .cursor
cp docs/openseo-mcp.json.example .cursor/mcp.json
```

Или вручную:

```json
{
  "mcpServers": {
    "openseo": {
      "url": "https://app.openseo.so/mcp"
    }
  }
}
```

**Cursor → Settings → MCP** — перезапустите MCP, при первом вызове **войдите в OpenSEO**.

### 3. Skills (уже установлены)

```bash
npx skills add every-app/open-seo --skill "*"
```

Skills лежат в `.agents/skills/` (keyword-research, seo-project-setup, …).

### 4. Проект в OpenSEO

1. В OpenSEO создайте проект **karto.pro**.
2. **Integrations → Google Search Console** — привяжите `karto.pro`.
3. Добавьте 20–50 ключей из `seo-workspace/karto-pro/README.md` в rank tracker.

### 5. Первая команда в Cursor

```
Прочитай seo-workspace/karto-pro/README.md.
Проверь OpenSEO MCP (list_projects).
Запусти keyword-research по seed keywords и предложи правки metadata для главной и /pricing.
```

---

## Вариант B — self-host (Docker, localhost)

Для работы только на вашем ПК/сервере без openseo.so UI.

```bash
cd infra/openseo
cp .env.example .env
# Вставьте DATAFORSEO_API_KEY
docker compose up -d
# UI: http://localhost:3001
```

**Важно:** `AUTH_MODE=local_noauth` — **не открывайте порт в интернет** без настройки auth (см. [open-seo docs](https://github.com/every-app/open-seo)).

Для GSC на self-host нужны `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` — см. `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md` в репозитории open-seo.

MCP при self-host: URL будет свой (см. раздел AI & MCP в локальном UI).

---

## Еженедельный процесс

| День | Действие |
|------|----------|
| Пн | GSC: топ запросы за 7 дней (MCP или OpenSEO UI) |
| Вт | keyword-research / clustering → файл в `seo-workspace/karto-pro/keywords/` |
| Ср | 1–2 правки на сайте (title, FAQ, внутренние ссылки) |
| Пт | Rank tracker: что выросло/упало |

---

## Что уже в репозитории KARTO

- `metadata`, Open Graph, JSON-LD — `src/app/layout.tsx`
- `robots.ts`, `sitemap.ts`
- Яндекс.Метрика — отдельно от GSC (оба нужны)

После исследования OpenSEO обновляйте `keywords` в metadata и тексты лендинга под кластеры.

---

## Стоимость

- OpenSEO: **$0** (open source)
- DataForSEO: pay-as-you-go (~$50 минимальное пополнение после тестового $1)
- Ориентир: 100 keyword research ≈ $3.5 (см. README open-seo)

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| MCP не коннектится | URL ровно `https://app.openseo.so/mcp`, перелогин |
| Нет проекта | `list_projects` в MCP, создать karto.pro в UI |
| GSC пустой | Подключить домен в OpenSEO Integrations |
| Агент «придумывает» ключи | Не работать без MCP; использовать skill `keyword-research` |
