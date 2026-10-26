"use client";

import Link from "next/link";
import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Package,
  Truck,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  ShoppingCart,
  Tag,
  Ticket,
  Wallet,
  Bot,
  BookOpen,
  Warehouse,
} from "lucide-react";
import type { ComponentType } from "react";
import { KartoLogoMark, Logo } from "@/components/ui/logo";
import {
  SELLER_HUB_AREAS,
  SELLER_HUB_NAV_GROUPS,
  type SellerHubAreaId,
} from "@/lib/seller-hub/nav";
import { hub, hubSans } from "./hub-ui";

export const HUB_RAIL_EXPANDED = 268;
export const HUB_RAIL_COLLAPSED = 84;

const AREA_ICON: Record<SellerHubAreaId, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  overview: LayoutDashboard,
  tasks: ListTodo,
  events: Activity,
  catalog: Boxes,
  prices: Tag,
  stocks: Warehouse,
  promotions: Ticket,
  analytics: BarChart3,
  orders: ShoppingCart,
  deliveries: Package,
  logistics: Truck,
  ads: Megaphone,
  finance: Wallet,
  agents: Bot,
  knowledge: BookOpen,
  verification: ClipboardCheck,
  integration: Plug,
};

function RailAreaButton({
  area,
  active,
  collapsed,
  planned,
  onClick,
}: {
  area: { id: SellerHubAreaId; label: string };
  active: boolean;
  collapsed: boolean;
  planned?: boolean;
  onClick: () => void;
}) {
  const Icon = AREA_ICON[area.id];

  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? area.label : undefined}
      className={`flex w-full items-center rounded-xl transition-colors ${
        collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2 text-left"
      } ${
          active
          ? "bg-[#B9FF4B] text-[#0E1116]"
          : "text-[#0E1116] hover:bg-[#F4F6F8]"
      }`}
      style={hubSans}
    >
      <Icon className="h-5 w-5 shrink-0 text-[#0a0a0a]" strokeWidth={2.25} />

      {!collapsed ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-[15.5px] font-semibold leading-6 tracking-[-0.01em]">
            {area.label}
          </span>
          {planned ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
              style={{ backgroundColor: "rgba(185,255,75,0.16)", color: hub.lime }}
            >
              скоро
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

export function HubSidebar({
  collapsed,
  onToggleCollapsed,
  area,
  onAreaChange,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  area: SellerHubAreaId;
  onAreaChange: (id: SellerHubAreaId) => void;
}) {
  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden border-e border-[#E3E6EB]"
      style={{ backgroundColor: hub.railBg, ...hubSans }}
    >
      <div className={`flex shrink-0 justify-center ${collapsed ? "px-3 pb-2 pt-2" : "px-5 pb-4 pt-2"}`}>
        <Link href="/" title="На главную KARTO" className="outline-none">
          {collapsed ? <KartoLogoMark size={72} /> : <Logo maxWidth={330} maxHeight={114} className="justify-center" />}
        </Link>
      </div>

      <nav
        aria-label="Разделы Seller Hub"
        className={`min-h-0 flex-1 overflow-y-auto py-2 ${collapsed ? "px-2.5" : "px-3"}`}
      >
        <div className="space-y-8">
          {SELLER_HUB_NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {!collapsed && group.label ? (
                <p
                  className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: hub.railTextMuted }}
                >
                  {group.label}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {group.areaIds.map((id) => {
                  const meta = SELLER_HUB_AREAS.find((item) => item.id === id);
                  if (!meta) return null;
                  return (
                    <RailAreaButton
                      key={meta.id}
                      area={meta}
                      planned={meta.planned}
                      active={area === meta.id}
                      collapsed={collapsed}
                      onClick={() => onAreaChange(meta.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className={`shrink-0 space-y-2 border-t py-3 ${collapsed ? "px-2.5" : "px-3"}`} style={{ borderColor: hub.railBorder }}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-[#E3E6EB] bg-white text-[12px] font-semibold text-[#0E1116] transition-colors hover:bg-[#F4F6F8] ${
            collapsed ? "px-2 py-3" : "px-3 py-2.5"
          }`}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={2.1} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={2.1} />
          )}
          {collapsed ? null : "Свернуть меню"}
        </button>
      </div>
    </aside>
  );
}
