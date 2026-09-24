import { Badge } from "@/components/ui/badge";
import {
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_VARIANTS,
  type VerificationStatus,
} from "./labels";

export function VerificationStatusBadge({ status }: { status: string }) {
  const known = (status in VERIFICATION_STATUS_LABELS ? status : "DECLARED") as VerificationStatus;
  return (
    <Badge variant={VERIFICATION_STATUS_VARIANTS[known]}>{VERIFICATION_STATUS_LABELS[known]}</Badge>
  );
}
