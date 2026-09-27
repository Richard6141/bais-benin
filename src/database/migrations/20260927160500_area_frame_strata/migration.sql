-- CreateEnum
CREATE TYPE "AreaFrameStratum" AS ENUM ('ANNUAL_CROPS', 'OTHER_LAND');

-- AlterTable
ALTER TABLE "area_frame_point" ADD COLUMN     "selected" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stratum" "AreaFrameStratum";
