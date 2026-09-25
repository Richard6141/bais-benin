import { cropSeasonDeclare } from "./crop-season-declare";
import { farmCreate } from "./farm-create";
import { farmerCreate } from "./farmer-create";
import { harvestDeclare } from "./harvest-declare";
import { parcelCreate } from "./parcel-create";
import { parcelGeometrySet } from "./parcel-geometry-set";
import type { SyncHandlers } from "./types";
import { verificationRecord } from "./verification-record";
import { alertRelay } from "./alert-relay";

export const syncHandlers: SyncHandlers = {
  "farmer.create": farmerCreate,
  "farm.create": farmCreate,
  "parcel.create": parcelCreate,
  "parcel.geometry.set": parcelGeometrySet,
  "cropSeason.declare": cropSeasonDeclare,
  "harvest.declare": harvestDeclare,
  "verification.record": verificationRecord,
  "alert.relay": alertRelay,
};

export { HARVEST_UNIT_FACTORS_KG, quantityToKg } from "./harvest-declare";
export { AREA_GAP_WARNING_PERCENT, areaGapPercent, areaGapWarning } from "./geometry";
export type {
  CommandTarget,
  Db,
  HandlerOutcome,
  SyncApplyResult,
  SyncContext,
  SyncHandler,
  SyncHandlers,
} from "./types";
