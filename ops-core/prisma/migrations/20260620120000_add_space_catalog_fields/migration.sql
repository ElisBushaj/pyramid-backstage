-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "adjacent" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "category" TEXT,
ADD COLUMN     "ceilingCm" INTEGER,
ADD COLUMN     "isCirculation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "map" JSONB,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "zone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "Space_category_idx" ON "Space"("category");

