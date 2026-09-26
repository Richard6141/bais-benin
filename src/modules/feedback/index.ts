// Avis des testeurs (chantier J) : dépôt depuis chaque espace, lecture et suivi par le ministère.

export {
  FEEDBACK_DEVICES,
  FEEDBACK_KINDS,
  FEEDBACK_ROLES,
  FEEDBACK_STATUSES,
  KIND_LABELS,
  MESSAGE_MAX,
  ROLE_LABELS,
  STATUS_LABELS,
  cleanPagePath,
  feedbackInput,
  maskFeedbackMessage,
  roleForPage,
  type FeedbackInput,
  type FeedbackKind,
  type FeedbackRole,
  type FeedbackStatus,
} from "./rules";
export {
  FeedbackError,
  countNewFeedback,
  createFeedback,
  exportFeedbackCsv,
  listFeedback,
  parseFeedbackFilters,
  setFeedbackStatus,
  type FeedbackFilters,
  type FeedbackRow,
} from "./service";
