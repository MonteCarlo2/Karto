"use client";

import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesShopSettings,
} from "@/lib/auto-replies/settings-types";
import { WorkspaceModePanel } from "./workspace-mode-panel";
import { WorkspaceSignaturesPanel } from "./workspace-signatures-panel";
import { WorkspaceStylePanel } from "./workspace-style-panel";
import { WorkspaceTrainingPanel } from "./workspace-training-panel";
import { WorkspaceRestrictionsPanel } from "./workspace-restrictions-panel";
import { WorkspaceIntegrationPanel } from "./workspace-integration-panel";

export type WorkspaceNavKey =
  | "overview"
  | "mode"
  | "integration"
  | "style"
  | "templates"
  | "training"
  | "advanced"
  | "activity";

export type WorkspacePanelsProps = {
  navKey: WorkspaceNavKey;
  shopId: string;
  marketplaceLabel: string;
  marketplaceId: AutoRepliesMarketplaceId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandDescription?: string | null;
  brandName?: string | null;
  onPatchShop: (patch: Parameters<typeof import("@/lib/auto-replies/settings-store").patchShopSettings>[1]) => void;
  onPatchMp: (patch: Parameters<typeof import("@/lib/auto-replies/settings-store").patchMarketplaceSettings>[2]) => void;
  onSetUsage: (usage: AutoRepliesUsageId) => void;
  onGoIntegration?: () => void;
  onRemoveIntegration?: () => void | Promise<void>;
  removingIntegration?: boolean;
};

export function WorkspacePanels(props: WorkspacePanelsProps) {
  const {
    navKey,
    shopId,
    marketplaceLabel,
    marketplaceId,
    shopSettings,
    mpSettings,
    onPatchShop,
    onPatchMp,
    onSetUsage,
    onGoIntegration,
    brandDescription,
    brandName,
  } = props;

  const usage = mpSettings.usage;
  const conn = mpSettings.connection;

  if (navKey === "mode") {
    return (
      <WorkspaceModePanel
        usage={usage}
        marketplaceLabel={marketplaceLabel}
        connectionOk={conn.status === "active"}
        mpSettings={mpSettings}
        onPatchMp={onPatchMp}
        onSetUsage={onSetUsage}
        onGoIntegration={onGoIntegration}
      />
    );
  }

  if (navKey === "integration") {
    return (
      <WorkspaceIntegrationPanel
        marketplaceId={marketplaceId}
        shopName={brandName}
        usage={usage}
        mpSettings={mpSettings}
        onPatchMp={onPatchMp}
        onRemoveIntegration={props.onRemoveIntegration}
        removingIntegration={props.removingIntegration}
      />
    );
  }

  if (navKey === "style") {
    return (
      <WorkspaceStylePanel
        style={shopSettings.style}
        onPatchStyle={(patch) => onPatchShop({ style: patch })}
      />
    );
  }

  if (navKey === "templates") {
    return (
      <WorkspaceSignaturesPanel
        templates={shopSettings.templates}
        brandName={brandName}
        onPatchTemplates={(patch) => onPatchShop({ templates: patch })}
      />
    );
  }

  if (navKey === "training") {
    return (
      <WorkspaceTrainingPanel
        shopId={shopId}
        training={shopSettings.training}
        brandDescription={brandDescription}
        onPatchTraining={(patch) => onPatchShop({ training: patch })}
      />
    );
  }

  if (navKey === "advanced") {
    return (
      <WorkspaceRestrictionsPanel
        advanced={shopSettings.advanced}
        onPatchAdvanced={(patch) => onPatchShop({ advanced: patch })}
      />
    );
  }

  if (navKey === "overview" || navKey === "activity") {
    return null;
  }

  return null;
}
