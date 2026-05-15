/**
 * Провайдер изображений для свободного творчества (`/api/generate-free` только фото-поток).
 *
 * По умолчанию: **WaveSpeed** при наличии `WAVESPEED_API_KEY`, иначе **KIE** (чтобы средa без ключа не ломалась).
 *
 * Явное переопределение: `FREE_GEN_IMAGE_PROVIDER` = `kie` | `evolink` | `wavespeed`
 */

export type FreeGenImageProviderId = "kie" | "evolink" | "wavespeed";

export function getFreeGenImageProvider(): FreeGenImageProviderId {
  const raw = process.env.FREE_GEN_IMAGE_PROVIDER?.trim().toLowerCase() ?? "";

  if (raw === "kie") return "kie";
  if (raw === "evolink" || raw === "evo_link") return "evolink";
  if (raw === "wavespeed" || raw === "wave_speed") return "wavespeed";

  return process.env.WAVESPEED_API_KEY?.trim() ? "wavespeed" : "kie";
}
