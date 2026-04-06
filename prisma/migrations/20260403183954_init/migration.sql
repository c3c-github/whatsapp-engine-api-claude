-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'AWAITING_QR');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('CENTRAL', 'PESSOAL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageSourceSystem" AS ENUM ('API', 'MIDDLEWARE', 'WHATSAPP_DEVICE');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('MESSAGE', 'GROUP', 'CONTACT', 'SESSION', 'CHANNEL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "EventAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "type" "ChannelType" NOT NULL DEFAULT 'CENTRAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "wa_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupParticipant" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "GroupParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "wa_message_id" TEXT NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "source_system" "MessageSourceSystem" NOT NULL DEFAULT 'API',
    "content" JSONB NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "EventAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_api_key_key" ON "Organization"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_org_id_phone_number_key" ON "Channel"("org_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "Session_channel_id_key_id_key" ON "Session"("channel_id", "key_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_org_id_phone_number_key" ON "Contact"("org_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "Group_channel_id_wa_group_id_key" ON "Group"("channel_id", "wa_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "GroupParticipant_group_id_contact_id_key" ON "GroupParticipant"("group_id", "contact_id");

-- CreateIndex
CREATE INDEX "Message_org_id_remote_jid_idx" ON "Message"("org_id", "remote_jid");

-- CreateIndex
CREATE INDEX "Message_org_id_direction_idx" ON "Message"("org_id", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_id_wa_message_id_key" ON "Message"("channel_id", "wa_message_id");

-- CreateIndex
CREATE INDEX "EventLog_org_id_entity_type_idx" ON "EventLog"("org_id", "entity_type");

-- CreateIndex
CREATE INDEX "EventLog_org_id_created_at_idx" ON "EventLog"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupParticipant" ADD CONSTRAINT "GroupParticipant_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupParticipant" ADD CONSTRAINT "GroupParticipant_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
