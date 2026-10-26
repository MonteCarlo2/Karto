/**
 * Статистика для задач спроса. Без внешних библиотек.
 * Счётные величины — условный биномиальный тест; доли — z или Фишер.
 */

export type RateTestOk = {
  status: "ok";
  pValue: number;
  relativeChange: number;
  test: "poisson_conditional_binomial";
};

export type RateTestNoData = {
  status: "no_data";
  pValue: null;
  relativeChange: null;
  test: "poisson_conditional_binomial";
};

export type RateTestResult = RateTestOk | RateTestNoData;

export type ProportionTestOk = {
  status: "ok";
  pValue: number;
  relativeChange: number;
  test: "two_proportion_z" | "fisher_exact";
  z: number | null;
};

export type ProportionTestInapplicable = {
  status: "inapplicable";
  pValue: null;
  relativeChange: null;
  test: "two_proportion";
  z: null;
};

export type ProportionTestResult = ProportionTestOk | ProportionTestInapplicable;

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

/** Lanczos approximation for ln Γ(z), z > 0. */
export function lgamma(z: number): number {
  if (!(z > 0) || !Number.isFinite(z)) return Number.NaN;
  if (z < 0.5) {
    // reflection: Γ(z)Γ(1−z)=π/sin(πz)
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843696540787436e-6,
    1.5056327351493116e-7,
  ];
  const x = z - 1;
  let a = c[0]!;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  const t = x + g + 0.5;
  return LOG_SQRT_2PI + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logFactorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return Number.NaN;
  if (n <= 1) return 0;
  return lgamma(n + 1);
}

/** ln Binomial(n, k) * p^k * (1-p)^(n-k) */
function logBinomPmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (p <= 0) return k === 0 ? 0 : -Infinity;
  if (p >= 1) return k === n ? 0 : -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
}

function binomPmf(n: number, k: number, p: number): number {
  return Math.exp(logBinomPmf(n, k, p));
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return sign === 1 ? 1 - p : p;
}

/**
 * Сравнение двух пуассоновских темпов через условный биномиальный тест.
 * x2 | (x1+x2) ~ Binomial(n, t2/(t1+t2)) при H0: λ1=λ2.
 */
export function poissonRateTest(x1: number, t1: number, x2: number, t2: number): RateTestResult {
  if (!(t1 > 0) || !(t2 > 0) || x1 < 0 || x2 < 0 || !Number.isFinite(x1) || !Number.isFinite(x2)) {
    return { status: "no_data", pValue: null, relativeChange: null, test: "poisson_conditional_binomial" };
  }
  const n = x1 + x2;
  if (n === 0) {
    return { status: "no_data", pValue: null, relativeChange: null, test: "poisson_conditional_binomial" };
  }
  const rate1 = x1 / t1;
  const rate2 = x2 / t2;
  const relativeChange = rate1 > 0 ? rate2 / rate1 - 1 : rate2 > 0 ? Infinity : 0;
  const p0 = t2 / (t1 + t2);
  let pValue: number;

  if (n <= 2000) {
    const observed = binomPmf(n, x2, p0);
    let sum = 0;
    for (let k = 0; k <= n; k++) {
      const pk = binomPmf(n, k, p0);
      if (pk <= observed + 1e-15) sum += pk;
    }
    pValue = Math.min(1, Math.max(0, sum));
  } else {
    const mean = n * p0;
    const sd = Math.sqrt(n * p0 * (1 - p0));
    if (!(sd > 0)) {
      pValue = x2 === mean ? 1 : 0;
    } else {
      const z = (Math.abs(x2 - mean) - 0.5) / sd;
      pValue = Math.min(1, Math.max(0, 2 * (1 - normalCdf(z))));
    }
  }

  return {
    status: "ok",
    pValue,
    relativeChange: Number.isFinite(relativeChange) ? relativeChange : relativeChange,
    test: "poisson_conditional_binomial",
  };
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** Двусторонний точный тест Фишера для таблицы 2×2. */
export function fisherExactTwoSided(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  const r1 = a + b;
  const c1 = a + c;
  const lo = Math.max(0, r1 + c1 - n);
  const hi = Math.min(r1, c1);
  const logObs = logChoose(r1, a) + logChoose(n - r1, c1 - a) - logChoose(n, c1);
  let sum = 0;
  for (let x = lo; x <= hi; x++) {
    const logP = logChoose(r1, x) + logChoose(n - r1, c1 - x) - logChoose(n, c1);
    if (logP <= logObs + 1e-12) sum += Math.exp(logP);
  }
  return Math.min(1, Math.max(0, sum));
}

/**
 * Односторонний Фишер: H1 — доля в первой строке (a/(a+b)) выше, чем во второй (c/(c+d)).
 * Суммирует P(X ≥ a) по гипергеометрическому распределению.
 */
export function fisherExactOneSidedGreater(a: number, b: number, c: number, d: number): number {
  if (
    ![a, b, c, d].every((v) => Number.isFinite(v) && v >= 0) ||
    !Number.isInteger(a + b + c + d)
  ) {
    return 1;
  }
  const aa = Math.round(a);
  const bb = Math.round(b);
  const cc = Math.round(c);
  const dd = Math.round(d);
  const n = aa + bb + cc + dd;
  if (!(n > 0)) return 1;
  const r1 = aa + bb;
  const c1 = aa + cc;
  const hi = Math.min(r1, c1);
  let sum = 0;
  for (let x = aa; x <= hi; x++) {
    const logP = logChoose(r1, x) + logChoose(n - r1, c1 - x) - logChoose(n, c1);
    sum += Math.exp(logP);
  }
  return Math.min(1, Math.max(0, sum));
}

/**
 * Сравнение двух долей. z с объединённой долей; при ожидаемых < 5 — Фишер.
 * Если s > n — неприменимо (у WB заказ без корзины возможен).
 */
export function twoProportionTest(s1: number, n1: number, s2: number, n2: number): ProportionTestResult {
  if (
    !(n1 > 0) ||
    !(n2 > 0) ||
    s1 < 0 ||
    s2 < 0 ||
    !Number.isFinite(s1) ||
    !Number.isFinite(s2) ||
    !Number.isFinite(n1) ||
    !Number.isFinite(n2)
  ) {
    return { status: "inapplicable", pValue: null, relativeChange: null, test: "two_proportion", z: null };
  }
  if (s1 > n1 || s2 > n2) {
    return { status: "inapplicable", pValue: null, relativeChange: null, test: "two_proportion", z: null };
  }
  const p1 = s1 / n1;
  const p2 = s2 / n2;
  const relativeChange = p1 > 0 ? p2 / p1 - 1 : p2 > 0 ? Infinity : 0;
  const pooled = (s1 + s2) / (n1 + n2);
  const expected = [
    n1 * pooled,
    n1 * (1 - pooled),
    n2 * pooled,
    n2 * (1 - pooled),
  ];
  const useFisher = expected.some((e) => e < 5);

  if (useFisher) {
    const a = s1;
    const b = n1 - s1;
    const c = s2;
    const d = n2 - s2;
    return {
      status: "ok",
      pValue: fisherExactTwoSided(a, b, c, d),
      relativeChange: Number.isFinite(relativeChange) ? relativeChange : relativeChange,
      test: "fisher_exact",
      z: null,
    };
  }

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (!(se > 0)) {
    return {
      status: "ok",
      pValue: p1 === p2 ? 1 : 0,
      relativeChange: Number.isFinite(relativeChange) ? relativeChange : relativeChange,
      test: "two_proportion_z",
      z: 0,
    };
  }
  const z = (p1 - p2) / se;
  const pValue = Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))));
  return {
    status: "ok",
    pValue,
    relativeChange: Number.isFinite(relativeChange) ? relativeChange : relativeChange,
    test: "two_proportion_z",
    z,
  };
}

/**
 * Benjamini–Hochberg FDR. Возвращает rejected[i] для исходного порядка pValues.
 */
export function benjaminiHochberg(pValues: number[], q: number): boolean[] {
  const m = pValues.length;
  const rejected = Array.from({ length: m }, () => false);
  if (m === 0 || !(q > 0)) return rejected;
  const order = pValues
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p - b.p);
  let maxK = 0;
  for (let i = 0; i < m; i++) {
    const rank = i + 1;
    if (order[i]!.p <= (q * rank) / m) maxK = rank;
  }
  for (let i = 0; i < maxK; i++) {
    rejected[order[i]!.index] = true;
  }
  return rejected;
}

/** Скорректированное p по BH для отчёта (не для решения). */
export function bhAdjustedPValues(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const order = pValues
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p - b.p);
  const adj = Array.from({ length: m }, () => 1);
  let running = 1;
  for (let i = m - 1; i >= 0; i--) {
    const rank = i + 1;
    const raw = (order[i]!.p * m) / rank;
    running = Math.min(running, raw);
    adj[order[i]!.index] = Math.min(1, running);
  }
  return adj;
}

/** P(X = k) для X ~ Poisson(λ). */
export function poissonPmf(k: number, lambda: number): number {
  if (!(lambda >= 0) || !Number.isFinite(lambda) || k < 0 || !Number.isInteger(k)) return Number.NaN;
  if (lambda === 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

/** P(X ≤ k) для X ~ Poisson(λ). */
export function poissonCdfLower(k: number, lambda: number): number {
  if (!(lambda >= 0) || !Number.isFinite(lambda) || k < 0 || !Number.isInteger(k)) return Number.NaN;
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPmf(i, lambda);
  return Math.min(1, Math.max(0, sum));
}

/** P(X = 0) = e^(−λ). */
export function poissonZeroP(lambda: number): number {
  if (!(lambda >= 0) || !Number.isFinite(lambda)) return Number.NaN;
  return Math.exp(-lambda);
}

/**
 * BH-порог для ранга r при m тестах и q: (r/m)×q.
 * Для отчёта эталонов (ранг 1 = наименьший p).
 */
export function bhCriticalValue(rank: number, m: number, q: number): number {
  if (!(m > 0) || !(rank > 0) || !(q > 0)) return 0;
  return (q * rank) / m;
}
