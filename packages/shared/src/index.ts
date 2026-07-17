import { z } from 'zod';

// Roles
export type UserRole = 'owner' | 'admin' | 'operator' | 'readonly';
export const USER_ROLES: UserRole[] = ['owner', 'admin', 'operator', 'readonly'];

// Conversation lifecycle statuses
export type ConversationStatus = 'new' | 'ai_active' | 'needs_human' | 'human_active' | 'resolved';
export const CONVERSATION_STATUSES: ConversationStatus[] = [
  'new',
  'ai_active',
  'needs_human',
  'human_active',
  'resolved',
];

// Message types
export type MessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'location'
  | 'contact'
  | 'sticker'
  | 'reaction'
  | 'template';

export const MESSAGE_TYPES: MessageType[] = [
  'text',
  'image',
  'document',
  'audio',
  'video',
  'location',
  'contact',
  'sticker',
  'reaction',
  'template',
];

// Sender types
export type SenderType = 'customer' | 'ai' | 'human' | 'system';
export const SENDER_TYPES: SenderType[] = ['customer', 'ai', 'human', 'system'];

// Message directions
export type MessageDirection = 'inbound' | 'outbound';
export const MESSAGE_DIRECTIONS: MessageDirection[] = ['inbound', 'outbound'];

// Webhook statuses
export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'failed';
export const WEBHOOK_EVENT_STATUSES: WebhookEventStatus[] = [
  'received',
  'processing',
  'processed',
  'failed',
];

// Webhook delivery status
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export const DELIVERY_STATUSES: DeliveryStatus[] = ['pending', 'sent', 'delivered', 'read', 'failed'];

// Validators
export const EmailValidator = z.string().email('Invalid email address');
export const PhoneValidator = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Must start with + and country code (e.g. +1234567890)');
export const SlugValidator = z.string().regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric lowercase and dashes only');
export const OrganizationNameValidator = z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less');

// Plan Limits and Configurations
export interface PlanConfig {
  maxOrgs: number;
  maxNumbers: number;
  maxAgents: number;
  maxMessagesPerMonth: number;
  maxKbStorageBytes: number;
  maxSeats: number;
  dailyCostCapCents: number;
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  free: {
    maxOrgs: 1,
    maxNumbers: 1,
    maxAgents: 1,
    maxMessagesPerMonth: 50,
    maxKbStorageBytes: 5 * 1024 * 1024, // 5 MB
    maxSeats: 1,
    dailyCostCapCents: 100, // $1
  },
  starter: {
    maxOrgs: 3,
    maxNumbers: 1,
    maxAgents: 3,
    maxMessagesPerMonth: 1000,
    maxKbStorageBytes: 50 * 1024 * 1024, // 50 MB
    maxSeats: 2,
    dailyCostCapCents: 500, // $5
  },
  growth: {
    maxOrgs: 3,
    maxNumbers: 2,
    maxAgents: 10,
    maxMessagesPerMonth: 5000,
    maxKbStorageBytes: 200 * 1024 * 1024, // 200 MB
    maxSeats: 5,
    dailyCostCapCents: 2000, // $20
  },
  agency: {
    maxOrgs: 5,
    maxNumbers: 5,
    maxAgents: 25,
    maxMessagesPerMonth: 20000,
    maxKbStorageBytes: 1024 * 1024 * 1024, // 1 GB
    maxSeats: 15,
    dailyCostCapCents: 5000, // $50
  },
  enterprise: {
    maxOrgs: 100,
    maxNumbers: 100,
    maxAgents: 100,
    maxMessagesPerMonth: 1000000,
    maxKbStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    maxSeats: 1000,
    dailyCostCapCents: 500000, // $5000
  },
};
