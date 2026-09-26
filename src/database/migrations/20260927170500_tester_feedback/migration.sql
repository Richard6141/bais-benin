-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'CONFUSING', 'IDEA');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'SEEN', 'DONE');

-- CreateEnum
CREATE TYPE "FeedbackDevice" AS ENUM ('MOBILE', 'DESKTOP');

-- CreateTable
CREATE TABLE "tester_feedback" (
    "id" UUID NOT NULL,
    "author_id" UUID,
    "role" "Role" NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "rating" SMALLINT,
    "page_path" VARCHAR(300) NOT NULL,
    "device" "FeedbackDevice" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "status_changed_at" TIMESTAMP(3),
    "status_changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tester_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tester_feedback_status_created_at_idx" ON "tester_feedback"("status", "created_at");

-- CreateIndex
CREATE INDEX "tester_feedback_created_at_idx" ON "tester_feedback"("created_at");

-- AddForeignKey
ALTER TABLE "tester_feedback" ADD CONSTRAINT "tester_feedback_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_feedback" ADD CONSTRAINT "tester_feedback_status_changed_by_id_fkey" FOREIGN KEY ("status_changed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
