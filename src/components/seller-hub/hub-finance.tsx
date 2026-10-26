"use client";

import { useState } from "react";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, hub, HubEmptyState, HubPanel, HubSegmented, hubSans } from "./hub-ui";
import { HubFinancePnl } from "./hub-finance-pnl";
import { Wallet } from "lucide-react";

type FinanceTab = "pnl" | "balance";

/** Финансы: отчёт «Прибыли и убытки» (расчёт по данным WB) и баланс с документами WB. */
export function HubFinance({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
  const [tab, setTab] = useState<FinanceTab>("pnl");
  return (
    <div className="space-y-3">
      <HubSegmented<FinanceTab>
        layoutId="finance-tab"
        value={tab}
        onChange={setTab}
        options={[
          { id: "pnl", label: "Прибыли и убытки" },
          { id: "balance", label: "Баланс и документы" },
        ]}
      />
      {tab === "pnl" ? <HubFinancePnl snapshot={snapshot} connected={connected} /> : <HubFinanceBalance snapshot={snapshot} />}
    </div>
  );
}

function HubFinanceBalance({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const finance = snapshot?.finance;
  if (!finance) {
    return (
      <HubPanel className="min-h-[320px]">
        <HubEmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Финансы появятся после выгрузки"
          description="Обновите данные кабинета. Если категория «Финансы» выключена в токене, здесь будет честный статус, а не нули."
        />
      </HubPanel>
    );
  }

  if (!finance.available) {
    return (
      <HubPanel className="min-h-[320px]">
        <HubEmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Баланс недоступен этому токену"
          description={finance.note ?? "Добавьте категорию «Финансы» в персональный токен WB."}
        />
      </HubPanel>
    );
  }

  return (
    <div>
      <div className="grid border-b sm:grid-cols-2" style={{ borderColor: hub.borderSoft }}>
        <div className="px-1 py-4 sm:pr-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
            На счёте
          </p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums" style={{ color: hub.text }}>
            {finance.balance != null ? `${formatInt(Math.round(finance.balance))} ₽` : "—"}
          </p>
          <p className="text-[13px]" style={{ color: hub.textMuted }}>
            Сколько WB показывает как текущий баланс
          </p>
        </div>
        <div className="border-t px-1 py-4 sm:border-l sm:border-t-0 sm:pl-6" style={{ borderColor: hub.borderSoft }}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
            К выводу
          </p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums" style={{ color: hub.text }}>
            {finance.forWithdraw != null ? `${formatInt(Math.round(finance.forWithdraw))} ₽` : "—"}
          </p>
        </div>
      </div>
      <HubPanel>
        <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
          <h2 className="text-[16px] font-semibold" style={hubSans}>
            Документы
          </h2>
        </div>
        {finance.documents.length === 0 ? (
          <p className="px-5 py-8 text-[14px]" style={{ color: hub.textMuted }}>
            Список документов пуст или метод не вернул строк.
          </p>
        ) : (
          <ul>
            {finance.documents.map((doc) => (
              <li key={doc.id} className="border-b px-5 py-3 last:border-b-0" style={{ borderColor: hub.borderSoft }}>
                <p className="text-[14px] font-medium" style={{ color: hub.text }}>
                  {doc.title}
                </p>
                <p className="text-[12px]" style={{ color: hub.textSubtle }}>
                  {doc.category ?? "Документ"}
                  {doc.createdAt ? ` · ${doc.createdAt}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </HubPanel>
      <p className="text-[13px] leading-relaxed" style={{ color: hub.textMuted }}>
        Чистая прибыль по SKU считается в юнит-экономике KARTO: цена минус комиссия, логистика и ваша себестоимость. Устаревший отчёт реализации WB сюда не подключён.
      </p>
    </div>
  );
}
