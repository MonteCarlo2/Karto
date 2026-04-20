import fs from "fs";

/** Как в справке Mail: поддомен mailru._domainkey → селектор mailru */
const DEFAULT_SELECTOR = "mailru";

function normalizePemFromEnv(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function domainFromEmailField(raw: string): string | null {
  const m = raw.match(/<([^>]+)>/);
  const addr = (m ? m[1] : raw).trim();
  const at = addr.lastIndexOf("@");
  if (at < 0 || at === addr.length - 1) return null;
  return addr.slice(at + 1).toLowerCase().trim();
}

/**
 * DKIM-подпись исходящих писем в приложении (как в инструкции Mail.ru: ключ на сервере + TXT в DNS).
 * Задайте SMTP_DKIM_PRIVATE_KEY (PEM, в .env можно \\n) или SMTP_DKIM_PRIVATE_KEY_PATH к файлу на сервере.
 * SMTP_DKIM_DOMAIN — обычно karto.pro; иначе берётся домен из SMTP_FROM / SMTP_USER.
 * SMTP_DKIM_KEY_SELECTOR — по умолчанию mailru (запись mailru._domainkey).
 */
export function getSmtpDkimSigningOption(): {
  domainName: string;
  keySelector: string;
  privateKey: string;
} | null {
  let privateKey: string | undefined;
  const keyPath = process.env.SMTP_DKIM_PRIVATE_KEY_PATH?.trim();
  if (keyPath) {
    try {
      privateKey = fs.readFileSync(keyPath, "utf8").trim();
    } catch (e) {
      console.error("[smtp-dkim] не прочитан SMTP_DKIM_PRIVATE_KEY_PATH:", keyPath, e);
      return null;
    }
  } else {
    const raw = process.env.SMTP_DKIM_PRIVATE_KEY?.trim();
    if (raw) privateKey = normalizePemFromEnv(raw);
  }

  if (!privateKey || !privateKey.includes("PRIVATE KEY")) {
    return null;
  }

  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "";
  const domainFromAddr = from ? domainFromEmailField(from) : null;
  const domainExplicit = process.env.SMTP_DKIM_DOMAIN?.trim().toLowerCase();
  const domainName = (domainExplicit || domainFromAddr || "").toLowerCase();

  if (!domainName) {
    console.warn(
      "[smtp-dkim] укажите SMTP_DKIM_DOMAIN (например karto.pro) или SMTP_FROM с адресом @karto.pro"
    );
    return null;
  }

  const keySelector = process.env.SMTP_DKIM_KEY_SELECTOR?.trim() || DEFAULT_SELECTOR;

  if (domainFromAddr && domainFromAddr !== domainName) {
    console.warn(
      `[smtp-dkim] домен в From (${domainFromAddr}) ≠ SMTP_DKIM_DOMAIN (${domainName}) — в Postmaster нужен d=${domainName}`
    );
  }

  return { domainName, keySelector, privateKey };
}
