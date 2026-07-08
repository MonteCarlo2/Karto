import metaJson from "./data/ozon/meta.json";

export type OzonClusterOption = {
  id: string;
  label: string;
};

export const ozonMeta = metaJson;

export const OZON_SHIP_CLUSTERS: OzonClusterOption[] = metaJson.shipClusters.map((name) => ({
  id: name,
  label: name,
}));

export const OZON_DELIVERY_CLUSTERS: OzonClusterOption[] = metaJson.deliveryClusters.map((name) => ({
  id: name,
  label: name,
}));

export const OZON_DEFAULT_CATEGORY_ID = metaJson.defaultCategoryId;
export const OZON_DEFAULT_SHIP_CLUSTER = metaJson.defaultShipCluster;
export const OZON_DEFAULT_DELIVERY_CLUSTER = metaJson.defaultDeliveryCluster;
