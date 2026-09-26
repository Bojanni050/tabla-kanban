-- Integration layer: external references on cards and machine credentials for the
-- integration API. Both are optional - existing cards and flows are untouched.

-- CreateTable: a card's identity in an external system (provider + externalId is unique,
-- which is what makes create requests from external systems idempotent).
CREATE TABLE "ExternalReference" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable: machine credential for the integration API. tokenHash is the SHA-256
-- hash of the token; the plaintext is never stored and never returned after creation.
CREATE TABLE "IntegrationKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_provider_externalId_key" ON "ExternalReference"("provider", "externalId");

-- CreateIndex
CREATE INDEX "ExternalReference_cardId_idx" ON "ExternalReference"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationKey_tokenHash_key" ON "IntegrationKey"("tokenHash");

-- CreateIndex
CREATE INDEX "IntegrationKey_userId_provider_idx" ON "IntegrationKey"("userId", "provider");

-- AddForeignKey: deleting a card removes its external references.
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: deleting a user removes their machine credentials.
ALTER TABLE "IntegrationKey" ADD CONSTRAINT "IntegrationKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
