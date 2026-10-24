-- Shared-number routing: a sender who belongs to several organizations is asked which one they mean.
ALTER TYPE "ConversationState" ADD VALUE IF NOT EXISTS 'AWAITING_ORG_CHOICE';
