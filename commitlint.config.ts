// Convention décrite dans docs/10-conventions.md. Les sujets vides de sens
// ("update", "wip"...) sont refusés explicitement.
const forbiddenSubjects = [
  "update",
  "updates",
  "test",
  "tests",
  "modification",
  "wip",
  "fix",
  "changes",
];

const scopes = [
  "foundation",
  "ui",
  "design-system",
  "auth",
  "authorization",
  "identity",
  "registry",
  "farm",
  "territory",
  "map",
  "monitoring",
  "market",
  "assistant",
  "ai",
  "dashboard",
  "admin",
  "analytics",
  "sync",
  "pwa",
  "database",
  "db",
  "api",
  "notifications",
  "infra",
  "ci",
  "docs",
  "data",
  "architecture",
  "deps",
];

const types = [
  "feat",
  "fix",
  "docs",
  "refactor",
  "test",
  "perf",
  "chore",
  "ci",
  "build",
  "style",
  "security",
  "release",
];

interface ParsedCommit {
  subject?: string | null;
}

const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", types],
    "scope-enum": [2, "always", scopes],
    "subject-max-length": [2, "always", 72],
    "subject-case": [2, "always", "lower-case"],
    "subject-not-vague": [2, "always"],
  },
  plugins: [
    {
      rules: {
        "subject-not-vague": ({ subject }: ParsedCommit): [boolean, string] => {
          const normalized = (subject ?? "").trim().toLowerCase();
          return [
            !forbiddenSubjects.includes(normalized),
            `le sujet "${subject}" ne décrit pas le changement`,
          ];
        },
      },
    },
  ],
};

export default config;
