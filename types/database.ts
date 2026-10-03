
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "add_on_orders": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"currency": string,"fulfilled_at": string | null,"grant_id": string | null,"id": string,"job_id": string | null,"kind": string,"live": boolean,"quantity": number,"status": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"]
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"currency": string,"fulfilled_at"?: string | null,"grant_id"?: string | null,"id"?: string,"job_id"?: string | null,"kind": string,"live": boolean,"quantity": number,"status"?: string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"]
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"fulfilled_at"?: string | null,"grant_id"?: string | null,"id"?: string,"job_id"?: string | null,"kind"?: string,"live"?: boolean,"quantity"?: number,"status"?: string,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "add_on_orders_grant_id_fkey"
      columns: ["grant_id"]
isOneToOne: false
      referencedRelation: "entitlement_grants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "add_on_orders_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "add_on_orders_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"agreement_acceptances": {
                  Row: {
                    "accepted_at": string,"ip_hash": string | null,"user_id": string,"version": number
                  }
                  Insert: {
                    "accepted_at"?: string,"ip_hash"?: string | null,"user_id": string,"version": number
                  }
                  Update: {
                    "accepted_at"?: string,"ip_hash"?: string | null,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreement_acceptances_version_fkey"
      columns: ["version"]
isOneToOne: false
      referencedRelation: "agreement_versions"
      referencedColumns: ["version"]
    }
                  ]
                },"agreement_versions": {
                  Row: {
                    "body_md": string,"created_at": string,"published_at": string | null,"summary_md": string,"title": string,"version": number
                  }
                  Insert: {
                    "body_md": string,"created_at"?: string,"published_at"?: string | null,"summary_md"?: string,"title": string,"version": number
                  }
                  Update: {
                    "body_md"?: string,"created_at"?: string,"published_at"?: string | null,"summary_md"?: string,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"announcement_meta": {
                  Row: {
                    "category": string | null,"created_at": string,"created_by": string | null,"expires_at": string,"post_id": string,"university_id": string
                  }
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"post_id": string,"university_id": string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"post_id"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_meta_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcement_meta_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"announcement_targets": {
                  Row: {
                    "batch_year": number | null,"department_id": string | null,"post_id": string
                  }
                  Insert: {
                    "batch_year"?: number | null,"department_id"?: string | null,"post_id": string
                  }
                  Update: {
                    "batch_year"?: number | null,"department_id"?: string | null,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_targets_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcement_targets_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "announcement_meta"
      referencedColumns: ["post_id"]
    }
                  ]
                },"anti_gaming_flags": {
                  Row: {
                    "applied_at": string | null,"claimed_at": string | null,"claimed_by": string | null,"created_at": string,"detail": NonNullable<Json>,"endorsement_ids": (string)[],"id": string,"kind": Database["public"]['Enums']["anti_gaming_kind"],"members": (string)[],"reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["review_flag_status"],"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "applied_at"?: string | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"endorsement_ids"?: (string)[],"id"?: string,"kind": Database["public"]['Enums']["anti_gaming_kind"],"members": (string)[],"reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "applied_at"?: string | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"endorsement_ids"?: (string)[],"id"?: string,"kind"?: Database["public"]['Enums']["anti_gaming_kind"],"members"?: (string)[],"reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"api_tokens": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"last_used_at": string | null,"name": string,"org_id": string,"revoked_at": string | null,"token_hash": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"last_used_at"?: string | null,"name": string,"org_id": string,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"last_used_at"?: string | null,"name"?: string,"org_id"?: string,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_tokens_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"api_webhook_deliveries": {
                  Row: {
                    "attempt": number,"created_at": string,"delivered_at": string | null,"event": string,"id": number,"last_error": string | null,"last_status": number | null,"next_attempt_at": string,"payload": NonNullable<Json>,"status": string,"webhook_id": string
                  }
                  Insert: {
                    "attempt"?: number,"created_at"?: string,"delivered_at"?: string | null,"event": string,"id"?: never,"last_error"?: string | null,"last_status"?: number | null,"next_attempt_at"?: string,"payload": NonNullable<Json>,"status"?: string,"webhook_id": string
                  }
                  Update: {
                    "attempt"?: number,"created_at"?: string,"delivered_at"?: string | null,"event"?: string,"id"?: never,"last_error"?: string | null,"last_status"?: number | null,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"status"?: string,"webhook_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_webhook_deliveries_webhook_id_fkey"
      columns: ["webhook_id"]
isOneToOne: false
      referencedRelation: "api_webhooks"
      referencedColumns: ["id"]
    }
                  ]
                },"api_webhooks": {
                  Row: {
                    "active": boolean,"consecutive_failures": number,"created_at": string,"created_by": string | null,"events": (string)[],"id": string,"org_id": string,"secret": string,"url": string
                  }
                  Insert: {
                    "active"?: boolean,"consecutive_failures"?: number,"created_at"?: string,"created_by"?: string | null,"events": (string)[],"id"?: string,"org_id": string,"secret": string,"url": string
                  }
                  Update: {
                    "active"?: boolean,"consecutive_failures"?: number,"created_at"?: string,"created_by"?: string | null,"events"?: (string)[],"id"?: string,"org_id"?: string,"secret"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_webhooks_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"appeals": {
                  Row: {
                    "appellant_id": string,"body": string,"claimed_at": string | null,"claimed_by": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decider_role": Database["public"]['Enums']["staff_role"],"decision_id": string,"decision_reason": string | null,"decision_type": Database["public"]['Enums']["appeal_decision_type"],"filed_by": string | null,"id": string,"org_id": string | null,"original_staff_id": string,"outcome": Json | null,"status": Database["public"]['Enums']["appeal_status"],"summary": NonNullable<Json>
                  }
                  Insert: {
                    "appellant_id": string,"body": string,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decider_role": Database["public"]['Enums']["staff_role"],"decision_id": string,"decision_reason"?: string | null,"decision_type": Database["public"]['Enums']["appeal_decision_type"],"filed_by"?: string | null,"id"?: string,"org_id"?: string | null,"original_staff_id": string,"outcome"?: Json | null,"status"?: Database["public"]['Enums']["appeal_status"],"summary"?: NonNullable<Json>
                  }
                  Update: {
                    "appellant_id"?: string,"body"?: string,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decider_role"?: Database["public"]['Enums']["staff_role"],"decision_id"?: string,"decision_reason"?: string | null,"decision_type"?: Database["public"]['Enums']["appeal_decision_type"],"filed_by"?: string | null,"id"?: string,"org_id"?: string | null,"original_staff_id"?: string,"outcome"?: Json | null,"status"?: Database["public"]['Enums']["appeal_status"],"summary"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "appeals_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"application_events": {
                  Row: {
                    "actor_id": string | null,"application_id": string,"at": string,"id": number,"reject_reason": string | null,"stage": Database["public"]['Enums']["application_stage"]
                  }
                  Insert: {
                    "actor_id"?: string | null,"application_id": string,"at"?: string,"id"?: never,"reject_reason"?: string | null,"stage": Database["public"]['Enums']["application_stage"]
                  }
                  Update: {
                    "actor_id"?: string | null,"application_id"?: string,"at"?: string,"id"?: never,"reject_reason"?: string | null,"stage"?: Database["public"]['Enums']["application_stage"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "job_applications"
      referencedColumns: ["id"]
    }
                  ]
                },"application_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": number,"sender_id": string,"thread_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: never,"sender_id": string,"thread_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: never,"sender_id"?: string,"thread_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "application_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"application_threads": {
                  Row: {
                    "answers": NonNullable<Json>,"candidate_id": string,"created_at": string,"decided_at": string | null,"id": string,"message": string,"owner_id": string,"role_id": string | null,"status": Database["public"]['Enums']["application_status"],"venture_id": string
                  }
                  Insert: {
                    "answers"?: NonNullable<Json>,"candidate_id": string,"created_at"?: string,"decided_at"?: string | null,"id"?: string,"message": string,"owner_id": string,"role_id"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"venture_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"candidate_id"?: string,"created_at"?: string,"decided_at"?: string | null,"id"?: string,"message"?: string,"owner_id"?: string,"role_id"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_threads_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "venture_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_threads_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"badge_awards": {
                  Row: {
                    "awarded_at": string,"awarded_by": string | null,"badge_id": string,"id": string,"note": string | null,"revoked_at": string | null,"revoked_by": string | null,"student_id": string
                  }
                  Insert: {
                    "awarded_at"?: string,"awarded_by"?: string | null,"badge_id": string,"id"?: string,"note"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"student_id": string
                  }
                  Update: {
                    "awarded_at"?: string,"awarded_by"?: string | null,"badge_id"?: string,"id"?: string,"note"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "badge_awards_badge_id_fkey"
      columns: ["badge_id"]
isOneToOne: false
      referencedRelation: "university_badges"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_reminders": {
                  Row: {
                    "kind": string,"period_end": string,"sent_at": string,"subscription_id": string
                  }
                  Insert: {
                    "kind": string,"period_end": string,"sent_at"?: string,"subscription_id": string
                  }
                  Update: {
                    "kind"?: string,"period_end"?: string,"sent_at"?: string,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_reminders_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_tasks": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"done_at": string | null,"done_by": string | null,"id": string,"kind": string,"note": string | null,"ref_id": string | null,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"]
                  }
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"ref_id"?: string | null,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"]
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"ref_id"?: string | null,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"]
                  }
                  Relationships: [
                    
                  ]
                },"billing_webhook_events": {
                  Row: {
                    "attempts": number,"error": string | null,"event": NonNullable<Json>,"event_id": string,"gateway": string,"id": number,"live": boolean,"outcome": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"received_at": string,"type": string
                  }
                  Insert: {
                    "attempts"?: number,"error"?: string | null,"event": NonNullable<Json>,"event_id": string,"gateway": string,"id"?: never,"live": boolean,"outcome"?: string | null,"payload": NonNullable<Json>,"processed_at"?: string | null,"received_at"?: string,"type": string
                  }
                  Update: {
                    "attempts"?: number,"error"?: string | null,"event"?: NonNullable<Json>,"event_id"?: string,"gateway"?: string,"id"?: never,"live"?: boolean,"outcome"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "body": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"link_url": string | null,"media_height": number | null,"media_path": string | null,"media_width": number | null,"removed_by": string | null,"reply_to_id": string | null,"search": unknown,"sender_id": string,"thread_id": string
                  }
                  Insert: {
                    "body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"link_url"?: string | null,"media_height"?: number | null,"media_path"?: string | null,"media_width"?: number | null,"removed_by"?: string | null,"reply_to_id"?: string | null,"search"?: never,"sender_id": string,"thread_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"link_url"?: string | null,"media_height"?: number | null,"media_path"?: string | null,"media_width"?: number | null,"removed_by"?: string | null,"reply_to_id"?: string | null,"search"?: never,"sender_id"?: string,"thread_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_reply_to_id_fkey"
      columns: ["reply_to_id"]
isOneToOne: false
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_pins": {
                  Row: {
                    "message_id": string,"pinned_at": string,"pinned_by": string,"thread_id": string
                  }
                  Insert: {
                    "message_id": string,"pinned_at"?: string,"pinned_by": string,"thread_id": string
                  }
                  Update: {
                    "message_id"?: string,"pinned_at"?: string,"pinned_by"?: string,"thread_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_pins_message_id_fkey"
      columns: ["message_id"]
isOneToOne: true
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_pins_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_thread_members": {
                  Row: {
                    "joined_at": string,"last_read_at": string,"muted_until": string | null,"thread_id": string,"user_id": string
                  }
                  Insert: {
                    "joined_at"?: string,"last_read_at"?: string,"muted_until"?: string | null,"thread_id": string,"user_id": string
                  }
                  Update: {
                    "joined_at"?: string,"last_read_at"?: string,"muted_until"?: string | null,"thread_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_thread_members_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_threads": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"dm_key": string | null,"fair_id": string | null,"id": string,"last_message_at": string | null,"org_id": string | null,"type": Database["public"]['Enums']["chat_thread_type"],"venture_id": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"dm_key"?: string | null,"fair_id"?: string | null,"id"?: string,"last_message_at"?: string | null,"org_id"?: string | null,"type": Database["public"]['Enums']["chat_thread_type"],"venture_id"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"dm_key"?: string | null,"fair_id"?: string | null,"id"?: string,"last_message_at"?: string | null,"org_id"?: string | null,"type"?: Database["public"]['Enums']["chat_thread_type"],"venture_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_threads_fair_id_fkey"
      columns: ["fair_id"]
isOneToOne: false
      referencedRelation: "job_fairs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_threads_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_threads_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"checkout_sessions": {
                  Row: {
                    "add_on_order_id": string | null,"amount": number,"change": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"expires_at": string,"failure_reason": string | null,"gateway": string,"gateway_session_ref": string | null,"id": string,"idempotency_key": string,"invoice_id": string | null,"live": boolean,"plan_id": string | null,"purpose": string,"quote": NonNullable<Json>,"status": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"subscription_id": string | null
                  }
                  Insert: {
                    "add_on_order_id"?: string | null,"amount": number,"change"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency": string,"expires_at": string,"failure_reason"?: string | null,"gateway": string,"gateway_session_ref"?: string | null,"id"?: string,"idempotency_key": string,"invoice_id"?: string | null,"live": boolean,"plan_id"?: string | null,"purpose": string,"quote": NonNullable<Json>,"status"?: string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"subscription_id"?: string | null
                  }
                  Update: {
                    "add_on_order_id"?: string | null,"amount"?: number,"change"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"expires_at"?: string,"failure_reason"?: string | null,"gateway"?: string,"gateway_session_ref"?: string | null,"id"?: string,"idempotency_key"?: string,"invoice_id"?: string | null,"live"?: boolean,"plan_id"?: string | null,"purpose"?: string,"quote"?: NonNullable<Json>,"status"?: string,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"],"subscription_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkout_sessions_add_on_fk"
      columns: ["add_on_order_id"]
isOneToOne: false
      referencedRelation: "add_on_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkout_sessions_invoice_fk"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkout_sessions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkout_sessions_subscription_fk"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"code_check_prompts": {
                  Row: {
                    "active": boolean,"author_id": string | null,"category": Database["public"]['Enums']["skill_category"] | null,"created_at": string,"id": string,"prompt": string,"skill_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"author_id"?: string | null,"category"?: Database["public"]['Enums']["skill_category"] | null,"created_at"?: string,"id"?: string,"prompt": string,"skill_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"author_id"?: string | null,"category"?: Database["public"]['Enums']["skill_category"] | null,"created_at"?: string,"id"?: string,"prompt"?: string,"skill_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "code_check_prompts_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"code_checks": {
                  Row: {
                    "answers": NonNullable<Json>,"claimed_at": string | null,"claimed_by": string | null,"deadline_at": string | null,"due_at": string | null,"end_line": number | null,"feedback": string | null,"graded_at": string | null,"grader_id": string | null,"id": string,"path": string | null,"prompt_id": string | null,"ready_at": string | null,"repo_id": number | null,"requested_at": string,"routed_to_staff_at": string | null,"rubric": Json | null,"sha": string | null,"skill_id": string,"snippet_served_at": string | null,"start_line": number | null,"started_at": string | null,"status": Database["public"]['Enums']["code_check_status"],"submitted_at": string | null,"unavailable_reason": string | null,"user_id": string
                  }
                  Insert: {
                    "answers"?: NonNullable<Json>,"claimed_at"?: string | null,"claimed_by"?: string | null,"deadline_at"?: string | null,"due_at"?: string | null,"end_line"?: number | null,"feedback"?: string | null,"graded_at"?: string | null,"grader_id"?: string | null,"id"?: string,"path"?: string | null,"prompt_id"?: string | null,"ready_at"?: string | null,"repo_id"?: number | null,"requested_at"?: string,"routed_to_staff_at"?: string | null,"rubric"?: Json | null,"sha"?: string | null,"skill_id": string,"snippet_served_at"?: string | null,"start_line"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["code_check_status"],"submitted_at"?: string | null,"unavailable_reason"?: string | null,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"claimed_at"?: string | null,"claimed_by"?: string | null,"deadline_at"?: string | null,"due_at"?: string | null,"end_line"?: number | null,"feedback"?: string | null,"graded_at"?: string | null,"grader_id"?: string | null,"id"?: string,"path"?: string | null,"prompt_id"?: string | null,"ready_at"?: string | null,"repo_id"?: number | null,"requested_at"?: string,"routed_to_staff_at"?: string | null,"rubric"?: Json | null,"sha"?: string | null,"skill_id"?: string,"snippet_served_at"?: string | null,"start_line"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["code_check_status"],"submitted_at"?: string | null,"unavailable_reason"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "code_checks_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "code_check_prompts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "code_checks_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"company_blocks": {
                  Row: {
                    "created_at": string,"org_id": string,"student_id": string
                  }
                  Insert: {
                    "created_at"?: string,"org_id": string,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_blocks_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"competition_awards": {
                  Row: {
                    "competition_id": string,"created_at": string,"kind": string,"skill_id": string,"student_id": string
                  }
                  Insert: {
                    "competition_id": string,"created_at"?: string,"kind": string,"skill_id": string,"student_id": string
                  }
                  Update: {
                    "competition_id"?: string,"created_at"?: string,"kind"?: string,"skill_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competition_awards_competition_id_fkey"
      columns: ["competition_id"]
isOneToOne: false
      referencedRelation: "competitions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competition_awards_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"competition_judge_scores": {
                  Row: {
                    "created_at": string,"feedback": string | null,"judge_id": string,"scores": NonNullable<Json>,"team_id": string,"total": number
                  }
                  Insert: {
                    "created_at"?: string,"feedback"?: string | null,"judge_id": string,"scores": NonNullable<Json>,"team_id": string,"total": number
                  }
                  Update: {
                    "created_at"?: string,"feedback"?: string | null,"judge_id"?: string,"scores"?: NonNullable<Json>,"team_id"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "competition_judge_scores_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "competition_teams"
      referencedColumns: ["id"]
    }
                  ]
                },"competition_judges": {
                  Row: {
                    "competition_id": string,"created_at": string,"teacher_id": string
                  }
                  Insert: {
                    "competition_id": string,"created_at"?: string,"teacher_id": string
                  }
                  Update: {
                    "competition_id"?: string,"created_at"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competition_judges_competition_id_fkey"
      columns: ["competition_id"]
isOneToOne: false
      referencedRelation: "competitions"
      referencedColumns: ["id"]
    }
                  ]
                },"competition_team_members": {
                  Row: {
                    "competition_id": string,"created_at": string,"status": string,"student_id": string,"team_id": string
                  }
                  Insert: {
                    "competition_id": string,"created_at"?: string,"status"?: string,"student_id": string,"team_id": string
                  }
                  Update: {
                    "competition_id"?: string,"created_at"?: string,"status"?: string,"student_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competition_team_members_competition_id_fkey"
      columns: ["competition_id"]
isOneToOne: false
      referencedRelation: "competitions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competition_team_members_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "competition_teams"
      referencedColumns: ["id"]
    }
                  ]
                },"competition_teams": {
                  Row: {
                    "competition_id": string,"created_at": string,"feedback": string | null,"frozen_checked_at": string | null,"frozen_note": string | null,"frozen_sha": string | null,"id": string,"lead_id": string,"name": string,"placement": number | null,"repo_url": string | null,"scores": Json | null,"submitted_at": string | null,"total": number | null
                  }
                  Insert: {
                    "competition_id": string,"created_at"?: string,"feedback"?: string | null,"frozen_checked_at"?: string | null,"frozen_note"?: string | null,"frozen_sha"?: string | null,"id"?: string,"lead_id": string,"name": string,"placement"?: number | null,"repo_url"?: string | null,"scores"?: Json | null,"submitted_at"?: string | null,"total"?: number | null
                  }
                  Update: {
                    "competition_id"?: string,"created_at"?: string,"feedback"?: string | null,"frozen_checked_at"?: string | null,"frozen_note"?: string | null,"frozen_sha"?: string | null,"id"?: string,"lead_id"?: string,"name"?: string,"placement"?: number | null,"repo_url"?: string | null,"scores"?: Json | null,"submitted_at"?: string | null,"total"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "competition_teams_competition_id_fkey"
      columns: ["competition_id"]
isOneToOne: false
      referencedRelation: "competitions"
      referencedColumns: ["id"]
    }
                  ]
                },"competitions": {
                  Row: {
                    "brief": string,"brief_template": string | null,"created_at": string,"created_by": string | null,"eligible_universities": (string)[],"ends_at": string,"host_type": string,"id": string,"min_tier": Database["public"]['Enums']["ranking_tier"] | null,"org_id": string | null,"prize": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"role": string,"rubric": NonNullable<Json>,"skills": NonNullable<Json>,"starts_at": string,"status": Database["public"]['Enums']["competition_status"],"team_size": number,"title": string,"university_id": string | null,"winner_team_id": string | null
                  }
                  Insert: {
                    "brief": string,"brief_template"?: string | null,"created_at"?: string,"created_by"?: string | null,"eligible_universities"?: (string)[],"ends_at": string,"host_type"?: string,"id"?: string,"min_tier"?: Database["public"]['Enums']["ranking_tier"] | null,"org_id"?: string | null,"prize": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role": string,"rubric": NonNullable<Json>,"skills"?: NonNullable<Json>,"starts_at": string,"status"?: Database["public"]['Enums']["competition_status"],"team_size"?: number,"title": string,"university_id"?: string | null,"winner_team_id"?: string | null
                  }
                  Update: {
                    "brief"?: string,"brief_template"?: string | null,"created_at"?: string,"created_by"?: string | null,"eligible_universities"?: (string)[],"ends_at"?: string,"host_type"?: string,"id"?: string,"min_tier"?: Database["public"]['Enums']["ranking_tier"] | null,"org_id"?: string | null,"prize"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role"?: string,"rubric"?: NonNullable<Json>,"skills"?: NonNullable<Json>,"starts_at"?: string,"status"?: Database["public"]['Enums']["competition_status"],"team_size"?: number,"title"?: string,"university_id"?: string | null,"winner_team_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competitions_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"config_keys": {
                  Row: {
                    "applies": string,"area": string,"description": string,"key": string,"schema": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "applies": string,"area": string,"description": string,"key": string,"schema": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "applies"?: string,"area"?: string,"description"?: string,"key"?: string,"schema"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contact_requests": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"decided_at": string | null,"decline_reason": string | null,"expires_at": string,"id": string,"message": string,"org_id": string,"recruiter_id": string | null,"role_title": string,"status": Database["public"]['Enums']["contact_status"],"student_id": string,"thread_id": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decline_reason"?: string | null,"expires_at": string,"id"?: string,"message": string,"org_id": string,"recruiter_id"?: string | null,"role_title": string,"status"?: Database["public"]['Enums']["contact_status"],"student_id": string,"thread_id"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decline_reason"?: string | null,"expires_at"?: string,"id"?: string,"message"?: string,"org_id"?: string,"recruiter_id"?: string | null,"role_title"?: string,"status"?: Database["public"]['Enums']["contact_status"],"student_id"?: string,"thread_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"contribution_confirmations": {
                  Row: {
                    "confirmer_id": string,"confirmer_role": string,"contribution_id": string,"created_at": string
                  }
                  Insert: {
                    "confirmer_id": string,"confirmer_role"?: string,"contribution_id": string,"created_at"?: string
                  }
                  Update: {
                    "confirmer_id"?: string,"confirmer_role"?: string,"contribution_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contribution_confirmations_contribution_id_fkey"
      columns: ["contribution_id"]
isOneToOne: false
      referencedRelation: "contributions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contribution_confirmations_contribution_id_fkey"
      columns: ["contribution_id"]
isOneToOne: false
      referencedRelation: "contributions_with_status"
      referencedColumns: ["current_id"]
    },{
      foreignKeyName: "contribution_confirmations_contribution_id_fkey"
      columns: ["contribution_id"]
isOneToOne: false
      referencedRelation: "contributions_with_status"
      referencedColumns: ["id"]
    }
                  ]
                },"contributions": {
                  Row: {
                    "ai_agent": string | null,"before_venture": boolean,"commit_sha": string | null,"corrects_id": string | null,"created_at": string,"description": string,"evidence_url": string | null,"hours": number | null,"id": string,"kind": Database["public"]['Enums']["contribution_kind"],"skill_ids": (string)[],"source": Database["public"]['Enums']["contribution_source"],"user_id": string,"venture_id": string
                  }
                  Insert: {
                    "ai_agent"?: string | null,"before_venture"?: boolean,"commit_sha"?: string | null,"corrects_id"?: string | null,"created_at"?: string,"description": string,"evidence_url"?: string | null,"hours"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["contribution_kind"],"skill_ids"?: (string)[],"source"?: Database["public"]['Enums']["contribution_source"],"user_id": string,"venture_id": string
                  }
                  Update: {
                    "ai_agent"?: string | null,"before_venture"?: boolean,"commit_sha"?: string | null,"corrects_id"?: string | null,"created_at"?: string,"description"?: string,"evidence_url"?: string | null,"hours"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["contribution_kind"],"skill_ids"?: (string)[],"source"?: Database["public"]['Enums']["contribution_source"],"user_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contributions_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "contributions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contributions_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "contributions_with_status"
      referencedColumns: ["current_id"]
    },{
      foreignKeyName: "contributions_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "contributions_with_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contributions_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"credentials": {
                  Row: {
                    "claimed_at": string | null,"claimed_by": string | null,"created_at": string,"expires_on": string | null,"file_bytes": number,"file_deleted_at": string | null,"file_path": string,"file_type": string,"id": string,"issued_on": string,"issuer": string,"recognised_issuer_id": string | null,"review_reason": string | null,"reviewed_at": string | null,"reviewer_id": string | null,"status": Database["public"]['Enums']["credential_status"],"title": string,"user_id": string,"verify_url": string | null
                  }
                  Insert: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"expires_on"?: string | null,"file_bytes": number,"file_deleted_at"?: string | null,"file_path": string,"file_type": string,"id"?: string,"issued_on": string,"issuer": string,"recognised_issuer_id"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["credential_status"],"title": string,"user_id": string,"verify_url"?: string | null
                  }
                  Update: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"expires_on"?: string | null,"file_bytes"?: number,"file_deleted_at"?: string | null,"file_path"?: string,"file_type"?: string,"id"?: string,"issued_on"?: string,"issuer"?: string,"recognised_issuer_id"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["credential_status"],"title"?: string,"user_id"?: string,"verify_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "credentials_recognised_issuer_id_fkey"
      columns: ["recognised_issuer_id"]
isOneToOne: false
      referencedRelation: "recognised_issuers"
      referencedColumns: ["id"]
    }
                  ]
                },"cv_pdf_exports": {
                  Row: {
                    "bytes": number,"created_at": string,"file_deleted_at": string | null,"id": string,"paper": string,"path": string,"pdf_hash": string,"record_id": string,"template": string,"user_id": string | null
                  }
                  Insert: {
                    "bytes": number,"created_at"?: string,"file_deleted_at"?: string | null,"id": string,"paper": string,"path": string,"pdf_hash": string,"record_id": string,"template": string,"user_id"?: string | null
                  }
                  Update: {
                    "bytes"?: number,"created_at"?: string,"file_deleted_at"?: string | null,"id"?: string,"paper"?: string,"path"?: string,"pdf_hash"?: string,"record_id"?: string,"template"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cv_pdf_exports_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "cv_records"
      referencedColumns: ["id"]
    }
                  ]
                },"cv_records": {
                  Row: {
                    "code": string,"content_hash": string,"created_at": string,"expires_at": string,"id": string,"issued_at": string,"key_id": string,"revoked_at": string | null,"revoked_by": string | null,"revoked_reason": string | null,"signature": string,"snapshot": Json | null,"snapshot_hash": string,"source": string,"superseded_by": string | null,"template": string,"user_id": string | null,"version": number
                  }
                  Insert: {
                    "code": string,"content_hash": string,"created_at"?: string,"expires_at": string,"id"?: string,"issued_at": string,"key_id": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"revoked_reason"?: string | null,"signature": string,"snapshot"?: Json | null,"snapshot_hash": string,"source": string,"superseded_by"?: string | null,"template"?: string,"user_id"?: string | null,"version": number
                  }
                  Update: {
                    "code"?: string,"content_hash"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"issued_at"?: string,"key_id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"revoked_reason"?: string | null,"signature"?: string,"snapshot"?: Json | null,"snapshot_hash"?: string,"source"?: string,"superseded_by"?: string | null,"template"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cv_records_key_id_fkey"
      columns: ["key_id"]
isOneToOne: false
      referencedRelation: "signing_keys"
      referencedColumns: ["key_id"]
    },{
      foreignKeyName: "cv_records_superseded_by_fkey"
      columns: ["superseded_by"]
isOneToOne: false
      referencedRelation: "cv_records"
      referencedColumns: ["id"]
    }
                  ]
                },"cv_settings": {
                  Row: {
                    "sections": (string)[],"show_email": boolean,"show_percentile": boolean | null,"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["cv_visibility"]
                  }
                  Insert: {
                    "sections"?: (string)[],"show_email"?: boolean,"show_percentile"?: boolean | null,"updated_at"?: string,"user_id": string,"visibility"?: Database["public"]['Enums']["cv_visibility"]
                  }
                  Update: {
                    "sections"?: (string)[],"show_email"?: boolean,"show_percentile"?: boolean | null,"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["cv_visibility"]
                  }
                  Relationships: [
                    
                  ]
                },"cv_share_links": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"label": string | null,"last_viewed_at": string | null,"revoked_at": string | null,"revoked_reason": string | null,"token_hash": string,"user_id": string,"view_count": number
                  }
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"last_viewed_at"?: string | null,"revoked_at"?: string | null,"revoked_reason"?: string | null,"token_hash": string,"user_id": string,"view_count"?: number
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"last_viewed_at"?: string | null,"revoked_at"?: string | null,"revoked_reason"?: string | null,"token_hash"?: string,"user_id"?: string,"view_count"?: number
                  }
                  Relationships: [
                    
                  ]
                },"cv_views": {
                  Row: {
                    "day": string,"id": number,"link_id": string | null,"record_id": string | null,"source": string,"user_id": string,"viewed_at": string,"viewer_key": string,"viewer_org_id": string | null
                  }
                  Insert: {
                    "day"?: string,"id"?: never,"link_id"?: string | null,"record_id"?: string | null,"source": string,"user_id": string,"viewed_at"?: string,"viewer_key": string,"viewer_org_id"?: string | null
                  }
                  Update: {
                    "day"?: string,"id"?: never,"link_id"?: string | null,"record_id"?: string | null,"source"?: string,"user_id"?: string,"viewed_at"?: string,"viewer_key"?: string,"viewer_org_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cv_views_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "cv_share_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cv_views_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "cv_records"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departments_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"ecosphere_config": {
                  Row: {
                    "announcement_categories": (string)[],"batch_labels": NonNullable<Json>,"branding": NonNullable<Json>,"modules": NonNullable<Json>,"university_id": string,"updated_at": string,"updated_by": string | null,"welcome": string | null
                  }
                  Insert: {
                    "announcement_categories"?: (string)[],"batch_labels"?: NonNullable<Json>,"branding"?: NonNullable<Json>,"modules"?: NonNullable<Json>,"university_id": string,"updated_at"?: string,"updated_by"?: string | null,"welcome"?: string | null
                  }
                  Update: {
                    "announcement_categories"?: (string)[],"batch_labels"?: NonNullable<Json>,"branding"?: NonNullable<Json>,"modules"?: NonNullable<Json>,"university_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"welcome"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ecosphere_config_university_id_fkey"
      columns: ["university_id"]
isOneToOne: true
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"ecosphere_pages": {
                  Row: {
                    "blocks": NonNullable<Json>,"id": string,"position": number,"published": boolean,"slug": string,"title": string,"university_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "blocks"?: NonNullable<Json>,"id"?: string,"position"?: number,"published"?: boolean,"slug": string,"title": string,"university_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "blocks"?: NonNullable<Json>,"id"?: string,"position"?: number,"published"?: boolean,"slug"?: string,"title"?: string,"university_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ecosphere_pages_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"endorsements": {
                  Row: {
                    "created_at": string,"endorsee_id": string,"endorser_id": string,"endorser_kind": string,"evidence_id": string | null,"hidden": boolean,"hidden_at": string | null,"id": string,"note": string | null,"skill_id": string,"venture_id": string
                  }
                  Insert: {
                    "created_at"?: string,"endorsee_id": string,"endorser_id": string,"endorser_kind"?: string,"evidence_id"?: string | null,"hidden"?: boolean,"hidden_at"?: string | null,"id"?: string,"note"?: string | null,"skill_id": string,"venture_id": string
                  }
                  Update: {
                    "created_at"?: string,"endorsee_id"?: string,"endorser_id"?: string,"endorser_kind"?: string,"evidence_id"?: string | null,"hidden"?: boolean,"hidden_at"?: string | null,"id"?: string,"note"?: string | null,"skill_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "endorsements_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "contributions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "endorsements_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "contributions_with_status"
      referencedColumns: ["current_id"]
    },{
      foreignKeyName: "endorsements_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "contributions_with_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "endorsements_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "endorsements_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"entitlement_grants": {
                  Row: {
                    "consumed": number,"created_at": string,"created_by": string | null,"ends_at": string | null,"id": string,"key": string,"notice_sent_at": string | null,"reason": string | null,"revoked_at": string | null,"revoked_reason": string | null,"source": Database["public"]['Enums']["grant_source"],"source_id": string | null,"starts_at": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"value": NonNullable<Json>
                  }
                  Insert: {
                    "consumed"?: number,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"id"?: string,"key": string,"notice_sent_at"?: string | null,"reason"?: string | null,"revoked_at"?: string | null,"revoked_reason"?: string | null,"source": Database["public"]['Enums']["grant_source"],"source_id"?: string | null,"starts_at"?: string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"value": NonNullable<Json>
                  }
                  Update: {
                    "consumed"?: number,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"id"?: string,"key"?: string,"notice_sent_at"?: string | null,"reason"?: string | null,"revoked_at"?: string | null,"revoked_reason"?: string | null,"source"?: Database["public"]['Enums']["grant_source"],"source_id"?: string | null,"starts_at"?: string,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"],"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlement_grants_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "entitlement_keys"
      referencedColumns: ["key"]
    }
                  ]
                },"entitlement_key_aliases": {
                  Row: {
                    "alias": string,"key": string
                  }
                  Insert: {
                    "alias": string,"key": string
                  }
                  Update: {
                    "alias"?: string,"key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlement_key_aliases_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "entitlement_keys"
      referencedColumns: ["key"]
    }
                  ]
                },"entitlement_keys": {
                  Row: {
                    "free_value": NonNullable<Json>,"key": string,"kind": Database["public"]['Enums']["entitlement_kind"],"label": string,"levels": (string)[] | null,"period": string,"subject": Database["public"]['Enums']["billing_subject"]
                  }
                  Insert: {
                    "free_value": NonNullable<Json>,"key": string,"kind": Database["public"]['Enums']["entitlement_kind"],"label": string,"levels"?: (string)[] | null,"period"?: string,"subject": Database["public"]['Enums']["billing_subject"]
                  }
                  Update: {
                    "free_value"?: NonNullable<Json>,"key"?: string,"kind"?: Database["public"]['Enums']["entitlement_kind"],"label"?: string,"levels"?: (string)[] | null,"period"?: string,"subject"?: Database["public"]['Enums']["billing_subject"]
                  }
                  Relationships: [
                    
                  ]
                },"event_registrations": {
                  Row: {
                    "cancelled_at": string | null,"checked_in_at": string | null,"event_id": string,"registered_at": string,"reminded_at": string | null,"user_id": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"checked_in_at"?: string | null,"event_id": string,"registered_at"?: string,"reminded_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"checked_in_at"?: string | null,"event_id"?: string,"registered_at"?: string,"reminded_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_registrations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_rsvps": {
                  Row: {
                    "created_at": string,"post_id": string,"status": Database["public"]['Enums']["rsvp_status"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"post_id": string,"status": Database["public"]['Enums']["rsvp_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"status"?: Database["public"]['Enums']["rsvp_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_rsvps_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "post_events"
      referencedColumns: ["post_id"]
    }
                  ]
                },"events": {
                  Row: {
                    "cancelled_at": string | null,"capacity": number | null,"created_at": string,"created_by": string | null,"description": string | null,"ends_at": string,"id": string,"link": string | null,"location": string | null,"scope": Database["public"]['Enums']["uni_event_scope"],"starts_at": string,"title": string,"type": Database["public"]['Enums']["uni_event_type"],"university_id": string,"updated_at": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at": string,"id"?: string,"link"?: string | null,"location"?: string | null,"scope"?: Database["public"]['Enums']["uni_event_scope"],"starts_at": string,"title": string,"type": Database["public"]['Enums']["uni_event_type"],"university_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at"?: string,"id"?: string,"link"?: string | null,"location"?: string | null,"scope"?: Database["public"]['Enums']["uni_event_scope"],"starts_at"?: string,"title"?: string,"type"?: Database["public"]['Enums']["uni_event_type"],"university_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"exam_periods": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_on": string,"id": string,"reason": string,"starts_on": string,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on": string,"id"?: string,"reason": string,"starts_on": string,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"id"?: string,"reason"?: string,"starts_on"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exam_periods_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"faculty_csv_entries": {
                  Row: {
                    "created_at": string,"department": string | null,"email": string,"id": string,"imported_by": string | null,"title": string | null,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"department"?: string | null,"email": string,"id"?: string,"imported_by"?: string | null,"title"?: string | null,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"department"?: string | null,"email"?: string,"id"?: string,"imported_by"?: string | null,"title"?: string | null,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "faculty_csv_entries_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"feed_sessions": {
                  Row: {
                    "audience": Database["public"]['Enums']["post_audience"],"created_at": string,"filter": string,"post_ids": (string)[],"session_id": string,"user_id": string
                  }
                  Insert: {
                    "audience": Database["public"]['Enums']["post_audience"],"created_at"?: string,"filter": string,"post_ids": (string)[],"session_id"?: string,"user_id": string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["post_audience"],"created_at"?: string,"filter"?: string,"post_ids"?: (string)[],"session_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"feedback": {
                  Row: {
                    "app_version": string | null,"body": string,"claimed_at": string | null,"claimed_by": string | null,"created_at": string,"device": string | null,"id": string,"page": string | null,"replied_at": string | null,"screenshot_path": string | null,"staff_reply": string | null,"status": Database["public"]['Enums']["feedback_status"],"type": Database["public"]['Enums']["feedback_type"],"user_id": string
                  }
                  Insert: {
                    "app_version"?: string | null,"body": string,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"device"?: string | null,"id"?: string,"page"?: string | null,"replied_at"?: string | null,"screenshot_path"?: string | null,"staff_reply"?: string | null,"status"?: Database["public"]['Enums']["feedback_status"],"type": Database["public"]['Enums']["feedback_type"],"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"body"?: string,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"device"?: string | null,"id"?: string,"page"?: string | null,"replied_at"?: string | null,"screenshot_path"?: string | null,"staff_reply"?: string | null,"status"?: Database["public"]['Enums']["feedback_status"],"type"?: Database["public"]['Enums']["feedback_type"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"final_year_batch_requests": {
                  Row: {
                    "batch_year": number | null,"created_at": string,"id": string,"reason": string,"requested_by": string | null,"review_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["uni_request_status"],"university_id": string
                  }
                  Insert: {
                    "batch_year"?: number | null,"created_at"?: string,"id"?: string,"reason": string,"requested_by"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["uni_request_status"],"university_id": string
                  }
                  Update: {
                    "batch_year"?: number | null,"created_at"?: string,"id"?: string,"reason"?: string,"requested_by"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["uni_request_status"],"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "final_year_batch_requests_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"friend_requests": {
                  Row: {
                    "created_at": string,"id": string,"receiver_id": string,"responded_at": string | null,"sender_id": string,"status": Database["public"]['Enums']["friend_request_status"]
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"receiver_id": string,"responded_at"?: string | null,"sender_id": string,"status"?: Database["public"]['Enums']["friend_request_status"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"receiver_id"?: string,"responded_at"?: string | null,"sender_id"?: string,"status"?: Database["public"]['Enums']["friend_request_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "friend_requests_receiver_id_fkey"
      columns: ["receiver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "friend_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"friendships": {
                  Row: {
                    "created_at": string,"user_id_a": string,"user_id_b": string
                  }
                  Insert: {
                    "created_at"?: string,"user_id_a": string,"user_id_b": string
                  }
                  Update: {
                    "created_at"?: string,"user_id_a"?: string,"user_id_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "friendships_user_id_a_fkey"
      columns: ["user_id_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "friendships_user_id_b_fkey"
      columns: ["user_id_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"github_accounts": {
                  Row: {
                    "connected_at": string,"github_id": number,"login": string,"revoked_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "connected_at"?: string,"github_id": number,"login": string,"revoked_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "connected_at"?: string,"github_id"?: number,"login"?: string,"revoked_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"github_commits": {
                  Row: {
                    "ai_agent": string | null,"authored_at": string | null,"exclusion": string | null,"extracted_at": string | null,"files": number,"first_seen_at": string,"meaningful_lines": number,"occurred_at": string,"repo_id": number,"seen_via": string,"sha": string,"signed": boolean,"status": Database["public"]['Enums']["github_commit_status"],"user_id": string,"via_pr": number | null
                  }
                  Insert: {
                    "ai_agent"?: string | null,"authored_at"?: string | null,"exclusion"?: string | null,"extracted_at"?: string | null,"files"?: number,"first_seen_at"?: string,"meaningful_lines"?: number,"occurred_at": string,"repo_id": number,"seen_via": string,"sha": string,"signed"?: boolean,"status"?: Database["public"]['Enums']["github_commit_status"],"user_id": string,"via_pr"?: number | null
                  }
                  Update: {
                    "ai_agent"?: string | null,"authored_at"?: string | null,"exclusion"?: string | null,"extracted_at"?: string | null,"files"?: number,"first_seen_at"?: string,"meaningful_lines"?: number,"occurred_at"?: string,"repo_id"?: number,"seen_via"?: string,"sha"?: string,"signed"?: boolean,"status"?: Database["public"]['Enums']["github_commit_status"],"user_id"?: string,"via_pr"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "github_commits_user_id_repo_id_fkey"
      columns: ["user_id","repo_id"]
isOneToOne: false
      referencedRelation: "github_user_repos"
      referencedColumns: ["user_id","repo_id"]
    }
                  ]
                },"github_installations": {
                  Row: {
                    "account_id": number,"account_login": string,"account_type": string,"created_at": string,"deleted_at": string | null,"installation_id": number,"repository_selection": string,"suspended_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "account_id": number,"account_login": string,"account_type": string,"created_at"?: string,"deleted_at"?: string | null,"installation_id": number,"repository_selection"?: string,"suspended_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: number,"account_login"?: string,"account_type"?: string,"created_at"?: string,"deleted_at"?: string | null,"installation_id"?: number,"repository_selection"?: string,"suspended_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"github_link_clashes": {
                  Row: {
                    "created_at": string,"github_id": number,"github_login": string,"id": number,"linked_user_id": string | null,"resolved_at": string | null,"resolved_by": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"github_id": number,"github_login": string,"id"?: never,"linked_user_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"github_id"?: number,"github_login"?: string,"id"?: never,"linked_user_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"github_pr_skills": {
                  Row: {
                    "number": number,"paths": (string)[],"repo_github_id": number,"skill_id": string,"user_id": string
                  }
                  Insert: {
                    "number": number,"paths"?: (string)[],"repo_github_id": number,"skill_id": string,"user_id": string
                  }
                  Update: {
                    "number"?: number,"paths"?: (string)[],"repo_github_id"?: number,"skill_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "github_pr_skills_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "github_pr_skills_user_id_repo_github_id_number_fkey"
      columns: ["user_id","repo_github_id","number"]
isOneToOne: false
      referencedRelation: "github_pull_requests"
      referencedColumns: ["user_id","repo_github_id","number"]
    }
                  ]
                },"github_pull_requests": {
                  Row: {
                    "approver_github_id": number | null,"counted": boolean,"exclusion": string | null,"files": number,"merged_at": string,"number": number,"pr_github_id": number,"repo_full_name": string,"repo_github_id": number,"repo_private": boolean,"seen_at": string,"user_id": string
                  }
                  Insert: {
                    "approver_github_id"?: number | null,"counted": boolean,"exclusion"?: string | null,"files"?: number,"merged_at": string,"number": number,"pr_github_id": number,"repo_full_name": string,"repo_github_id": number,"repo_private": boolean,"seen_at"?: string,"user_id": string
                  }
                  Update: {
                    "approver_github_id"?: number | null,"counted"?: boolean,"exclusion"?: string | null,"files"?: number,"merged_at"?: string,"number"?: number,"pr_github_id"?: number,"repo_full_name"?: string,"repo_github_id"?: number,"repo_private"?: boolean,"seen_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"github_repos": {
                  Row: {
                    "created_at": string,"default_branch": string | null,"fork": boolean,"full_name": string,"languages": (string)[],"linguist_excludes": (string)[],"owner_id": number,"parent_full_name": string | null,"private": boolean,"pushed_at": string | null,"repo_id": number,"template_full_name": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"default_branch"?: string | null,"fork"?: boolean,"full_name": string,"languages"?: (string)[],"linguist_excludes"?: (string)[],"owner_id": number,"parent_full_name"?: string | null,"private": boolean,"pushed_at"?: string | null,"repo_id": number,"template_full_name"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_branch"?: string | null,"fork"?: boolean,"full_name"?: string,"languages"?: (string)[],"linguist_excludes"?: (string)[],"owner_id"?: number,"parent_full_name"?: string | null,"private"?: boolean,"pushed_at"?: string | null,"repo_id"?: number,"template_full_name"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"github_user_installations": {
                  Row: {
                    "created_at": string,"installation_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"installation_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"installation_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "github_user_installations_installation_id_fkey"
      columns: ["installation_id"]
isOneToOne: false
      referencedRelation: "github_installations"
      referencedColumns: ["installation_id"]
    }
                  ]
                },"github_user_repos": {
                  Row: {
                    "agent_prs_checked_at": string | null,"classified_at": string | null,"discovered_at": string,"excluded": boolean,"harvested_at": string | null,"installation_id": number,"kind": Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at": string | null,"repo_id": number,"user_id": string
                  }
                  Insert: {
                    "agent_prs_checked_at"?: string | null,"classified_at"?: string | null,"discovered_at"?: string,"excluded"?: boolean,"harvested_at"?: string | null,"installation_id": number,"kind"?: Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at"?: string | null,"repo_id": number,"user_id": string
                  }
                  Update: {
                    "agent_prs_checked_at"?: string | null,"classified_at"?: string | null,"discovered_at"?: string,"excluded"?: boolean,"harvested_at"?: string | null,"installation_id"?: number,"kind"?: Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at"?: string | null,"repo_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "github_user_repos_installation_id_fkey"
      columns: ["installation_id"]
isOneToOne: false
      referencedRelation: "github_installations"
      referencedColumns: ["installation_id"]
    },{
      foreignKeyName: "github_user_repos_repo_id_fkey"
      columns: ["repo_id"]
isOneToOne: false
      referencedRelation: "github_repos"
      referencedColumns: ["repo_id"]
    }
                  ]
                },"hire_fees": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"dispute_kind": string | null,"dispute_reason": string | null,"disputed_at": string | null,"due_at": string | null,"hire_id": string | null,"id": string,"invoice_id": string | null,"kind": string,"org_id": string,"overdue_notified_at": string | null,"resolution_reason": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"currency"?: string,"dispute_kind"?: string | null,"dispute_reason"?: string | null,"disputed_at"?: string | null,"due_at"?: string | null,"hire_id"?: string | null,"id"?: string,"invoice_id"?: string | null,"kind": string,"org_id": string,"overdue_notified_at"?: string | null,"resolution_reason"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"dispute_kind"?: string | null,"dispute_reason"?: string | null,"disputed_at"?: string | null,"due_at"?: string | null,"hire_id"?: string | null,"id"?: string,"invoice_id"?: string | null,"kind"?: string,"org_id"?: string,"overdue_notified_at"?: string | null,"resolution_reason"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hire_fees_hire_id_fkey"
      columns: ["hire_id"]
isOneToOne: true
      referencedRelation: "hires"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hire_fees_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hire_fees_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"hire_outcomes": {
                  Row: {
                    "answer": string | null,"answered_at": string | null,"answered_by": string | null,"asked_at": string,"hire_id": string
                  }
                  Insert: {
                    "answer"?: string | null,"answered_at"?: string | null,"answered_by"?: string | null,"asked_at"?: string,"hire_id": string
                  }
                  Update: {
                    "answer"?: string | null,"answered_at"?: string | null,"answered_by"?: string | null,"asked_at"?: string,"hire_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hire_outcomes_hire_id_fkey"
      columns: ["hire_id"]
isOneToOne: true
      referencedRelation: "hires"
      referencedColumns: ["id"]
    }
                  ]
                },"hires": {
                  Row: {
                    "application_id": string | null,"fee_status": string,"hired_at": string,"hired_by": string | null,"id": string,"job_id": string | null,"job_type": string,"kind": string,"org_id": string,"student_id": string | null
                  }
                  Insert: {
                    "application_id"?: string | null,"fee_status"?: string,"hired_at"?: string,"hired_by"?: string | null,"id"?: string,"job_id"?: string | null,"job_type": string,"kind": string,"org_id": string,"student_id"?: string | null
                  }
                  Update: {
                    "application_id"?: string | null,"fee_status"?: string,"hired_at"?: string,"hired_by"?: string | null,"id"?: string,"job_id"?: string | null,"job_type"?: string,"kind"?: string,"org_id"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "hires_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "job_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hires_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hires_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_counters": {
                  Row: {
                    "last": number,"series": string,"year": number
                  }
                  Insert: {
                    "last"?: number,"series": string,"year": number
                  }
                  Update: {
                    "last"?: number,"series"?: string,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"invoices": {
                  Row: {
                    "bill_to": NonNullable<Json>,"content_hash": string,"created_by": string | null,"credits_invoice_id": string | null,"currency": string,"draft_reasons": (string)[],"due_at": string | null,"id": string,"issued_at": string,"kind": string,"lines": NonNullable<Json>,"live": boolean,"number": string,"paid_at": string | null,"payment_id": string | null,"po_number": string | null,"purpose": string,"seller": NonNullable<Json>,"series": string,"status": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"subtotal": number,"tax_lines": NonNullable<Json>,"tax_total": number,"total": number,"void_reason": string | null,"voided_at": string | null
                  }
                  Insert: {
                    "bill_to": NonNullable<Json>,"content_hash": string,"created_by"?: string | null,"credits_invoice_id"?: string | null,"currency": string,"draft_reasons"?: (string)[],"due_at"?: string | null,"id"?: string,"issued_at"?: string,"kind": string,"lines": NonNullable<Json>,"live": boolean,"number": string,"paid_at"?: string | null,"payment_id"?: string | null,"po_number"?: string | null,"purpose": string,"seller": NonNullable<Json>,"series": string,"status": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"subtotal": number,"tax_lines"?: NonNullable<Json>,"tax_total"?: number,"total": number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "bill_to"?: NonNullable<Json>,"content_hash"?: string,"created_by"?: string | null,"credits_invoice_id"?: string | null,"currency"?: string,"draft_reasons"?: (string)[],"due_at"?: string | null,"id"?: string,"issued_at"?: string,"kind"?: string,"lines"?: NonNullable<Json>,"live"?: boolean,"number"?: string,"paid_at"?: string | null,"payment_id"?: string | null,"po_number"?: string | null,"purpose"?: string,"seller"?: NonNullable<Json>,"series"?: string,"status"?: string,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"],"subtotal"?: number,"tax_lines"?: NonNullable<Json>,"tax_total"?: number,"total"?: number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_credits_invoice_id_fkey"
      columns: ["credits_invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"job_applications": {
                  Row: {
                    "applied_at": string,"cv_code": string | null,"id": string,"job_id": string,"note": string | null,"reject_reason": string | null,"stage": Database["public"]['Enums']["application_stage"],"stage_changed_at": string,"student_id": string
                  }
                  Insert: {
                    "applied_at"?: string,"cv_code"?: string | null,"id"?: string,"job_id": string,"note"?: string | null,"reject_reason"?: string | null,"stage"?: Database["public"]['Enums']["application_stage"],"stage_changed_at"?: string,"student_id": string
                  }
                  Update: {
                    "applied_at"?: string,"cv_code"?: string | null,"id"?: string,"job_id"?: string,"note"?: string | null,"reject_reason"?: string | null,"stage"?: Database["public"]['Enums']["application_stage"],"stage_changed_at"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_applications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_posts"
      referencedColumns: ["id"]
    }
                  ]
                },"job_fair_booths": {
                  Row: {
                    "about": string | null,"created_at": string,"fair_id": string,"id": string,"next_position": number,"org_id": string,"roles": (string)[]
                  }
                  Insert: {
                    "about"?: string | null,"created_at"?: string,"fair_id": string,"id"?: string,"next_position"?: number,"org_id": string,"roles"?: (string)[]
                  }
                  Update: {
                    "about"?: string | null,"created_at"?: string,"fair_id"?: string,"id"?: string,"next_position"?: number,"org_id"?: string,"roles"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_fair_booths_fair_id_fkey"
      columns: ["fair_id"]
isOneToOne: false
      referencedRelation: "job_fairs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_fair_booths_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"job_fair_invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_org_id": string | null,"created_at": string,"email": string,"fair_id": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"token_hash": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_org_id"?: string | null,"created_at"?: string,"email": string,"fair_id": string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_org_id"?: string | null,"created_at"?: string,"email"?: string,"fair_id"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_fair_invites_accepted_org_id_fkey"
      columns: ["accepted_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_fair_invites_fair_id_fkey"
      columns: ["fair_id"]
isOneToOne: false
      referencedRelation: "job_fairs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_fair_queue": {
                  Row: {
                    "booth_id": string,"called_at": string | null,"ended_at": string | null,"id": string,"joined_at": string,"position": number,"status": Database["public"]['Enums']["fair_queue_status"],"student_id": string,"thread_id": string | null
                  }
                  Insert: {
                    "booth_id": string,"called_at"?: string | null,"ended_at"?: string | null,"id"?: string,"joined_at"?: string,"position": number,"status"?: Database["public"]['Enums']["fair_queue_status"],"student_id": string,"thread_id"?: string | null
                  }
                  Update: {
                    "booth_id"?: string,"called_at"?: string | null,"ended_at"?: string | null,"id"?: string,"joined_at"?: string,"position"?: number,"status"?: Database["public"]['Enums']["fair_queue_status"],"student_id"?: string,"thread_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_fair_queue_booth_id_fkey"
      columns: ["booth_id"]
isOneToOne: false
      referencedRelation: "job_fair_booths"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_fair_queue_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"job_fair_slots": {
                  Row: {
                    "booked_at": string | null,"booth_id": string,"cancelled_at": string | null,"ends_at": string,"held_at": string | null,"id": string,"starts_at": string,"student_id": string | null
                  }
                  Insert: {
                    "booked_at"?: string | null,"booth_id": string,"cancelled_at"?: string | null,"ends_at": string,"held_at"?: string | null,"id"?: string,"starts_at": string,"student_id"?: string | null
                  }
                  Update: {
                    "booked_at"?: string | null,"booth_id"?: string,"cancelled_at"?: string | null,"ends_at"?: string,"held_at"?: string | null,"id"?: string,"starts_at"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_fair_slots_booth_id_fkey"
      columns: ["booth_id"]
isOneToOne: false
      referencedRelation: "job_fair_booths"
      referencedColumns: ["id"]
    }
                  ]
                },"job_fairs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string | null,"ends_at": string,"id": string,"starts_at": string,"status": Database["public"]['Enums']["fair_status"],"title": string,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at": string,"id"?: string,"starts_at": string,"status"?: Database["public"]['Enums']["fair_status"],"title": string,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at"?: string,"id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["fair_status"],"title"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_fairs_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"job_invites": {
                  Row: {
                    "at": string,"invited_by": string | null,"job_id": string,"student_id": string
                  }
                  Insert: {
                    "at"?: string,"invited_by"?: string | null,"job_id": string,"student_id": string
                  }
                  Update: {
                    "at"?: string,"invited_by"?: string | null,"job_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_invites_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_posts"
      referencedColumns: ["id"]
    }
                  ]
                },"job_posts": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"deadline": string,"description": string,"id": string,"location": string | null,"min_skill_levels": NonNullable<Json>,"min_tier": Database["public"]['Enums']["ranking_tier"] | null,"openings": number,"org_id": string,"paused_at": string | null,"pay_period": string,"published_at": string | null,"remote": boolean,"salary_max": number,"salary_min": number,"sponsored_until": string | null,"status": Database["public"]['Enums']["job_status"],"title": string,"type": string,"updated_at": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deadline": string,"description": string,"id"?: string,"location"?: string | null,"min_skill_levels"?: NonNullable<Json>,"min_tier"?: Database["public"]['Enums']["ranking_tier"] | null,"openings"?: number,"org_id": string,"paused_at"?: string | null,"pay_period"?: string,"published_at"?: string | null,"remote"?: boolean,"salary_max": number,"salary_min": number,"sponsored_until"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deadline"?: string,"description"?: string,"id"?: string,"location"?: string | null,"min_skill_levels"?: NonNullable<Json>,"min_tier"?: Database["public"]['Enums']["ranking_tier"] | null,"openings"?: number,"org_id"?: string,"paused_at"?: string | null,"pay_period"?: string,"published_at"?: string | null,"remote"?: boolean,"salary_max"?: number,"salary_min"?: number,"sponsored_until"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_posts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "created_at": string,"error": string | null,"finished_at": string | null,"id": string,"job": string,"meta": NonNullable<Json>,"rows": number | null,"started_at": string,"status": Database["public"]['Enums']["job_run_status"]
                  }
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"job": string,"meta"?: NonNullable<Json>,"rows"?: number | null,"started_at"?: string,"status"?: Database["public"]['Enums']["job_run_status"]
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"job"?: string,"meta"?: NonNullable<Json>,"rows"?: number | null,"started_at"?: string,"status"?: Database["public"]['Enums']["job_run_status"]
                  }
                  Relationships: [
                    
                  ]
                },"link_previews": {
                  Row: {
                    "description": string | null,"fetched_at": string,"image_url": string | null,"site_name": string | null,"status": string,"title": string | null,"url": string,"url_hash": string
                  }
                  Insert: {
                    "description"?: string | null,"fetched_at"?: string,"image_url"?: string | null,"site_name"?: string | null,"status": string,"title"?: string | null,"url": string,"url_hash": string
                  }
                  Update: {
                    "description"?: string | null,"fetched_at"?: string,"image_url"?: string | null,"site_name"?: string | null,"status"?: string,"title"?: string | null,"url"?: string,"url_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"message_reactions": {
                  Row: {
                    "created_at": string,"emoji": string,"message_id": string,"thread_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"emoji": string,"message_id": string,"thread_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"emoji"?: string,"message_id"?: string,"thread_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "chat_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"micro_survey_assignments": {
                  Row: {
                    "assigned_at": string,"dimension": string,"post_id": string,"question_id": number,"user_id": string
                  }
                  Insert: {
                    "assigned_at"?: string,"dimension": string,"post_id": string,"question_id": number,"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"dimension"?: string,"post_id"?: string,"question_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "micro_survey_assignments_dimension_fkey"
      columns: ["dimension"]
isOneToOne: false
      referencedRelation: "micro_survey_dimensions"
      referencedColumns: ["dimension"]
    },{
      foreignKeyName: "micro_survey_assignments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "micro_survey_assignments_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "micro_survey_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"micro_survey_dimensions": {
                  Row: {
                    "dimension": string,"label": string,"post_types": (Database["public"]['Enums']["post_type"])[],"public": boolean,"public_phrase": string | null,"tie_priority": number
                  }
                  Insert: {
                    "dimension": string,"label": string,"post_types": (Database["public"]['Enums']["post_type"])[],"public"?: boolean,"public_phrase"?: string | null,"tie_priority"?: number
                  }
                  Update: {
                    "dimension"?: string,"label"?: string,"post_types"?: (Database["public"]['Enums']["post_type"])[],"public"?: boolean,"public_phrase"?: string | null,"tie_priority"?: number
                  }
                  Relationships: [
                    
                  ]
                },"micro_survey_questions": {
                  Row: {
                    "active": boolean,"dimension": string,"id": number,"text": string
                  }
                  Insert: {
                    "active"?: boolean,"dimension": string,"id"?: never,"text": string
                  }
                  Update: {
                    "active"?: boolean,"dimension"?: string,"id"?: never,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "micro_survey_questions_dimension_fkey"
      columns: ["dimension"]
isOneToOne: false
      referencedRelation: "micro_survey_dimensions"
      referencedColumns: ["dimension"]
    }
                  ]
                },"micro_survey_responses": {
                  Row: {
                    "answer": boolean,"created_at": string,"dimension": string,"latency_ms": number,"locked_at": string,"post_id": string,"question_id": number,"updated_at": string | null,"user_id": string,"weight": number
                  }
                  Insert: {
                    "answer": boolean,"created_at"?: string,"dimension": string,"latency_ms": number,"locked_at": string,"post_id": string,"question_id": number,"updated_at"?: string | null,"user_id": string,"weight": number
                  }
                  Update: {
                    "answer"?: boolean,"created_at"?: string,"dimension"?: string,"latency_ms"?: number,"locked_at"?: string,"post_id"?: string,"question_id"?: number,"updated_at"?: string | null,"user_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "micro_survey_responses_dimension_fkey"
      columns: ["dimension"]
isOneToOne: false
      referencedRelation: "micro_survey_dimensions"
      referencedColumns: ["dimension"]
    },{
      foreignKeyName: "micro_survey_responses_post_id_user_id_fkey"
      columns: ["post_id","user_id"]
isOneToOne: true
      referencedRelation: "micro_survey_assignments"
      referencedColumns: ["post_id","user_id"]
    },{
      foreignKeyName: "micro_survey_responses_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "micro_survey_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_categories": {
                  Row: {
                    "allow_instant": boolean,"category": string,"default_channel": Database["public"]['Enums']["email_channel"],"description": string,"label": string,"position": number
                  }
                  Insert: {
                    "allow_instant"?: boolean,"category": string,"default_channel": Database["public"]['Enums']["email_channel"],"description": string,"label": string,"position": number
                  }
                  Update: {
                    "allow_instant"?: boolean,"category"?: string,"default_channel"?: Database["public"]['Enums']["email_channel"],"description"?: string,"label"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"notification_prefs": {
                  Row: {
                    "category": string,"channel": Database["public"]['Enums']["email_channel"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "category": string,"channel": Database["public"]['Enums']["email_channel"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string,"channel"?: Database["public"]['Enums']["email_channel"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_category_fkey"
      columns: ["category"]
isOneToOne: false
      referencedRelation: "notification_categories"
      referencedColumns: ["category"]
    }
                  ]
                },"notification_types": {
                  Row: {
                    "category": string,"emailed": boolean,"type": string
                  }
                  Insert: {
                    "category": string,"emailed"?: boolean,"type": string
                  }
                  Update: {
                    "category"?: string,"emailed"?: boolean,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_types_category_fkey"
      columns: ["category"]
isOneToOne: false
      referencedRelation: "notification_categories"
      referencedColumns: ["category"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"entity_id": string,"entity_type": string,"id": string,"read_at": string | null,"type": string,"user_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"entity_id": string,"entity_type": string,"id"?: string,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"entity_id"?: string,"entity_type"?: string,"id"?: string,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "notification_types"
      referencedColumns: ["type"]
    }
                  ]
                },"onboarding_state": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"data": NonNullable<Json>,"role": Database["public"]['Enums']["account_role"],"step": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"role"?: Database["public"]['Enums']["account_role"],"step"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"role"?: Database["public"]['Enums']["account_role"],"step"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ops_audit_log": {
                  Row: {
                    "action": string,"after": Json | null,"before": Json | null,"created_at": string,"id": string,"reason": string,"staff_id": string,"target_id": string,"target_type": string
                  }
                  Insert: {
                    "action": string,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: string,"reason": string,"staff_id": string,"target_id": string,"target_type": string
                  }
                  Update: {
                    "action"?: string,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: string,"reason"?: string,"staff_id"?: string,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ops_view_sessions": {
                  Row: {
                    "expires_at": string,"id": string,"pages": (string)[],"reason": string,"staff_id": string,"started_at": string,"user_id": string
                  }
                  Insert: {
                    "expires_at"?: string,"id"?: string,"pages"?: (string)[],"reason": string,"staff_id": string,"started_at"?: string,"user_id": string
                  }
                  Update: {
                    "expires_at"?: string,"id"?: string,"pages"?: (string)[],"reason"?: string,"staff_id"?: string,"started_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"org_events": {
                  Row: {
                    "actor_id": string | null,"at": string,"id": number,"kind": string,"org_id": string,"student_id": string | null
                  }
                  Insert: {
                    "actor_id"?: string | null,"at"?: string,"id"?: never,"kind": string,"org_id": string,"student_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"at"?: string,"id"?: never,"kind"?: string,"org_id"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_invites": {
                  Row: {
                    "created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"org_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["org_role"],"token_hash": string,"used_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invited_by"?: string | null,"org_id": string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["org_role"],"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["org_role"],"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"invited_by": string | null,"org_id": string,"role": Database["public"]['Enums']["org_role"],"seat_keep": boolean,"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"invited_by"?: string | null,"org_id": string,"role": Database["public"]['Enums']["org_role"],"seat_keep"?: boolean,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"invited_by"?: string | null,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"seat_keep"?: boolean,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_spam_reviews": {
                  Row: {
                    "declined": number,"id": string,"note": string | null,"opened_at": string,"org_id": string,"rate": number,"requests": number,"resolved_at": string | null,"resolved_by": string | null,"status": string
                  }
                  Insert: {
                    "declined": number,"id"?: string,"note"?: string | null,"opened_at"?: string,"org_id": string,"rate": number,"requests": number,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "declined"?: number,"id"?: string,"note"?: string | null,"opened_at"?: string,"org_id"?: string,"rate"?: number,"requests"?: number,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_spam_reviews_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "about": string | null,"billing_address": string | null,"billing_ntn": string | null,"city": string,"created_at": string,"created_by": string | null,"domain": string,"id": string,"industry": string,"linkedin_url": string | null,"locations": (string)[],"name": string,"province": string | null,"registration_doc_at": string | null,"registration_doc_bytes": number | null,"registration_doc_path": string | null,"registration_number": string | null,"signer_role": string,"size": string,"slug": string,"status": Database["public"]['Enums']["org_status"],"status_reason": string | null,"updated_at": string,"verified_at": string | null,"verified_by": string | null,"website": string
                  }
                  Insert: {
                    "about"?: string | null,"billing_address"?: string | null,"billing_ntn"?: string | null,"city": string,"created_at"?: string,"created_by"?: string | null,"domain": string,"id"?: string,"industry": string,"linkedin_url"?: string | null,"locations"?: (string)[],"name": string,"province"?: string | null,"registration_doc_at"?: string | null,"registration_doc_bytes"?: number | null,"registration_doc_path"?: string | null,"registration_number"?: string | null,"signer_role": string,"size": string,"slug": string,"status"?: Database["public"]['Enums']["org_status"],"status_reason"?: string | null,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"website": string
                  }
                  Update: {
                    "about"?: string | null,"billing_address"?: string | null,"billing_ntn"?: string | null,"city"?: string,"created_at"?: string,"created_by"?: string | null,"domain"?: string,"id"?: string,"industry"?: string,"linkedin_url"?: string | null,"locations"?: (string)[],"name"?: string,"province"?: string | null,"registration_doc_at"?: string | null,"registration_doc_bytes"?: number | null,"registration_doc_path"?: string | null,"registration_number"?: string | null,"signer_role"?: string,"size"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["org_status"],"status_reason"?: string | null,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"website"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"checkout_session_id": string | null,"created_at": string,"currency": string,"gateway": string,"gateway_payment_id": string,"id": string,"invoice_id": string | null,"kind": string,"live": boolean,"method": string,"mor_invoice_ref": string | null,"refunded_amount": number,"status": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"subscription_id": string | null
                  }
                  Insert: {
                    "amount": number,"checkout_session_id"?: string | null,"created_at"?: string,"currency": string,"gateway": string,"gateway_payment_id": string,"id"?: string,"invoice_id"?: string | null,"kind": string,"live": boolean,"method": string,"mor_invoice_ref"?: string | null,"refunded_amount"?: number,"status"?: string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"subscription_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"checkout_session_id"?: string | null,"created_at"?: string,"currency"?: string,"gateway"?: string,"gateway_payment_id"?: string,"id"?: string,"invoice_id"?: string | null,"kind"?: string,"live"?: boolean,"method"?: string,"mor_invoice_ref"?: string | null,"refunded_amount"?: number,"status"?: string,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"],"subscription_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_checkout_session_id_fkey"
      columns: ["checkout_session_id"]
isOneToOne: false
      referencedRelation: "checkout_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_invoice_fk"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_email_domains": {
                  Row: {
                    "created_at": string,"domain": string
                  }
                  Insert: {
                    "created_at"?: string,"domain": string
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plans": {
                  Row: {
                    "active": boolean,"audience": Database["public"]['Enums']["billing_subject"],"grants": NonNullable<Json>,"id": string,"interval": string,"label": string,"position": number,"price_pkr": number | null,"price_usd": number | null,"self_serve": boolean,"tier": string
                  }
                  Insert: {
                    "active"?: boolean,"audience": Database["public"]['Enums']["billing_subject"],"grants": NonNullable<Json>,"id": string,"interval": string,"label": string,"position"?: number,"price_pkr"?: number | null,"price_usd"?: number | null,"self_serve"?: boolean,"tier": string
                  }
                  Update: {
                    "active"?: boolean,"audience"?: Database["public"]['Enums']["billing_subject"],"grants"?: NonNullable<Json>,"id"?: string,"interval"?: string,"label"?: string,"position"?: number,"price_pkr"?: number | null,"price_usd"?: number | null,"self_serve"?: boolean,"tier"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_config": {
                  Row: {
                    "created_at": string,"effective_at": string,"key": string,"reason": string,"staff_id": string | null,"value": NonNullable<Json>,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"effective_at"?: string,"key": string,"reason": string,"staff_id"?: string | null,"value": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "created_at"?: string,"effective_at"?: string,"key"?: string,"reason"?: string,"staff_id"?: string | null,"value"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"poll_options": {
                  Row: {
                    "label": string,"position": number,"post_id": string
                  }
                  Insert: {
                    "label": string,"position": number,"post_id": string
                  }
                  Update: {
                    "label"?: string,"position"?: number,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_options_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "post_polls"
      referencedColumns: ["post_id"]
    }
                  ]
                },"poll_votes": {
                  Row: {
                    "created_at": string,"position": number,"post_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"position": number,"post_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"position"?: number,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_votes_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "post_polls"
      referencedColumns: ["post_id"]
    },{
      foreignKeyName: "poll_votes_post_id_position_fkey"
      columns: ["post_id","position"]
isOneToOne: false
      referencedRelation: "poll_options"
      referencedColumns: ["post_id","position"]
    }
                  ]
                },"post_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"hidden_by_university_at": string | null,"id": string,"parent_id": string | null,"pinned": boolean,"post_id": string,"removed_by": string | null
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"hidden_by_university_at"?: string | null,"id"?: string,"parent_id"?: string | null,"pinned"?: boolean,"post_id": string,"removed_by"?: string | null
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"hidden_by_university_at"?: string | null,"id"?: string,"parent_id"?: string | null,"pinned"?: boolean,"post_id"?: string,"removed_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "post_comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_events": {
                  Row: {
                    "place": string | null,"post_id": string,"starts_at": string,"url": string | null
                  }
                  Insert: {
                    "place"?: string | null,"post_id": string,"starts_at": string,"url"?: string | null
                  }
                  Update: {
                    "place"?: string | null,"post_id"?: string,"starts_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_events_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_hides": {
                  Row: {
                    "created_at": string,"post_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_hides_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_media": {
                  Row: {
                    "height": number,"path": string,"position": number,"post_id": string,"width": number
                  }
                  Insert: {
                    "height": number,"path": string,"position": number,"post_id": string,"width": number
                  }
                  Update: {
                    "height"?: number,"path"?: string,"position"?: number,"post_id"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_polls": {
                  Row: {
                    "closes_at": string,"post_id": string
                  }
                  Insert: {
                    "closes_at": string,"post_id": string
                  }
                  Update: {
                    "closes_at"?: string,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_polls_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_stats": {
                  Row: {
                    "answers": number,"appropriate_flags": number,"commenter_universities": number,"commenters": number,"hides": number,"positives": number,"post_id": string,"reports": number,"updated_at": string,"views": number
                  }
                  Insert: {
                    "answers"?: number,"appropriate_flags"?: number,"commenter_universities"?: number,"commenters"?: number,"hides"?: number,"positives"?: number,"post_id": string,"reports"?: number,"updated_at"?: string,"views"?: number
                  }
                  Update: {
                    "answers"?: number,"appropriate_flags"?: number,"commenter_universities"?: number,"commenters"?: number,"hides"?: number,"positives"?: number,"post_id"?: string,"reports"?: number,"updated_at"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_stats_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_survey_counts": {
                  Row: {
                    "assigned": number,"crosses": number,"dimension": string,"post_id": string,"ticks": number,"weighted_crosses": number,"weighted_ticks": number
                  }
                  Insert: {
                    "assigned"?: number,"crosses"?: number,"dimension": string,"post_id": string,"ticks"?: number,"weighted_crosses"?: number,"weighted_ticks"?: number
                  }
                  Update: {
                    "assigned"?: number,"crosses"?: number,"dimension"?: string,"post_id"?: string,"ticks"?: number,"weighted_crosses"?: number,"weighted_ticks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_survey_counts_dimension_fkey"
      columns: ["dimension"]
isOneToOne: false
      referencedRelation: "micro_survey_dimensions"
      referencedColumns: ["dimension"]
    },{
      foreignKeyName: "post_survey_counts_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_views": {
                  Row: {
                    "first_seen_at": string,"post_id": string,"user_id": string
                  }
                  Insert: {
                    "first_seen_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "first_seen_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_views_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "audience": Database["public"]['Enums']["post_audience"],"author_id": string,"body": string,"created_at": string,"edited_at": string | null,"hidden_by_university_at": string | null,"id": string,"link_url": string | null,"pinned_until": string | null,"removed_at": string | null,"removed_by": string | null,"stage": Database["public"]['Enums']["post_stage"],"stage_changed_at": string,"type": Database["public"]['Enums']["post_type"],"university_id": string | null,"venture_id": string | null
                  }
                  Insert: {
                    "audience": Database["public"]['Enums']["post_audience"],"author_id": string,"body": string,"created_at"?: string,"edited_at"?: string | null,"hidden_by_university_at"?: string | null,"id"?: string,"link_url"?: string | null,"pinned_until"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"stage"?: Database["public"]['Enums']["post_stage"],"stage_changed_at"?: string,"type": Database["public"]['Enums']["post_type"],"university_id"?: string | null,"venture_id"?: string | null
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["post_audience"],"author_id"?: string,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"hidden_by_university_at"?: string | null,"id"?: string,"link_url"?: string | null,"pinned_until"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"stage"?: Database["public"]['Enums']["post_stage"],"stage_changed_at"?: string,"type"?: Database["public"]['Enums']["post_type"],"university_id"?: string | null,"venture_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_views": {
                  Row: {
                    "at": string,"day": string,"id": number,"org_id": string,"student_id": string,"viewer_id": string | null
                  }
                  Insert: {
                    "at"?: string,"day"?: string,"id"?: never,"org_id": string,"student_id": string,"viewer_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"day"?: string,"id"?: never,"org_id"?: string,"student_id"?: string,"viewer_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_views_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "availability": (string)[],"avatar_path": string | null,"bio": string | null,"campus": string | null,"chat_read_receipts": boolean,"city": string | null,"cover_path": string | null,"created_at": string,"delete_after": string | null,"department": string | null,"department_id": string | null,"full_name": string,"graduated_at": string | null,"graduation_year": number | null,"leaderboard_opt_out": boolean,"looking_for": (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete": boolean,"programme": string | null,"recruiter_visible": boolean,"remote_ok": boolean,"role": Database["public"]['Enums']["account_role"],"status": Database["public"]['Enums']["account_status"],"university_id": string | null,"updated_at": string,"user_id": string,"username": string | null,"visibility": Database["public"]['Enums']["profile_visibility"]
                  }
                  Insert: {
                    "availability"?: (string)[],"avatar_path"?: string | null,"bio"?: string | null,"campus"?: string | null,"chat_read_receipts"?: boolean,"city"?: string | null,"cover_path"?: string | null,"created_at"?: string,"delete_after"?: string | null,"department"?: string | null,"department_id"?: string | null,"full_name": string,"graduated_at"?: string | null,"graduation_year"?: number | null,"leaderboard_opt_out"?: boolean,"looking_for"?: (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete"?: boolean,"programme"?: string | null,"recruiter_visible"?: boolean,"remote_ok"?: boolean,"role"?: Database["public"]['Enums']["account_role"],"status"?: Database["public"]['Enums']["account_status"],"university_id"?: string | null,"updated_at"?: string,"user_id": string,"username"?: string | null,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Update: {
                    "availability"?: (string)[],"avatar_path"?: string | null,"bio"?: string | null,"campus"?: string | null,"chat_read_receipts"?: boolean,"city"?: string | null,"cover_path"?: string | null,"created_at"?: string,"delete_after"?: string | null,"department"?: string | null,"department_id"?: string | null,"full_name"?: string,"graduated_at"?: string | null,"graduation_year"?: number | null,"leaderboard_opt_out"?: boolean,"looking_for"?: (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete"?: boolean,"programme"?: string | null,"recruiter_visible"?: boolean,"remote_ok"?: boolean,"role"?: Database["public"]['Enums']["account_role"],"status"?: Database["public"]['Enums']["account_status"],"university_id"?: string | null,"updated_at"?: string,"user_id"?: string,"username"?: string | null,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles_public_card": {
                  Row: {
                    "department": string | null,"full_name": string,"graduation_year": number | null,"search": unknown,"user_id": string,"username": string | null
                  }
                  Insert: {
                    "department"?: string | null,"full_name": string,"graduation_year"?: number | null,"search"?: never,"user_id": string,"username"?: string | null
                  }
                  Update: {
                    "department"?: string | null,"full_name"?: string,"graduation_year"?: number | null,"search"?: never,"user_id"?: string,"username"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_public_card_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"programmes": {
                  Row: {
                    "created_at": string,"department_id": string,"id": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"department_id": string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "programmes_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                },"project_ideas": {
                  Row: {
                    "audience": Database["public"]['Enums']["idea_audience"],"brief": string,"course_label": string | null,"created_at": string,"deadline": string | null,"deliverables": string,"difficulty": Database["public"]['Enums']["idea_difficulty"],"duration_weeks": number,"id": string,"max_teams": number,"skills": (string)[],"status": Database["public"]['Enums']["idea_status"],"teacher_id": string,"team_size": number,"title": string,"university_id": string,"updated_at": string
                  }
                  Insert: {
                    "audience"?: Database["public"]['Enums']["idea_audience"],"brief": string,"course_label"?: string | null,"created_at"?: string,"deadline"?: string | null,"deliverables": string,"difficulty": Database["public"]['Enums']["idea_difficulty"],"duration_weeks": number,"id"?: string,"max_teams"?: number,"skills"?: (string)[],"status"?: Database["public"]['Enums']["idea_status"],"teacher_id": string,"team_size": number,"title": string,"university_id": string,"updated_at"?: string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["idea_audience"],"brief"?: string,"course_label"?: string | null,"created_at"?: string,"deadline"?: string | null,"deliverables"?: string,"difficulty"?: Database["public"]['Enums']["idea_difficulty"],"duration_weeks"?: number,"id"?: string,"max_teams"?: number,"skills"?: (string)[],"status"?: Database["public"]['Enums']["idea_status"],"teacher_id"?: string,"team_size"?: number,"title"?: string,"university_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_ideas_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "project_ideas_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"ranking_adjustments": {
                  Row: {
                    "case_id": string | null,"created_at": string,"flag_id": string | null,"id": string,"kind": Database["public"]['Enums']["ranking_adjustment_kind"],"points": number | null,"reason": string,"severity": string | null,"staff_id": string | null,"user_id": string
                  }
                  Insert: {
                    "case_id"?: string | null,"created_at"?: string,"flag_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["ranking_adjustment_kind"],"points"?: number | null,"reason": string,"severity"?: string | null,"staff_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "case_id"?: string | null,"created_at"?: string,"flag_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["ranking_adjustment_kind"],"points"?: number | null,"reason"?: string,"severity"?: string | null,"staff_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ranking_adjustments_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "report_cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranking_adjustments_flag_id_fkey"
      columns: ["flag_id"]
isOneToOne: false
      referencedRelation: "anti_gaming_flags"
      referencedColumns: ["id"]
    }
                  ]
                },"ranking_runs": {
                  Row: {
                    "as_of": string,"cursor": string | null,"error": string | null,"finished_at": string | null,"formula": NonNullable<Json>,"formula_version": number,"held": number,"id": number,"job_run_id": string | null,"run_on": string,"stage": string,"started_at": string,"steps": number,"students": number
                  }
                  Insert: {
                    "as_of": string,"cursor"?: string | null,"error"?: string | null,"finished_at"?: string | null,"formula": NonNullable<Json>,"formula_version": number,"held"?: number,"id"?: never,"job_run_id"?: string | null,"run_on": string,"stage"?: string,"started_at"?: string,"steps"?: number,"students"?: number
                  }
                  Update: {
                    "as_of"?: string,"cursor"?: string | null,"error"?: string | null,"finished_at"?: string | null,"formula"?: NonNullable<Json>,"formula_version"?: number,"held"?: number,"id"?: never,"job_run_id"?: string | null,"run_on"?: string,"stage"?: string,"started_at"?: string,"steps"?: number,"students"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ranking_runs_job_run_id_fkey"
      columns: ["job_run_id"]
isOneToOne: false
      referencedRelation: "job_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"ranking_scores": {
                  Row: {
                    "adjustments": number,"below_since": string | null,"components": NonNullable<Json>,"computed_at": string,"formula_version": number,"held": boolean,"held_total": number | null,"momentum": number,"momentum_peak": number,"percentile": number | null,"proof": number,"published_at": string,"ranked": boolean,"tier": Database["public"]['Enums']["ranking_tier"] | null,"tier_met": Database["public"]['Enums']["ranking_tier"] | null,"total": number,"user_id": string
                  }
                  Insert: {
                    "adjustments": number,"below_since"?: string | null,"components": NonNullable<Json>,"computed_at": string,"formula_version": number,"held"?: boolean,"held_total"?: number | null,"momentum": number,"momentum_peak"?: number,"percentile"?: number | null,"proof": number,"published_at": string,"ranked": boolean,"tier"?: Database["public"]['Enums']["ranking_tier"] | null,"tier_met"?: Database["public"]['Enums']["ranking_tier"] | null,"total": number,"user_id": string
                  }
                  Update: {
                    "adjustments"?: number,"below_since"?: string | null,"components"?: NonNullable<Json>,"computed_at"?: string,"formula_version"?: number,"held"?: boolean,"held_total"?: number | null,"momentum"?: number,"momentum_peak"?: number,"percentile"?: number | null,"proof"?: number,"published_at"?: string,"ranked"?: boolean,"tier"?: Database["public"]['Enums']["ranking_tier"] | null,"tier_met"?: Database["public"]['Enums']["ranking_tier"] | null,"total"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ranking_snapshots": {
                  Row: {
                    "components": NonNullable<Json>,"formula_version": number,"percentile": number | null,"ranked": boolean,"tier": Database["public"]['Enums']["ranking_tier"] | null,"total": number,"user_id": string,"week": string
                  }
                  Insert: {
                    "components": NonNullable<Json>,"formula_version": number,"percentile"?: number | null,"ranked": boolean,"tier"?: Database["public"]['Enums']["ranking_tier"] | null,"total": number,"user_id": string,"week": string
                  }
                  Update: {
                    "components"?: NonNullable<Json>,"formula_version"?: number,"percentile"?: number | null,"ranked"?: boolean,"tier"?: Database["public"]['Enums']["ranking_tier"] | null,"total"?: number,"user_id"?: string,"week"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recognised_issuers": {
                  Row: {
                    "aliases": (string)[],"created_at": string,"id": string,"name": string,"retired_at": string | null
                  }
                  Insert: {
                    "aliases"?: (string)[],"created_at"?: string,"id": string,"name": string,"retired_at"?: string | null
                  }
                  Update: {
                    "aliases"?: (string)[],"created_at"?: string,"id"?: string,"name"?: string,"retired_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recruiter_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"org_id": string,"student_id": string | null
                  }
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"org_id": string,"student_id"?: string | null
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"org_id"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruiter_notes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"recruiter_shortlists": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"org_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"org_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruiter_shortlists_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"report_cases": {
                  Row: {
                    "claimed_at": string | null,"claimed_by": string | null,"id": string,"last_reported_at": string,"opened_at": string,"owner_id": string | null,"reports": number,"resolution_reason": string | null,"resolved_at": string | null,"resolved_by": string | null,"snapshot": NonNullable<Json>,"soft_signal": boolean,"status": Database["public"]['Enums']["report_case_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Insert: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"id"?: string,"last_reported_at"?: string,"opened_at"?: string,"owner_id"?: string | null,"reports"?: number,"resolution_reason"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"snapshot"?: NonNullable<Json>,"soft_signal"?: boolean,"status"?: Database["public"]['Enums']["report_case_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Update: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"id"?: string,"last_reported_at"?: string,"opened_at"?: string,"owner_id"?: string | null,"reports"?: number,"resolution_reason"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"snapshot"?: NonNullable<Json>,"soft_signal"?: boolean,"status"?: Database["public"]['Enums']["report_case_status"],"target_id"?: string,"target_type"?: Database["public"]['Enums']["report_target"]
                  }
                  Relationships: [
                    
                  ]
                },"report_messages": {
                  Row: {
                    "body": string,"had_image": boolean,"is_reported": boolean,"message_id": string,"report_id": string,"sender_id": string | null,"sent_at": string
                  }
                  Insert: {
                    "body": string,"had_image"?: boolean,"is_reported"?: boolean,"message_id": string,"report_id": string,"sender_id"?: string | null,"sent_at": string
                  }
                  Update: {
                    "body"?: string,"had_image"?: boolean,"is_reported"?: boolean,"message_id"?: string,"report_id"?: string,"sender_id"?: string | null,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_messages_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "case_id": string,"created_at": string,"detail": string | null,"id": string,"reason": Database["public"]['Enums']["report_reason"],"reporter_id": string,"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Insert: {
                    "case_id": string,"created_at"?: string,"detail"?: string | null,"id"?: string,"reason": Database["public"]['Enums']["report_reason"],"reporter_id": string,"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Update: {
                    "case_id"?: string,"created_at"?: string,"detail"?: string | null,"id"?: string,"reason"?: Database["public"]['Enums']["report_reason"],"reporter_id"?: string,"target_id"?: string,"target_type"?: Database["public"]['Enums']["report_target"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "report_cases"
      referencedColumns: ["id"]
    }
                  ]
                },"review_flags": {
                  Row: {
                    "claimed_at": string | null,"claimed_by": string | null,"created_at": string,"id": number,"key": string,"kind": Database["public"]['Enums']["review_flag_kind"],"note": string | null,"refs": NonNullable<Json>,"resolved_at": string | null,"reviewer_id": string | null,"status": Database["public"]['Enums']["review_flag_status"],"user_id": string
                  }
                  Insert: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"id"?: never,"key": string,"kind": Database["public"]['Enums']["review_flag_kind"],"note"?: string | null,"refs"?: NonNullable<Json>,"resolved_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"user_id": string
                  }
                  Update: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"id"?: never,"key"?: string,"kind"?: Database["public"]['Enums']["review_flag_kind"],"note"?: string | null,"refs"?: NonNullable<Json>,"resolved_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_requests": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"due_at": string,"id": string,"remind12_at": string | null,"remind7_at": string | null,"requested_by": string,"status": Database["public"]['Enums']["review_request_status"],"teacher_id": string,"venture_id": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"due_at": string,"id"?: string,"remind12_at"?: string | null,"remind7_at"?: string | null,"requested_by": string,"status"?: Database["public"]['Enums']["review_request_status"],"teacher_id": string,"venture_id": string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"due_at"?: string,"id"?: string,"remind12_at"?: string | null,"remind7_at"?: string | null,"requested_by"?: string,"status"?: Database["public"]['Enums']["review_request_status"],"teacher_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_requests_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "review_requests_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_leads": {
                  Row: {
                    "claimed_by": string | null,"created_at": string,"email": string,"id": string,"kind": string,"message": string,"name": string,"organisation": string,"role": string,"staff_note": string | null,"status": Database["public"]['Enums']["sales_lead_status"],"university_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "claimed_by"?: string | null,"created_at"?: string,"email": string,"id"?: string,"kind"?: string,"message": string,"name": string,"organisation": string,"role": string,"staff_note"?: string | null,"status"?: Database["public"]['Enums']["sales_lead_status"],"university_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "claimed_by"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"kind"?: string,"message"?: string,"name"?: string,"organisation"?: string,"role"?: string,"staff_note"?: string | null,"status"?: Database["public"]['Enums']["sales_lead_status"],"university_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_leads_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"sanctions": {
                  Row: {
                    "case_id": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["sanction_kind"],"lift_reason": string | null,"lifted_at": string | null,"lifted_by": string | null,"org_id": string | null,"per_day": number | null,"reason": string,"staff_id": string,"until": string | null,"user_id": string | null
                  }
                  Insert: {
                    "case_id"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["sanction_kind"],"lift_reason"?: string | null,"lifted_at"?: string | null,"lifted_by"?: string | null,"org_id"?: string | null,"per_day"?: number | null,"reason": string,"staff_id": string,"until"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "case_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["sanction_kind"],"lift_reason"?: string | null,"lifted_at"?: string | null,"lifted_by"?: string | null,"org_id"?: string | null,"per_day"?: number | null,"reason"?: string,"staff_id"?: string,"until"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sanctions_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "report_cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sanctions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "created_at": string,"filters": NonNullable<Json>,"frequency": string,"id": string,"last_run_at": string,"name": string,"org_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"filters": NonNullable<Json>,"frequency": string,"id"?: string,"last_run_at"?: string,"name": string,"org_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"frequency"?: string,"id"?: string,"last_run_at"?: string,"name"?: string,"org_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_searches_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"search_audit": {
                  Row: {
                    "at": string,"filters": NonNullable<Json>,"id": number,"mode": string,"org_id": string,"result_count": number,"user_id": string | null
                  }
                  Insert: {
                    "at"?: string,"filters": NonNullable<Json>,"id"?: never,"mode": string,"org_id": string,"result_count": number,"user_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"filters"?: NonNullable<Json>,"id"?: never,"mode"?: string,"org_id"?: string,"result_count"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_audit_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"security_events": {
                  Row: {
                    "created_at": string,"id": string,"ip_hash": string | null,"kind": string,"meta": NonNullable<Json>,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"ip_hash"?: string | null,"kind": string,"meta"?: NonNullable<Json>,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ip_hash"?: string | null,"kind"?: string,"meta"?: NonNullable<Json>,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"semesters": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_on": string,"id": string,"name": string,"starts_on": string,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on": string,"id"?: string,"name": string,"starts_on": string,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"id"?: string,"name"?: string,"starts_on"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "semesters_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"shortlist_items": {
                  Row: {
                    "added_by": string | null,"created_at": string,"hidden": boolean,"id": string,"position": number,"shortlist_id": string,"student_id": string
                  }
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"hidden"?: boolean,"id"?: string,"position"?: number,"shortlist_id": string,"student_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"hidden"?: boolean,"id"?: string,"position"?: number,"shortlist_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shortlist_items_shortlist_id_fkey"
      columns: ["shortlist_id"]
isOneToOne: false
      referencedRelation: "recruiter_shortlists"
      referencedColumns: ["id"]
    }
                  ]
                },"signing_keys": {
                  Row: {
                    "active_from": string,"algorithm": string,"created_at": string,"key_id": string,"public_key": string,"retired_at": string | null
                  }
                  Insert: {
                    "active_from"?: string,"algorithm"?: string,"created_at"?: string,"key_id": string,"public_key": string,"retired_at"?: string | null
                  }
                  Update: {
                    "active_from"?: string,"algorithm"?: string,"created_at"?: string,"key_id"?: string,"public_key"?: string,"retired_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"skill_evidence": {
                  Row: {
                    "created_at": string,"detectors": (string)[],"id": number,"lines": number,"occurred_at": string,"paths": (string)[],"repo_id": number,"sha": string,"skill_id": string,"source": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"detectors": (string)[],"id"?: never,"lines"?: number,"occurred_at": string,"paths"?: (string)[],"repo_id": number,"sha": string,"skill_id": string,"source"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"detectors"?: (string)[],"id"?: never,"lines"?: number,"occurred_at"?: string,"paths"?: (string)[],"repo_id"?: number,"sha"?: string,"skill_id"?: string,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_evidence_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skill_evidence_user_id_repo_id_sha_fkey"
      columns: ["user_id","repo_id","sha"]
isOneToOne: false
      referencedRelation: "github_commits"
      referencedColumns: ["user_id","repo_id","sha"]
    }
                  ]
                },"skills": {
                  Row: {
                    "category": Database["public"]['Enums']["skill_category"],"created_at": string,"detectors": NonNullable<Json>,"id": string,"name": string,"parent_id": string | null,"retired_at": string | null,"taxonomy_version": number,"updated_at": string
                  }
                  Insert: {
                    "category": Database["public"]['Enums']["skill_category"],"created_at"?: string,"detectors"?: NonNullable<Json>,"id": string,"name": string,"parent_id"?: string | null,"retired_at"?: string | null,"taxonomy_version": number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["skill_category"],"created_at"?: string,"detectors"?: NonNullable<Json>,"id"?: string,"name"?: string,"parent_id"?: string | null,"retired_at"?: string | null,"taxonomy_version"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skills_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"student_record_access_log": {
                  Row: {
                    "at": string,"id": number,"student_id": string,"university_id": string,"viewer_id": string | null,"viewer_name": string,"viewer_role": Database["public"]['Enums']["uni_admin_role"]
                  }
                  Insert: {
                    "at"?: string,"id"?: never,"student_id": string,"university_id": string,"viewer_id"?: string | null,"viewer_name": string,"viewer_role": Database["public"]['Enums']["uni_admin_role"]
                  }
                  Update: {
                    "at"?: string,"id"?: never,"student_id"?: string,"university_id"?: string,"viewer_id"?: string | null,"viewer_name"?: string,"viewer_role"?: Database["public"]['Enums']["uni_admin_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_record_access_log_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"charge_pending": boolean,"created_at": string,"created_by": string | null,"currency": string,"current_period_end": string,"current_period_start": string,"ended_at": string | null,"ended_reason": string | null,"gateway": string,"gateway_customer_ref": string | null,"gateway_subscription_ref": string | null,"grace_ends_at": string | null,"id": string,"live": boolean,"next_period_paid": boolean,"next_plan_id": string | null,"next_retry_at": string | null,"payment_method": string,"pending_charge": Json | null,"period_amount": number,"plan_id": string,"po_number": string | null,"renewal_invoice_id": string | null,"retry_count": number,"saved_method_ref": string | null,"simulate_fail_next": boolean,"status": Database["public"]['Enums']["subscription_status"],"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"trial_ends_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "cancel_at_period_end"?: boolean,"charge_pending"?: boolean,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"current_period_end": string,"current_period_start": string,"ended_at"?: string | null,"ended_reason"?: string | null,"gateway": string,"gateway_customer_ref"?: string | null,"gateway_subscription_ref"?: string | null,"grace_ends_at"?: string | null,"id"?: string,"live": boolean,"next_period_paid"?: boolean,"next_plan_id"?: string | null,"next_retry_at"?: string | null,"payment_method": string,"pending_charge"?: Json | null,"period_amount"?: number,"plan_id": string,"po_number"?: string | null,"renewal_invoice_id"?: string | null,"retry_count"?: number,"saved_method_ref"?: string | null,"simulate_fail_next"?: boolean,"status": Database["public"]['Enums']["subscription_status"],"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"charge_pending"?: boolean,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"current_period_end"?: string,"current_period_start"?: string,"ended_at"?: string | null,"ended_reason"?: string | null,"gateway"?: string,"gateway_customer_ref"?: string | null,"gateway_subscription_ref"?: string | null,"grace_ends_at"?: string | null,"id"?: string,"live"?: boolean,"next_period_paid"?: boolean,"next_plan_id"?: string | null,"next_retry_at"?: string | null,"payment_method"?: string,"pending_charge"?: Json | null,"period_amount"?: number,"plan_id"?: string,"po_number"?: string | null,"renewal_invoice_id"?: string | null,"retry_count"?: number,"saved_method_ref"?: string | null,"simulate_fail_next"?: boolean,"status"?: Database["public"]['Enums']["subscription_status"],"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"],"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_next_plan_id_fkey"
      columns: ["next_plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_renewal_invoice_fk"
      columns: ["renewal_invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"supervisor_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": number,"venture_id": string
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: never,"venture_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: never,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supervisor_comments_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_jobs": {
                  Row: {
                    "commits_analysed": number,"created_at": string,"error": string | null,"finished_at": string | null,"id": number,"pending": number,"repos_done": number,"repos_total": number,"skills_found": number,"stage": string | null,"status": Database["public"]['Enums']["sync_status"],"trigger": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "commits_analysed"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"pending"?: number,"repos_done"?: number,"repos_total"?: number,"skills_found"?: number,"stage"?: string | null,"status"?: Database["public"]['Enums']["sync_status"],"trigger": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "commits_analysed"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"pending"?: number,"repos_done"?: number,"repos_total"?: number,"skills_found"?: number,"stage"?: string | null,"status"?: Database["public"]['Enums']["sync_status"],"trigger"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"talent_index": {
                  Row: {
                    "availability": (string)[],"checked_skills": (string)[],"city": string | null,"department": string | null,"first_indexed_at": string,"graduation_year": number | null,"last_active_at": string | null,"looking_for": (string)[],"refreshed_at": string,"remote_ok": boolean,"skills": NonNullable<Json>,"student_id": string,"tier": Database["public"]['Enums']["ranking_tier"] | null,"university_id": string
                  }
                  Insert: {
                    "availability"?: (string)[],"checked_skills"?: (string)[],"city"?: string | null,"department"?: string | null,"first_indexed_at"?: string,"graduation_year"?: number | null,"last_active_at"?: string | null,"looking_for"?: (string)[],"refreshed_at"?: string,"remote_ok"?: boolean,"skills"?: NonNullable<Json>,"student_id": string,"tier"?: Database["public"]['Enums']["ranking_tier"] | null,"university_id": string
                  }
                  Update: {
                    "availability"?: (string)[],"checked_skills"?: (string)[],"city"?: string | null,"department"?: string | null,"first_indexed_at"?: string,"graduation_year"?: number | null,"last_active_at"?: string | null,"looking_for"?: (string)[],"refreshed_at"?: string,"remote_ok"?: boolean,"skills"?: NonNullable<Json>,"student_id"?: string,"tier"?: Database["public"]['Enums']["ranking_tier"] | null,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "talent_index_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_rates": {
                  Row: {
                    "created_at": string,"effective_from": string,"entered_by": string | null,"id": string,"label": string,"province": string,"rate": number,"reason": string
                  }
                  Insert: {
                    "created_at"?: string,"effective_from": string,"entered_by"?: string | null,"id"?: string,"label": string,"province": string,"rate": number,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"effective_from"?: string,"entered_by"?: string | null,"id"?: string,"label"?: string,"province"?: string,"rate"?: number,"reason"?: string
                  }
                  Relationships: [
                    
                  ]
                },"teacher_concentration_flags": {
                  Row: {
                    "created_at": string,"given": number,"id": string,"reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["review_flag_status"],"student_id": string,"teacher_id": string,"total": number
                  }
                  Insert: {
                    "created_at"?: string,"given": number,"id"?: string,"reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"student_id": string,"teacher_id": string,"total": number
                  }
                  Update: {
                    "created_at"?: string,"given"?: number,"id"?: string,"reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"student_id"?: string,"teacher_id"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_concentration_flags_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"teacher_profiles": {
                  Row: {
                    "approval_source": string | null,"approved_at": string | null,"approved_by": string | null,"department": string,"requested_at": string,"revoked_at": string | null,"revoked_by": string | null,"status": Database["public"]['Enums']["teacher_status"],"title": string,"university_id": string,"user_id": string
                  }
                  Insert: {
                    "approval_source"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"department": string,"requested_at"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"status"?: Database["public"]['Enums']["teacher_status"],"title": string,"university_id": string,"user_id": string
                  }
                  Update: {
                    "approval_source"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"department"?: string,"requested_at"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"status"?: Database["public"]['Enums']["teacher_status"],"title"?: string,"university_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_profiles_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_settings": {
                  Row: {
                    "digest": boolean,"grading_opt_in": boolean,"grading_skills": (string)[],"updated_at": string,"user_id": string,"weekly_grading_cap": number
                  }
                  Insert: {
                    "digest"?: boolean,"grading_opt_in"?: boolean,"grading_skills"?: (string)[],"updated_at"?: string,"user_id": string,"weekly_grading_cap"?: number
                  }
                  Update: {
                    "digest"?: boolean,"grading_opt_in"?: boolean,"grading_skills"?: (string)[],"updated_at"?: string,"user_id"?: string,"weekly_grading_cap"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "teacher_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"tips_seen": {
                  Row: {
                    "seen_at": string,"tip_id": string,"user_id": string
                  }
                  Insert: {
                    "seen_at"?: string,"tip_id": string,"user_id": string
                  }
                  Update: {
                    "seen_at"?: string,"tip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tour_progress": {
                  Row: {
                    "completed_at": string | null,"skipped_at": string | null,"step": number,"tour_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"skipped_at"?: string | null,"step"?: number,"tour_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"skipped_at"?: string | null,"step"?: number,"tour_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trial_claims": {
                  Row: {
                    "claimed_at": string,"user_id": string
                  }
                  Insert: {
                    "claimed_at"?: string,"user_id": string
                  }
                  Update: {
                    "claimed_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ui_state": {
                  Row: {
                    "key": string,"updated_at": string,"user_id": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "key": string,"updated_at"?: string,"user_id": string,"value"?: NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"user_id"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"uni_stats": {
                  Row: {
                    "area": string,"computed_at": string,"data": NonNullable<Json>,"university_id": string
                  }
                  Insert: {
                    "area": string,"computed_at"?: string,"data": NonNullable<Json>,"university_id": string
                  }
                  Update: {
                    "area"?: string,"computed_at"?: string,"data"?: NonNullable<Json>,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "uni_stats_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"universities": {
                  Row: {
                    "billing_address": string | null,"billing_ntn": string | null,"city": string | null,"claimed_at": string | null,"created_at": string,"final_year_batch": number | null,"id": string,"live_at": string | null,"name": string,"owner_id": string | null,"province": string | null,"slug": string,"slug_changed_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "billing_address"?: string | null,"billing_ntn"?: string | null,"city"?: string | null,"claimed_at"?: string | null,"created_at"?: string,"final_year_batch"?: number | null,"id"?: string,"live_at"?: string | null,"name": string,"owner_id"?: string | null,"province"?: string | null,"slug": string,"slug_changed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "billing_address"?: string | null,"billing_ntn"?: string | null,"city"?: string | null,"claimed_at"?: string | null,"created_at"?: string,"final_year_batch"?: number | null,"id"?: string,"live_at"?: string | null,"name"?: string,"owner_id"?: string | null,"province"?: string | null,"slug"?: string,"slug_changed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"university_admin_invites": {
                  Row: {
                    "created_at": string,"department_id": string | null,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["uni_admin_role"],"token_hash": string,"university_id": string,"used_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"department_id"?: string | null,"email": string,"expires_at": string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role": Database["public"]['Enums']["uni_admin_role"],"token_hash": string,"university_id": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["uni_admin_role"],"token_hash"?: string,"university_id"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_admin_invites_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "university_admin_invites_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_admins": {
                  Row: {
                    "created_at": string,"department_id": string | null,"invited_by": string | null,"role": Database["public"]['Enums']["uni_admin_role"],"university_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"department_id"?: string | null,"invited_by"?: string | null,"role": Database["public"]['Enums']["uni_admin_role"],"university_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string | null,"invited_by"?: string | null,"role"?: Database["public"]['Enums']["uni_admin_role"],"university_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_admins_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "university_admins_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"detail": NonNullable<Json>,"id": number,"target_id": string | null,"target_type": string,"university_id": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"target_id"?: string | null,"target_type": string,"university_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"target_id"?: string | null,"target_type"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_audit_log_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_badges": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"icon": string,"id": string,"name": string,"university_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"icon"?: string,"id"?: string,"name": string,"university_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"icon"?: string,"id"?: string,"name"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_badges_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_claims": {
                  Row: {
                    "created_at": string,"id": string,"letter_bytes": number,"letter_deleted_at": string | null,"letter_path": string,"note": string | null,"requester_id": string,"review_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["uni_request_status"],"title": string,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"letter_bytes": number,"letter_deleted_at"?: string | null,"letter_path": string,"note"?: string | null,"requester_id": string,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["uni_request_status"],"title": string,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"letter_bytes"?: number,"letter_deleted_at"?: string | null,"letter_path"?: string,"note"?: string | null,"requester_id"?: string,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["uni_request_status"],"title"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_claims_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_domain_requests": {
                  Row: {
                    "created_at": string,"domain": string,"id": string,"kind": Database["public"]['Enums']["domain_kind"],"reason": string,"requested_by": string | null,"review_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["uni_request_status"],"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"domain": string,"id"?: string,"kind"?: Database["public"]['Enums']["domain_kind"],"reason": string,"requested_by"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["uni_request_status"],"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["domain_kind"],"reason"?: string,"requested_by"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["uni_request_status"],"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_domain_requests_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_domains": {
                  Row: {
                    "created_at": string,"domain": string,"kind": Database["public"]['Enums']["domain_kind"],"source": string,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"domain": string,"kind"?: Database["public"]['Enums']["domain_kind"],"source"?: string,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string,"kind"?: Database["public"]['Enums']["domain_kind"],"source"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_domains_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_hides": {
                  Row: {
                    "author_id": string | null,"case_id": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"hidden_by": string | null,"id": string,"reason": string,"status": Database["public"]['Enums']["uni_hide_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"],"university_id": string
                  }
                  Insert: {
                    "author_id"?: string | null,"case_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"hidden_by"?: string | null,"id"?: string,"reason": string,"status"?: Database["public"]['Enums']["uni_hide_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"],"university_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"case_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"hidden_by"?: string | null,"id"?: string,"reason"?: string,"status"?: Database["public"]['Enums']["uni_hide_status"],"target_id"?: string,"target_type"?: Database["public"]['Enums']["report_target"],"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_hides_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "report_cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "university_hides_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_question_answers": {
                  Row: {
                    "answered_at": string,"option_index": number,"question_id": string,"user_id": string
                  }
                  Insert: {
                    "answered_at"?: string,"option_index": number,"question_id": string,"user_id": string
                  }
                  Update: {
                    "answered_at"?: string,"option_index"?: number,"question_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_question_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "university_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"university_questions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"options": NonNullable<Json>,"prompt": string,"removed_at": string | null,"removed_by": string | null,"removed_by_staff": boolean,"removed_reason": string | null,"university_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"options": NonNullable<Json>,"prompt": string,"removed_at"?: string | null,"removed_by"?: string | null,"removed_by_staff"?: boolean,"removed_reason"?: string | null,"university_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"options"?: NonNullable<Json>,"prompt"?: string,"removed_at"?: string | null,"removed_by"?: string | null,"removed_by_staff"?: boolean,"removed_reason"?: string | null,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_questions_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_requests": {
                  Row: {
                    "confirmed_at": string | null,"consent": boolean,"created_at": string,"domain": string,"email": string,"id": string,"notified_at": string | null,"token_hash": string,"university_id": string | null,"university_name": string | null,"unsubscribed_at": string | null
                  }
                  Insert: {
                    "confirmed_at"?: string | null,"consent": boolean,"created_at"?: string,"domain": string,"email": string,"id"?: string,"notified_at"?: string | null,"token_hash": string,"university_id"?: string | null,"university_name"?: string | null,"unsubscribed_at"?: string | null
                  }
                  Update: {
                    "confirmed_at"?: string | null,"consent"?: boolean,"created_at"?: string,"domain"?: string,"email"?: string,"id"?: string,"notified_at"?: string | null,"token_hash"?: string,"university_id"?: string | null,"university_name"?: string | null,"unsubscribed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_requests_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"university_slug_history": {
                  Row: {
                    "released_at": string,"slug": string,"university_id": string
                  }
                  Insert: {
                    "released_at"?: string,"slug": string,"university_id": string
                  }
                  Update: {
                    "released_at"?: string,"slug"?: string,"university_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "university_slug_history_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_counters": {
                  Row: {
                    "key": string,"period_start": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"used": number
                  }
                  Insert: {
                    "key": string,"period_start": string,"subject_id": string,"subject_type": Database["public"]['Enums']["billing_subject"],"used"?: number
                  }
                  Update: {
                    "key"?: string,"period_start"?: string,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["billing_subject"],"used"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_counters_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "entitlement_keys"
      referencedColumns: ["key"]
    }
                  ]
                },"user_devices": {
                  Row: {
                    "device_hash": string,"first_seen_at": string,"last_seen_at": string,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "device_hash": string,"first_seen_at"?: string,"last_seen_at"?: string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "device_hash"?: string,"first_seen_at"?: string,"last_seen_at"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_mutes": {
                  Row: {
                    "created_at": string,"muted_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"muted_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"muted_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_skills": {
                  Row: {
                    "active_days": number,"ai_assisted": boolean,"ai_lines": number,"hits": number,"last_used_at": string | null,"level": number,"lines": number,"peer_verified": boolean,"repos": number,"skill_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "active_days"?: number,"ai_assisted"?: boolean,"ai_lines"?: number,"hits"?: number,"last_used_at"?: string | null,"level": number,"lines"?: number,"peer_verified"?: boolean,"repos"?: number,"skill_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_days"?: number,"ai_assisted"?: boolean,"ai_lines"?: number,"hits"?: number,"last_used_at"?: string | null,"level"?: number,"lines"?: number,"peer_verified"?: boolean,"repos"?: number,"skill_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_skills_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_completion_members": {
                  Row: {
                    "github_days": number,"unconfirmed_entries": number,"user_id": string,"venture_id": string,"verified_entries": number
                  }
                  Insert: {
                    "github_days"?: number,"unconfirmed_entries"?: number,"user_id": string,"venture_id": string,"verified_entries"?: number
                  }
                  Update: {
                    "github_days"?: number,"unconfirmed_entries"?: number,"user_id"?: string,"venture_id"?: string,"verified_entries"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_completion_members_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "venture_completions"
      referencedColumns: ["venture_id"]
    }
                  ]
                },"venture_completions": {
                  Row: {
                    "backfilled": boolean,"completed_at": string,"created_at": string,"deliverables": number,"owner_id": string | null,"skill_tags": number,"team_size": number,"venture_id": string,"verified_members": number,"weeks": number
                  }
                  Insert: {
                    "backfilled"?: boolean,"completed_at": string,"created_at"?: string,"deliverables": number,"owner_id"?: string | null,"skill_tags": number,"team_size": number,"venture_id": string,"verified_members": number,"weeks": number
                  }
                  Update: {
                    "backfilled"?: boolean,"completed_at"?: string,"created_at"?: string,"deliverables"?: number,"owner_id"?: string | null,"skill_tags"?: number,"team_size"?: number,"venture_id"?: string,"verified_members"?: number,"weeks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_completions_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: true
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_deliverables": {
                  Row: {
                    "added_by": string | null,"created_at": string,"id": string,"label": string,"url": string,"venture_id": string
                  }
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: string,"label": string,"url": string,"venture_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: string,"label"?: string,"url"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_deliverables_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_follows": {
                  Row: {
                    "created_at": string,"user_id": string,"venture_id": string
                  }
                  Insert: {
                    "created_at"?: string,"user_id": string,"venture_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_follows_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_invites": {
                  Row: {
                    "created_at": string,"id": string,"invitee_id": string,"inviter_id": string,"responded_at": string | null,"status": Database["public"]['Enums']["venture_invite_status"],"venture_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"invitee_id": string,"inviter_id": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["venture_invite_status"],"venture_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invitee_id"?: string,"inviter_id"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["venture_invite_status"],"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_invites_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_members": {
                  Row: {
                    "joined_at": string,"team_role": Database["public"]['Enums']["venture_team_role"],"user_id": string,"venture_id": string
                  }
                  Insert: {
                    "joined_at"?: string,"team_role"?: Database["public"]['Enums']["venture_team_role"],"user_id": string,"venture_id": string
                  }
                  Update: {
                    "joined_at"?: string,"team_role"?: Database["public"]['Enums']["venture_team_role"],"user_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_members_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_questions": {
                  Row: {
                    "body": string,"position": number,"venture_id": string
                  }
                  Insert: {
                    "body": string,"position": number,"venture_id": string
                  }
                  Update: {
                    "body"?: string,"position"?: number,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_questions_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_reviews": {
                  Row: {
                    "average": number,"comments": string | null,"created_at": string,"id": string,"request_id": string,"rubric": NonNullable<Json>,"teacher_id": string,"venture_id": string
                  }
                  Insert: {
                    "average": number,"comments"?: string | null,"created_at"?: string,"id"?: string,"request_id": string,"rubric": NonNullable<Json>,"teacher_id": string,"venture_id": string
                  }
                  Update: {
                    "average"?: number,"comments"?: string | null,"created_at"?: string,"id"?: string,"request_id"?: string,"rubric"?: NonNullable<Json>,"teacher_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_reviews_request_id_fkey"
      columns: ["request_id"]
isOneToOne: true
      referencedRelation: "review_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venture_reviews_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "venture_reviews_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_roles": {
                  Row: {
                    "created_at": string,"filled": number,"id": string,"skill_ids": (string)[],"slots": number,"title": string,"venture_id": string
                  }
                  Insert: {
                    "created_at"?: string,"filled"?: number,"id"?: string,"skill_ids"?: (string)[],"slots"?: number,"title": string,"venture_id": string
                  }
                  Update: {
                    "created_at"?: string,"filled"?: number,"id"?: string,"skill_ids"?: (string)[],"slots"?: number,"title"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_roles_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_supervisors": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"id": string,"invited_by": string | null,"started_at": string | null,"status": Database["public"]['Enums']["supervisor_status"],"teacher_id": string,"venture_id": string
                  }
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"id"?: string,"invited_by"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["supervisor_status"],"teacher_id": string,"venture_id": string
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"id"?: string,"invited_by"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["supervisor_status"],"teacher_id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_supervisors_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "venture_supervisors_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_update_media": {
                  Row: {
                    "height": number,"path": string,"position": number,"update_id": string,"width": number
                  }
                  Insert: {
                    "height": number,"path": string,"position": number,"update_id": string,"width": number
                  }
                  Update: {
                    "height"?: number,"path"?: string,"position"?: number,"update_id"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_update_media_update_id_fkey"
      columns: ["update_id"]
isOneToOne: false
      referencedRelation: "venture_updates"
      referencedColumns: ["id"]
    }
                  ]
                },"venture_updates": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"venture_id": string
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"venture_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"venture_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venture_updates_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                },"ventures": {
                  Row: {
                    "abandoned_at": string | null,"affiliation": string | null,"completed_at": string | null,"created_at": string,"description": string,"id": string,"idea_id": string | null,"owner_id": string,"pitch_url": string | null,"repo_full_name": string | null,"repo_id": number | null,"search": unknown,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"] | null,"status": Database["public"]['Enums']["venture_status"],"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"updated_at": string,"visibility": Database["public"]['Enums']["venture_visibility"]
                  }
                  Insert: {
                    "abandoned_at"?: string | null,"affiliation"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description": string,"id"?: string,"idea_id"?: string | null,"owner_id": string,"pitch_url"?: string | null,"repo_full_name"?: string | null,"repo_id"?: number | null,"search"?: never,"skill_ids"?: (string)[],"stage"?: Database["public"]['Enums']["venture_stage"] | null,"status"?: Database["public"]['Enums']["venture_status"],"team_size"?: number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["venture_visibility"]
                  }
                  Update: {
                    "abandoned_at"?: string | null,"affiliation"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"idea_id"?: string | null,"owner_id"?: string,"pitch_url"?: string | null,"repo_full_name"?: string | null,"repo_id"?: number | null,"search"?: never,"skill_ids"?: (string)[],"stage"?: Database["public"]['Enums']["venture_stage"] | null,"status"?: Database["public"]['Enums']["venture_status"],"team_size"?: number,"title"?: string,"type"?: Database["public"]['Enums']["venture_type"],"university_id"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["venture_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ventures_idea_id_fkey"
      columns: ["idea_id"]
isOneToOne: false
      referencedRelation: "project_ideas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventures_university_id_fkey"
      columns: ["university_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "contributions_with_status": {
                  Row: {
                    "ai_agent": string | null,"before_venture": boolean | null,"by_member": boolean | null,"commit_sha": string | null,"confirmations": number | null,"confirmed_by_me": boolean | null,"corrected_at": string | null,"created_at": string | null,"current_id": string | null,"description": string | null,"evidence_url": string | null,"faculty_confirmed": boolean | null,"hours": number | null,"id": string | null,"kind": Database["public"]['Enums']["contribution_kind"] | null,"peer_verified": boolean | null,"skill_ids": (string)[] | null,"source": Database["public"]['Enums']["contribution_source"] | null,"user_id": string | null,"venture_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contributions_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_fair_invite":
{ Args: { "p_token_hash": string }; Returns: string
                           },
"accept_org_invite":
{ Args: { "p_id": string }; Returns: string
                           },
"accept_uni_invite":
{ Args: { "p_id": string }; Returns: string
                           },
"add_application_message":
{ Args: { "p_body": string,"p_thread": string }; Returns: number
                           },
"add_booth_slots":
{ Args: { "p_booth": string,"p_count": number,"p_minutes": number,"p_starts": string }; Returns: number
                           },
"add_comment":
{ Args: { "p_body": string,"p_parent": string,"p_post": string }; Returns: string
                           },
"add_exam_period":
{ Args: { "p_ends": string,"p_reason": string,"p_starts": string,"p_university": string }; Returns: string
                           },
"add_note":
{ Args: { "p_body": string,"p_student": string }; Returns: string
                           },
"add_to_shortlist":
{ Args: { "p_list": string,"p_student": string }; Returns: string
                           },
"add_venture_deliverable":
{ Args: { "p_label": string,"p_url": string,"p_venture": string }; Returns: string
                           },
"answer_fair_call":
{ Args: { "p_queue": string }; Returns: string
                           },
"answer_hire_outcome":
{ Args: { "p_answer": string,"p_hire": string }; Returns: undefined
                           },
"answer_survey":
{ Args: { "p_answer": boolean,"p_latency_ms": number,"p_post": string }; Returns: undefined
                           },
"answer_uni_question":
{ Args: { "p_option": number,"p_question": string }; Returns: undefined
                           },
"api_candidate":
{ Args: { "p_candidate": string,"p_token": string }; Returns: Json
                           },
"api_job_applications":
{ Args: { "p_job": string,"p_token": string }; Returns: Json
                           },
"api_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"api_shortlist_candidates":
{ Args: { "p_list": string,"p_token": string }; Returns: Json
                           },
"api_shortlists":
{ Args: { "p_token": string }; Returns: Json
                           },
"application_get":
{ Args: { "p_id": string }; Returns: Json
                           },
"application_people":
{ Args: { "p_ids": (string)[] }; Returns: {
              "full_name": string,"user_id": string,"username": string
            }[]
                           },
"apply_to_job":
{ Args: { "p_job": string,"p_note"?: string }; Returns: string
                           },
"apply_to_venture":
{ Args: { "p_answers"?: (string)[],"p_message": string,"p_role"?: string,"p_venture": string }; Returns: string
                           },
"approve_teacher":
{ Args: { "p_user": string }; Returns: undefined
                           },
"archive_badge":
{ Args: { "p_id": string }; Returns: undefined
                           },
"award_badge":
{ Args: { "p_badge": string,"p_note": string,"p_student": string }; Returns: string
                           },
"awards_for":
{ Args: { "p_user": string }; Returns: Json
                           },
"billing_overview":
{ Args: { "p_subject": string }; Returns: Json
                           },
"block_company":
{ Args: { "p_org": string }; Returns: undefined
                           },
"block_user":
{ Args: { "p_username": string }; Returns: undefined
                           },
"book_fair_slot":
{ Args: { "p_slot": string }; Returns: undefined
                           },
"booth_queue":
{ Args: { "p_booth": string }; Returns: Json
                           },
"browse_ventures":
{ Args: { "p_before"?: string,"p_limit"?: number,"p_my_university"?: boolean,"p_open_roles"?: boolean,"p_status"?: Database["public"]['Enums']["venture_status"],"p_type": Database["public"]['Enums']["venture_type"] }; Returns: {
              "created_at": string,"id": string,"members": number,"open_slots": number,"owner_name": string,"owner_username": string,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"],"status": Database["public"]['Enums']["venture_status"],"summary": string,"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_name": string,"visibility": Database["public"]['Enums']["venture_visibility"]
            }[]
                           },
"bulk_move_applications":
{ Args: { "p_ids": (string)[],"p_reason"?: string,"p_stage": Database["public"]['Enums']["application_stage"] }; Returns: number
                           },
"cancel_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"cancel_checkout":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_event":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_friend_request":
{ Args: { "p_request": string }; Returns: undefined
                           },
"cancel_rsvp":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_subscription":
{ Args: { "p_resume"?: boolean,"p_subject": string }; Returns: undefined
                           },
"check_in_event":
{ Args: { "p_id": string,"p_token": string }; Returns: string
                           },
"checkout_session":
{ Args: { "p_id": string }; Returns: Json
                           },
"choose_seats":
{ Args: { "p_keep": (string)[] }; Returns: undefined
                           },
"claim_appeal":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"claim_case":
{ Args: { "p_case": string,"p_claim": boolean }; Returns: undefined
                           },
"claim_code_check":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"claim_credential":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"claim_feedback":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"claim_ranking_flag":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"claim_review_flag":
{ Args: { "p_claim": boolean,"p_flag": number }; Returns: undefined
                           },
"close_contact_chat":
{ Args: { "p_id": string }; Returns: undefined
                           },
"close_job":
{ Args: { "p_id": string }; Returns: undefined
                           },
"close_review_request":
{ Args: { "p_request": string }; Returns: undefined
                           },
"code_check_case":
{ Args: { "p_id": string }; Returns: {
              "answers": Json,"category": Database["public"]['Enums']["skill_category"],"claimed_by_me": boolean,"claimed_by_name": string,"conflict": boolean,"end_line": number,"feedback": string,"id": string,"overdue": boolean,"path": string,"prompt": string,"rubric": Json,"skill_name": string,"start_line": number,"status": Database["public"]['Enums']["code_check_status"],"student_name": string,"submitted_at": string
            }[]
                           },
"code_check_queue":
{ Args: { "p_status"?: string }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"conflict": boolean,"graded_at": string,"id": string,"overdue": boolean,"skill_name": string,"status": Database["public"]['Enums']["code_check_status"],"student_name": string,"submitted_at": string
            }[]
                           },
"code_check_state":
{ Args: { "p_skill": string }; Returns: {
              "blocker": string,"check_id": string,"status": Database["public"]['Enums']["code_check_status"]
            }[]
                           },
"company_page":
{ Args: { "p_slug": string }; Returns: Json
                           },
"competition_manage":
{ Args: { "p_id": string }; Returns: Json
                           },
"competition_public":
{ Args: { "p_id": string }; Returns: Json
                           },
"competitions_for_org":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"complete_onboarding":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"confirm_contribution":
{ Args: { "p_entry": string }; Returns: boolean
                           },
"confirm_university_request":
{ Args: { "p_token": string }; Returns: Json
                           },
"correct_contribution":
{ Args: { "p_description": string,"p_evidence_url"?: string,"p_hours"?: number,"p_kind": Database["public"]['Enums']["contribution_kind"],"p_original": string,"p_skill_ids"?: (string)[] }; Returns: string
                           },
"create_add_on_checkout":
{ Args: { "p_currency": string,"p_gateway": string,"p_job": string,"p_key": string,"p_kind": string,"p_quantity": number }; Returns: Json
                           },
"create_api_token":
{ Args: { "p_name": string,"p_token_hash": string }; Returns: string
                           },
"create_checkout":
{ Args: { "p_currency": string,"p_gateway": string,"p_key": string,"p_plan": string,"p_subject": string }; Returns: Json
                           },
"create_invoice_checkout":
{ Args: { "p_gateway": string,"p_invoice": string,"p_key": string,"p_subject": string }; Returns: Json
                           },
"create_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"create_organization":
{ Args: { "p": Json }; Returns: string
                           },
"create_post":
{ Args: { "p": Json }; Returns: string
                           },
"create_share_link":
{ Args: { "p_days": number,"p_label": string,"p_token_hash": string }; Returns: string
                           },
"create_shortlist":
{ Args: { "p_name": string }; Returns: string
                           },
"create_team":
{ Args: { "p_competition": string,"p_name": string }; Returns: string
                           },
"create_venture":
{ Args: { "p": Json }; Returns: string
                           },
"create_webhook":
{ Args: { "p_events": (string)[],"p_url": string }; Returns: Json
                           },
"credential_case":
{ Args: { "p_id": string }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"created_at": string,"expires_on": string,"file_bytes": number,"file_deleted": boolean,"file_path": string,"file_type": string,"id": string,"issued_on": string,"issuer": string,"recognised_issuer_id": string,"review_reason": string,"reviewed_at": string,"reviewer_name": string,"status": Database["public"]['Enums']["credential_status"],"student_name": string,"student_username": string,"suggested_issuer": string,"title": string,"university_name": string,"user_id": string,"verify_url": string
            }[]
                           },
"credential_queue":
{ Args: { "p_status"?: string }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"created_at": string,"file_type": string,"id": string,"issuer": string,"reviewed_at": string,"status": Database["public"]['Enums']["credential_status"],"student_name": string,"student_username": string,"suggested_issuer": string,"title": string,"university_name": string
            }[]
                           },
"credentials_for":
{ Args: { "p_user": string }; Returns: {
              "expires_on": string,"id": string,"issued_on": string,"issuer": string,"recognised": boolean,"title": string,"verify_url": string
            }[]
                           },
"cv_export_rights":
{ Args: Record<PropertyKey, never>; Returns: {
              "pdf_export": boolean,"refresh_on_demand": boolean,"templates": boolean
            }[]
                           },
"decide_appeal":
{ Args: { "p_id": string,"p_outcome": string,"p_reason": string }; Returns: undefined
                           },
"decide_application":
{ Args: { "p_accept": boolean,"p_thread": string }; Returns: Database["public"]['Enums']["application_status"]
                           },
"decide_final_year_batch":
{ Args: { "p_approve": boolean,"p_id": string,"p_reason": string }; Returns: undefined
                           },
"decide_org":
{ Args: { "p_action": string,"p_org": string,"p_reason": string }; Returns: undefined
                           },
"decide_uni_claim":
{ Args: { "p_approve": boolean,"p_id": string,"p_reason": string }; Returns: undefined
                           },
"decide_uni_domain":
{ Args: { "p_approve": boolean,"p_id": string,"p_reason": string }; Returns: undefined
                           },
"delete_comment":
{ Args: { "p_comment": string }; Returns: undefined
                           },
"delete_credential":
{ Args: { "p_id": string }; Returns: boolean
                           },
"delete_department":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_ecosphere_page":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_message":
{ Args: { "p_message": string }; Returns: string
                           },
"delete_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"delete_note":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_post":
{ Args: { "p_post": string }; Returns: (string)[]
                           },
"delete_programme":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_saved_search":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_shortlist":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_venture_role":
{ Args: { "p_role": string,"p_venture": string }; Returns: undefined
                           },
"delete_venture_update":
{ Args: { "p_update": string }; Returns: boolean
                           },
"delete_webhook":
{ Args: { "p_id": string }; Returns: undefined
                           },
"department_options":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"disconnect_github":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"dispute_hire_fee":
{ Args: { "p_id": string,"p_kind": string,"p_reason": string }; Returns: undefined
                           },
"dm_receipt":
{ Args: { "p_thread": string }; Returns: string
                           },
"ecosphere_home":
{ Args: { "p_slug": string }; Returns: Json
                           },
"ecosphere_page":
{ Args: { "p_page": string,"p_slug": string }; Returns: Json
                           },
"edit_message":
{ Args: { "p_body": string,"p_message": string }; Returns: undefined
                           },
"edit_post":
{ Args: { "p_body": string,"p_post": string }; Returns: undefined
                           },
"end_supervision":
{ Args: { "p_venture": string }; Returns: undefined
                           },
"endorse":
{ Args: { "p_endorsee": string,"p_items": Json,"p_note"?: string,"p_venture": string }; Returns: number
                           },
"endorse_options":
{ Args: { "p_venture": string }; Returns: {
              "avatar_path": string,"evidence": Json,"full_name": string,"given": (string)[],"month_left": number,"skills": Json,"user_id": string,"username": string
            }[]
                           },
"endorsements_for":
{ Args: { "p_user": string }; Returns: {
              "created_at": string,"endorser_avatar_path": string,"endorser_id": string,"endorser_kind": string,"endorser_name": string,"endorser_username": string,"former_faculty": boolean,"has_evidence": boolean,"hidden": boolean,"id": string,"note": string,"skill_id": string,"skill_name": string,"venture_id": string,"venture_title": string
            }[]
                           },
"event_checkin_code":
{ Args: { "p_id": string }; Returns: Json
                           },
"event_detail":
{ Args: { "p_id": string }; Returns: Json
                           },
"events_list":
{ Args: { "p_when"?: string }; Returns: Json
                           },
"exam_period_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"created_by_name": string,"ends_on": string,"id": string,"reason": string,"starts_on": string,"university_id": string,"university_name": string
            }[]
                           },
"fair_call_next":
{ Args: { "p_booth": string }; Returns: string
                           },
"fair_invite_preview":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"fair_mark":
{ Args: { "p_id": string,"p_kind": string }; Returns: undefined
                           },
"fair_view":
{ Args: { "p_fair": string }; Returns: Json
                           },
"feed_page":
{ Args: { "p_audience": Database["public"]['Enums']["post_audience"],"p_cursor"?: string,"p_filter"?: string,"p_limit"?: number }; Returns: {
              "next_cursor": string,"post_id": string,"rank": number
            }[]
                           },
"feedback_case":
{ Args: { "p_id": string }; Returns: {
              "app_version": string,"body": string,"claimed_by_me": boolean,"claimed_by_name": string,"created_at": string,"device": string,"id": string,"page": string,"screenshot_path": string,"staff_reply": string,"status": Database["public"]['Enums']["feedback_status"],"student_name": string,"student_username": string,"type": Database["public"]['Enums']["feedback_type"]
            }[]
                           },
"feedback_queue":
{ Args: { "p_open"?: boolean }; Returns: {
              "body": string,"claimed_by_me": boolean,"claimed_by_name": string,"created_at": string,"id": string,"status": Database["public"]['Enums']["feedback_status"],"student_name": string,"student_username": string,"type": Database["public"]['Enums']["feedback_type"]
            }[]
                           },
"finish_competition":
{ Args: { "p_id": string }; Returns: undefined
                           },
"finish_hackathon":
{ Args: { "p_id": string }; Returns: undefined
                           },
"follow_venture":
{ Args: { "p_follow": boolean,"p_venture": string }; Returns: boolean
                           },
"followed_venture_updates":
{ Args: { "p_limit"?: number }; Returns: {
              "author_name": string,"author_username": string,"body": string,"created_at": string,"id": string,"images": Json,"venture_id": string,"venture_title": string
            }[]
                           },
"friendship_state":
{ Args: { "p_username": string }; Returns: {
              "request_id": string,"state": string
            }[]
                           },
"get_or_create_dm":
{ Args: { "p_username": string }; Returns: string
                           },
"get_profile_card":
{ Args: { "p_username": string }; Returns: {
              "department": string,"full_name": string,"graduation_year": number,"user_id": string,"username": string
            }[]
                           },
"getting_started":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"grade_code_check":
{ Args: { "p_feedback": string,"p_id": string,"p_rubric": Json }; Returns: boolean
                           },
"grant_staff_role":
{ Args: { "p_email": string,"p_reason": string,"p_role": Database["public"]['Enums']["staff_role"] }; Returns: string
                           },
"health_check":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"hide_endorsement":
{ Args: { "p_hidden"?: boolean,"p_id": string }; Returns: boolean
                           },
"hide_post":
{ Args: { "p_hide": boolean,"p_post": string }; Returns: undefined
                           },
"hires_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"idea_get":
{ Args: { "p_id": string }; Returns: Json
                           },
"ideas_list":
{ Args: { "p_difficulty"?: string,"p_limit"?: number,"p_mine"?: boolean,"p_skill"?: string }; Returns: Json
                           },
"import_faculty_csv":
{ Args: { "p_rows": Json,"p_university": string }; Returns: number
                           },
"invite_fair_company":
{ Args: { "p_email": string,"p_fair": string,"p_token_hash": string }; Returns: string
                           },
"invite_org_member":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["org_role"],"p_token_hash": string }; Returns: string
                           },
"invite_supervisor":
{ Args: { "p_teacher": string,"p_venture": string }; Returns: undefined
                           },
"invite_team_member":
{ Args: { "p_team": string,"p_username": string }; Returns: undefined
                           },
"invite_to_apply":
{ Args: { "p_job": string,"p_students": (string)[] }; Returns: number
                           },
"invite_to_venture":
{ Args: { "p_username": string,"p_venture": string }; Returns: string
                           },
"invite_uni_admin":
{ Args: { "p_department": string,"p_email": string,"p_role": Database["public"]['Enums']["uni_admin_role"],"p_token_hash": string }; Returns: string
                           },
"invoice_document":
{ Args: { "p_id": string }; Returns: Json
                           },
"is_staff":
{ Args: { "p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"job_applicants":
{ Args: { "p_job": string }; Returns: Json
                           },
"job_get":
{ Args: { "p_id": string }; Returns: Json
                           },
"job_public":
{ Args: { "p_id": string }; Returns: Json
                           },
"job_run_finish":
{ Args: { "p_error"?: string,"p_id": string,"p_rows"?: number,"p_status": Database["public"]['Enums']["job_run_status"] }; Returns: undefined
                           },
"job_run_start":
{ Args: { "p_job": string,"p_meta"?: Json }; Returns: string
                           },
"jobs_for_org":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"join_fair_queue":
{ Args: { "p_booth": string }; Returns: number
                           },
"judge_hackathon":
{ Args: { "p_id": string }; Returns: Json
                           },
"judge_score_team":
{ Args: { "p_feedback"?: string,"p_scores": Json,"p_team": string }; Returns: undefined
                           },
"landing_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"leaderboard":
{ Args: { "p_after"?: number,"p_batch"?: number,"p_department"?: string,"p_scope"?: string }; Returns: {
              "avatar_path": string,"full_name": string,"is_me": boolean,"place": number,"rank": number,"tier": Database["public"]['Enums']["ranking_tier"],"university_name": string,"username": string,"weekly_change": number
            }[]
                           },
"leaderboard_filters":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"leaderboard_me":
{ Args: { "p_batch"?: number,"p_department"?: string,"p_scope"?: string }; Returns: Json
                           },
"leave_fair_booth":
{ Args: { "p_booth": string }; Returns: undefined
                           },
"leave_venture":
{ Args: { "p_venture": string }; Returns: undefined
                           },
"lift_sanction":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"link_venture_repo":
{ Args: { "p_repo"?: number,"p_venture": string }; Returns: undefined
                           },
"list_posts":
{ Args: { "p_author"?: string,"p_before"?: string,"p_before_id"?: string,"p_filter"?: string,"p_limit"?: number,"p_scope": string }; Returns: {
              "created_at": string,"id": string
            }[]
                           },
"log_contribution":
{ Args: { "p_description": string,"p_evidence_url"?: string,"p_hours"?: number,"p_kind": Database["public"]['Enums']["contribution_kind"],"p_skill_ids"?: (string)[],"p_venture": string }; Returns: string
                           },
"log_security_event":
{ Args: { "p_ip_hash": string,"p_kind": string,"p_user_agent": string }; Returns: undefined
                           },
"mark_all_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_notification_read":
{ Args: { "p_id": string }; Returns: undefined
                           },
"mark_thread_read":
{ Args: { "p_thread": string }; Returns: undefined
                           },
"may_use_simulated":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mfa_backup_codes_remaining":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"move_application":
{ Args: { "p_id": string,"p_reason"?: string,"p_stage": Database["public"]['Enums']["application_stage"] }; Returns: undefined
                           },
"mute_thread":
{ Args: { "p_hours": number,"p_thread": string }; Returns: undefined
                           },
"mute_user":
{ Args: { "p_mute": boolean,"p_username": string }; Returns: undefined
                           },
"my_appealable":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_appeals":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_blocked_companies":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_blocks":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"full_name": string,"username": string
            }[]
                           },
"my_chat_settings":
{ Args: Record<PropertyKey, never>; Returns: {
              "read_receipts": boolean
            }[]
                           },
"my_code_check":
{ Args: { "p_id": string }; Returns: {
              "answers": Json,"category": Database["public"]['Enums']["skill_category"],"deadline_at": string,"end_line": number,"feedback": string,"graded_at": string,"id": string,"path": string,"prompt": string,"requested_at": string,"rubric": Json,"skill_id": string,"skill_name": string,"snippet_served": boolean,"start_line": number,"started_at": string,"status": Database["public"]['Enums']["code_check_status"],"submitted_at": string,"unavailable_reason": string
            }[]
                           },
"my_contact_requests":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_ecosphere":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_entitlements":
{ Args: { "p_subject"?: string }; Returns: Json
                           },
"my_fair_booths":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_feedback":
{ Args: Record<PropertyKey, never>; Returns: {
              "body": string,"created_at": string,"has_screenshot": boolean,"id": string,"replied_at": string,"staff_reply": string,"status": Database["public"]['Enums']["feedback_status"],"type": Database["public"]['Enums']["feedback_type"]
            }[]
                           },
"my_friend_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_path": string,"created_at": string,"department": string,"direction": string,"full_name": string,"graduation_year": number,"id": string,"user_id": string,"username": string
            }[]
                           },
"my_friends":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_path": string,"department": string,"full_name": string,"graduation_year": number,"since": string,"user_id": string,"username": string
            }[]
                           },
"my_gate_state":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_judging":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_moderation_notice":
{ Args: { "p_case": string }; Returns: {
              "action": string,"excerpt": string,"reason": string,"status": Database["public"]['Enums']["report_case_status"],"target_type": Database["public"]['Enums']["report_target"]
            }[]
                           },
"my_mutes":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"full_name": string,"username": string
            }[]
                           },
"my_notification_settings":
{ Args: Record<PropertyKey, never>; Returns: {
              "allow_instant": boolean,"category": string,"channel": Database["public"]['Enums']["email_channel"],"description": string,"label": string
            }[]
                           },
"my_notifications":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: {
              "actor_avatar_path": string,"actor_name": string,"actor_username": string,"category": string,"created_at": string,"data": Json,"entity_id": string,"entity_type": string,"id": string,"read_at": string,"type": string
            }[]
                           },
"my_org":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_org_document":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_org_invites":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_profile_viewers":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_record_viewers":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_recruiter_prefs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_restriction":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_score":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_skill_proofs":
{ Args: { "p_skill": string }; Returns: {
              "detail": string,"kind": string,"level": number,"occurred_at": string,"title": string,"url": string,"venture_id": string
            }[]
                           },
"my_skills":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_days": number,"ai_assisted": boolean,"ai_lines": number,"hits": number,"last_used_at": string,"level": number,"lines": number,"repos": number,"skill_id": string
            }[]
                           },
"my_threads":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_path": string,"id": string,"last_message": string,"last_message_at": string,"last_sender_is_me": boolean,"muted": boolean,"title": string,"type": Database["public"]['Enums']["chat_thread_type"],"unread": number,"username": string,"venture_id": string
            }[]
                           },
"my_uni":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_uni_announcements":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"my_uni_claim":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_uni_invites":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_uni_questions":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"nav_badges":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"next_best_action":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"notes_for":
{ Args: { "p_student": string }; Returns: Json
                           },
"open_shared_cv":
{ Args: { "p_token_hash": string,"p_viewer_key": string }; Returns: {
              "code": string,"expires_at": string,"issued_at": string,"key_id": string,"signature": string,"snapshot": Json,"snapshot_hash": string,"state": string,"username": string
            }[]
                           },
"opportunities":
{ Args: { "p_after"?: number,"p_tab": string }; Returns: {
              "detail": string,"href": string,"id": string,"kind": string,"org_name": string,"sponsored": boolean,"starts_at": string,"title": string
            }[]
                           },
"ops_add_uni_domain":
{ Args: { "p_domain": string,"p_kind": string,"p_reason": string,"p_university": string }; Returns: undefined
                           },
"ops_appeal_case":
{ Args: { "p_id": string }; Returns: Json
                           },
"ops_appeals":
{ Args: { "p_open"?: boolean }; Returns: Json
                           },
"ops_assign_uni_owner":
{ Args: { "p_email": string,"p_reason": string,"p_university": string }; Returns: string
                           },
"ops_audit_export":
{ Args: { "p_action"?: string,"p_from"?: string,"p_reason": string,"p_staff"?: string,"p_target_type"?: string,"p_to"?: string }; Returns: Json
                           },
"ops_audit_filters":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_audit_search":
{ Args: { "p_action"?: string,"p_before"?: string,"p_from"?: string,"p_limit"?: number,"p_staff"?: string,"p_target_id"?: string,"p_target_type"?: string,"p_to"?: string }; Returns: Json
                           },
"ops_batches":
{ Args: Record<PropertyKey, never>; Returns: {
              "final_year_batch": number,"graduates": number,"name": string,"students": number,"university_id": string
            }[]
                           },
"ops_billing_search":
{ Args: { "p_q": string }; Returns: Json
                           },
"ops_billing_subject":
{ Args: { "p_id": string,"p_type": string }; Returns: Json
                           },
"ops_billing_tasks":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_case":
{ Args: { "p_case": string }; Returns: Json
                           },
"ops_case_owner":
{ Args: { "p_case": string }; Returns: string
                           },
"ops_close_task":
{ Args: { "p_note": string,"p_task": string }; Returns: undefined
                           },
"ops_comp_plan":
{ Args: { "p_id": string,"p_months": number,"p_plan": string,"p_po"?: string,"p_reason": string,"p_type": string }; Returns: string
                           },
"ops_competitions":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"ops_config_history":
{ Args: { "p_key": string }; Returns: Json
                           },
"ops_config_keys":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_cv_records":
{ Args: { "p_query": string }; Returns: {
              "code": string,"full_name": string,"id": string,"issued_at": string,"revoked_at": string,"revoked_reason": string,"superseded": boolean,"user_id": string,"username": string,"version": number
            }[]
                           },
"ops_edit_skill":
{ Args: { "p_action": string,"p_category": string,"p_id": string,"p_name": string,"p_parent": string,"p_reason": string }; Returns: undefined
                           },
"ops_end_subscription":
{ Args: { "p_reason": string,"p_sub": string }; Returns: undefined
                           },
"ops_file_appeal":
{ Args: { "p_body": string,"p_id": string,"p_reason": string,"p_type": string }; Returns: string
                           },
"ops_find_account":
{ Args: { "p_query": string }; Returns: Json
                           },
"ops_gateway_activity":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_github_resync":
{ Args: { "p_reason": string,"p_user": string }; Returns: number
                           },
"ops_grant":
{ Args: { "p_ends_at": string,"p_id": string,"p_key": string,"p_reason": string,"p_type": string,"p_value": Json }; Returns: string
                           },
"ops_inbox":
{ Args: { "p_queue"?: string }; Returns: Json
                           },
"ops_issue_licence":
{ Args: { "p_level": string,"p_po": string,"p_reason": string,"p_starts": string,"p_university": string }; Returns: string
                           },
"ops_mark_invoice_paid":
{ Args: { "p_invoice": string,"p_reason": string,"p_reference": string }; Returns: undefined
                           },
"ops_metrics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_open_all_universities":
{ Args: { "p_reason": string }; Returns: number
                           },
"ops_org_case":
{ Args: { "p_org": string }; Returns: Json
                           },
"ops_org_document":
{ Args: { "p_org": string }; Returns: Json
                           },
"ops_org_reputation":
{ Args: { "p_org": string }; Returns: Json
                           },
"ops_orgs":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"ops_plan_history":
{ Args: { "p_plan": string }; Returns: Json
                           },
"ops_plans":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_queue":
{ Args: { "p_status"?: string }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"excerpt": string,"id": string,"last_reported_at": string,"opened_at": string,"owner_name": string,"reasons": (Database["public"]['Enums']["report_reason"])[],"reports": number,"soft_signal": boolean,"status": Database["public"]['Enums']["report_case_status"],"target_type": Database["public"]['Enums']["report_target"]
            }[]
                           },
"ops_quota_override":
{ Args: { "p_id": string,"p_key": string,"p_reason": string,"p_type": string,"p_used": number }; Returns: undefined
                           },
"ops_recompute_skills":
{ Args: { "p_reason": string,"p_user": string }; Returns: undefined
                           },
"ops_refund":
{ Args: { "p_amount": number,"p_payment": string,"p_reason": string }; Returns: undefined
                           },
"ops_remove_uni_question":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"ops_reset_mfa":
{ Args: { "p_identity_note": string,"p_user": string }; Returns: string
                           },
"ops_resolve_hire_fee":
{ Args: { "p_fee": string,"p_outcome": string,"p_reason": string }; Returns: undefined
                           },
"ops_resolve_spam_review":
{ Args: { "p_action": string,"p_id": string,"p_reason": string }; Returns: undefined
                           },
"ops_revenue":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_review_competition":
{ Args: { "p_approve": boolean,"p_id": string,"p_reason": string }; Returns: undefined
                           },
"ops_revoke_cv":
{ Args: { "p_all": boolean,"p_reason": string,"p_record": string }; Returns: number
                           },
"ops_revoke_grant":
{ Args: { "p_grant": string,"p_reason": string }; Returns: undefined
                           },
"ops_sales_leads":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_sanctions":
{ Args: { "p_active"?: boolean }; Returns: Json
                           },
"ops_set_config":
{ Args: { "p_expected": number,"p_key": string,"p_reason": string,"p_value": Json }; Returns: number
                           },
"ops_set_final_year_batch":
{ Args: { "p_batch": number,"p_reason": string,"p_university": string }; Returns: undefined
                           },
"ops_set_plan_price":
{ Args: { "p_plan": string,"p_price_pkr": number,"p_price_usd": number,"p_reason": string }; Returns: undefined
                           },
"ops_set_tax_rate":
{ Args: { "p_from": string,"p_label": string,"p_province": string,"p_rate": number,"p_reason": string }; Returns: string
                           },
"ops_set_university_live":
{ Args: { "p_live": boolean,"p_reason": string,"p_university": string }; Returns: string
                           },
"ops_simulate":
{ Args: { "p_action": string,"p_reason": string,"p_sub": string }; Returns: Json
                           },
"ops_skills":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_spam_reviews":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"ops_staff":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_uni_claim":
{ Args: { "p_id": string }; Returns: Json
                           },
"ops_uni_list":
{ Args: { "p_query"?: string }; Returns: Json
                           },
"ops_uni_questions":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_uni_queue":
{ Args: { "p_q"?: string }; Returns: Json
                           },
"ops_uni_record":
{ Args: { "p_id": string }; Returns: Json
                           },
"ops_universities":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_university_hides":
{ Args: { "p_case"?: string }; Returns: Json
                           },
"ops_university_requests":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ops_update_sales_lead":
{ Args: { "p_id": string,"p_note": string,"p_status": Database["public"]['Enums']["sales_lead_status"] }; Returns: undefined
                           },
"ops_user_record":
{ Args: { "p_user": string }; Returns: Json
                           },
"ops_user_search":
{ Args: { "p_query": string }; Returns: Json
                           },
"ops_view_as_page":
{ Args: { "p_page": string,"p_user": string }; Returns: Json
                           },
"ops_view_as_start":
{ Args: { "p_reason": string,"p_user": string }; Returns: string
                           },
"ops_void_invoice":
{ Args: { "p_invoice": string,"p_reason": string }; Returns: undefined
                           },
"org_activity":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"org_analytics":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"org_contact_requests":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"org_invite_preview":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"org_members_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"org_plan":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"org_response_stats":
{ Args: { "p_org": string }; Returns: Json
                           },
"pending_friend_request_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"pin_comment":
{ Args: { "p_comment": string,"p_pin": boolean }; Returns: undefined
                           },
"pin_message":
{ Args: { "p_message": string,"p_pin": boolean }; Returns: undefined
                           },
"pinned_announcement":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pinned_university_announcement":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"post_cards":
{ Args: { "p_ids": (string)[] }; Returns: {
              "audience": Database["public"]['Enums']["post_audience"],"author_avatar_path": string,"author_id": string,"author_muted": boolean,"author_name": string,"author_username": string,"body": string,"can_edit": boolean,"comment_count": number,"created_at": string,"edited_at": string,"event": Json,"id": string,"is_mine": boolean,"link": Json,"media": Json,"pinned_until": string,"poll": Json,"stage": Database["public"]['Enums']["post_stage"],"type": Database["public"]['Enums']["post_type"],"venture": Json
            }[]
                           },
"post_comment_list":
{ Args: { "p_post": string }; Returns: {
              "author_avatar_path": string,"author_name": string,"author_username": string,"body": string,"can_delete": boolean,"created_at": string,"deleted": boolean,"id": string,"is_mine": boolean,"parent_id": string,"pinned": boolean
            }[]
                           },
"post_insights":
{ Args: { "p_post": string }; Returns: {
              "commenters": number,"crosses": number,"dimension": string,"label": string,"ticks": number,"views": number,"weighted_rate": number
            }[]
                           },
"post_supervisor_comment":
{ Args: { "p_body": string,"p_venture": string }; Returns: number
                           },
"post_venture_update":
{ Args: { "p_body": string,"p_venture": string }; Returns: string
                           },
"post_venture_update_media":
{ Args: { "p_body": string,"p_media": Json,"p_venture": string }; Returns: string
                           },
"profile_ventures":
{ Args: { "p_user": string }; Returns: {
              "id": string,"is_owner": boolean,"joined_at": string,"status": Database["public"]['Enums']["venture_status"],"team_role": Database["public"]['Enums']["venture_team_role"],"title": string,"type": Database["public"]['Enums']["venture_type"]
            }[]
                           },
"public_plans":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"public_pricing_extras":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"publish_job":
{ Args: { "p_id": string }; Returns: undefined
                           },
"ranking_flag_case":
{ Args: { "p_id": string }; Returns: Json
                           },
"ranking_flag_queue":
{ Args: { "p_status"?: string }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"created_at": string,"endorsements": number,"from_total": number,"gain": number,"id": string,"kind": Database["public"]['Enums']["anti_gaming_kind"],"member_names": (string)[],"reviewed_at": string,"status": Database["public"]['Enums']["review_flag_status"],"to_total": number
            }[]
                           },
"rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"reaction_summary":
{ Args: { "p_messages": (string)[] }; Returns: {
              "message_id": string,"reactions": Json
            }[]
                           },
"record_billing_event":
{ Args: { "p_event": Json,"p_event_id": string,"p_gateway": string,"p_live": boolean,"p_payload": Json,"p_type": string }; Returns: Json
                           },
"record_cv_export":
{ Args: { "p_bytes": number,"p_export": string,"p_mac": string,"p_paper": string,"p_pdf_hash": string,"p_record": string,"p_template": string }; Returns: undefined
                           },
"record_github_webhook":
{ Args: { "p_action"?: string,"p_delivery_id": string,"p_event": string,"p_installation_id"?: number,"p_payload": Json }; Returns: boolean
                           },
"record_sign_in":
{ Args: { "p_device_hash": string,"p_ip_hash": string,"p_method": string,"p_user_agent": string }; Returns: Json
                           },
"record_views":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"recruit_candidate":
{ Args: { "p_student": string }; Returns: Json
                           },
"recruit_candidate_for_code":
{ Args: { "p_code": string }; Returns: string
                           },
"remove_exam_period":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"remove_from_shortlist":
{ Args: { "p_item": string }; Returns: undefined
                           },
"remove_org_member":
{ Args: { "p_user": string }; Returns: undefined
                           },
"remove_uni_admin":
{ Args: { "p_user": string }; Returns: undefined
                           },
"remove_uni_question":
{ Args: { "p_id": string }; Returns: undefined
                           },
"remove_venture_deliverable":
{ Args: { "p_deliverable": string }; Returns: boolean
                           },
"remove_venture_member":
{ Args: { "p_member": string,"p_venture": string }; Returns: undefined
                           },
"rename_shortlist":
{ Args: { "p_id": string,"p_name": string }; Returns: undefined
                           },
"reopen_paused_job":
{ Args: { "p_id": string }; Returns: undefined
                           },
"reorder_shortlist":
{ Args: { "p_items": (string)[],"p_list": string }; Returns: undefined
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_code_check":
{ Args: { "p_skill": string }; Returns: string
                           },
"request_final_year_batch":
{ Args: { "p_reason": string,"p_year": number }; Returns: string
                           },
"request_github_resync":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"request_licence":
{ Args: { "p_level": string,"p_note": string }; Returns: undefined
                           },
"request_review":
{ Args: { "p_teacher": string,"p_venture": string }; Returns: string
                           },
"request_teacher_role":
{ Args: { "p_department": string,"p_title": string }; Returns: Database["public"]['Enums']["teacher_status"]
                           },
"request_uni_domain":
{ Args: { "p_domain": string,"p_kind": Database["public"]['Enums']["domain_kind"],"p_reason": string }; Returns: string
                           },
"request_university":
{ Args: { "p_consent": boolean,"p_email": string,"p_token": string,"p_university_name": string }; Returns: Json
                           },
"require_entitlement":
{ Args: { "p_key": string }; Returns: undefined
                           },
"resolve_case":
{ Args: { "p_action": string,"p_case": string,"p_reason": string,"p_severity"?: string }; Returns: undefined
                           },
"resolve_review_flag":
{ Args: { "p_flag": number,"p_note": string,"p_upheld": boolean }; Returns: boolean
                           },
"respond_contact_request":
{ Args: { "p_accept": boolean,"p_id": string,"p_reason"?: string }; Returns: string
                           },
"respond_feedback":
{ Args: { "p_id": string,"p_reply": string,"p_status": Database["public"]['Enums']["feedback_status"] }; Returns: undefined
                           },
"respond_friend_request":
{ Args: { "p_accept": boolean,"p_request": string }; Returns: undefined
                           },
"respond_invite":
{ Args: { "p_accept": boolean,"p_invite": string }; Returns: Database["public"]['Enums']["venture_invite_status"]
                           },
"respond_supervision":
{ Args: { "p_accept": boolean,"p_venture": string }; Returns: undefined
                           },
"respond_team_invite":
{ Args: { "p_accept": boolean,"p_team": string }; Returns: undefined
                           },
"restart_tour":
{ Args: { "p_tour": string }; Returns: undefined
                           },
"review_credential":
{ Args: { "p_approve": boolean,"p_id": string,"p_issuer"?: string,"p_reason": string }; Returns: undefined
                           },
"review_flag_case":
{ Args: { "p_flag": number }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"commits": Json,"created_at": string,"id": number,"key": string,"kind": Database["public"]['Enums']["review_flag_kind"],"refs": Json,"status": Database["public"]['Enums']["review_flag_status"],"student_name": string,"user_id": string
            }[]
                           },
"review_flag_details":
{ Args: { "p_flag": number }; Returns: {
              "commits": number,"created_at": string,"id": number,"kind": Database["public"]['Enums']["review_flag_kind"],"refs": Json,"status": Database["public"]['Enums']["review_flag_status"],"user_id": string
            }[]
                           },
"review_flag_queue":
{ Args: Record<PropertyKey, never>; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"commits": number,"created_at": string,"id": number,"kind": Database["public"]['Enums']["review_flag_kind"],"student_name": string,"student_username": string
            }[]
                           },
"review_ranking_flag":
{ Args: { "p_id": string,"p_reason": string,"p_uphold": boolean }; Returns: undefined
                           },
"review_requests_for":
{ Args: { "p_venture": string }; Returns: Json
                           },
"review_teacher_flag":
{ Args: { "p_id": string,"p_reason": string,"p_upheld": boolean }; Returns: undefined
                           },
"revoke_api_token":
{ Args: { "p_id": string }; Returns: undefined
                           },
"revoke_award":
{ Args: { "p_award": string }; Returns: undefined
                           },
"revoke_cv":
{ Args: { "p_record": string }; Returns: undefined
                           },
"revoke_invite":
{ Args: { "p_invite": string }; Returns: boolean
                           },
"revoke_org_invite":
{ Args: { "p_id": string }; Returns: undefined
                           },
"revoke_share_link":
{ Args: { "p_id": string }; Returns: undefined
                           },
"revoke_staff_role":
{ Args: { "p_reason": string,"p_role": Database["public"]['Enums']["staff_role"],"p_user": string }; Returns: undefined
                           },
"revoke_teacher":
{ Args: { "p_reason": string,"p_user": string }; Returns: undefined
                           },
"revoke_uni_invite":
{ Args: { "p_id": string }; Returns: undefined
                           },
"rsvp_event":
{ Args: { "p_id": string }; Returns: undefined
                           } |
{ Args: { "p_post": string,"p_status": Database["public"]['Enums']["rsvp_status"] }; Returns: undefined
                           },
"sanction_org":
{ Args: { "p_kind": string,"p_org": string,"p_per_day": number,"p_reason": string,"p_until": string }; Returns: string
                           },
"sanction_user":
{ Args: { "p_case"?: string,"p_kind": string,"p_reason": string,"p_until": string,"p_user": string }; Returns: string
                           },
"save_badge":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_billing_details":
{ Args: { "p": Json,"p_subject": string }; Returns: undefined
                           },
"save_booth":
{ Args: { "p_about": string,"p_booth": string,"p_roles": (string)[] }; Returns: undefined
                           },
"save_branding":
{ Args: { "p": Json }; Returns: undefined
                           },
"save_code_check":
{ Args: { "p_answers": Json,"p_id": string,"p_submit"?: boolean }; Returns: Database["public"]['Enums']["code_check_status"]
                           },
"save_competition":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_cv_settings":
{ Args: { "p_sections": (string)[],"p_show_email": boolean,"p_show_percentile": boolean,"p_visibility": Database["public"]['Enums']["cv_visibility"] }; Returns: undefined
                           },
"save_department":
{ Args: { "p_id": string,"p_name": string }; Returns: string
                           },
"save_ecosphere_modules":
{ Args: { "p": Json }; Returns: undefined
                           },
"save_ecosphere_page":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_ecosphere_structure":
{ Args: { "p_categories": (string)[],"p_labels": Json }; Returns: undefined
                           },
"save_event":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_hackathon":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_idea":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_job":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_job_fair":
{ Args: { "p": Json,"p_id": string }; Returns: string
                           },
"save_programme":
{ Args: { "p_department": string,"p_name": string }; Returns: string
                           },
"save_recruiter_prefs":
{ Args: { "p_availability": (string)[],"p_city": string,"p_remote": boolean }; Returns: undefined
                           },
"save_search":
{ Args: { "p_filters": Json,"p_frequency": string,"p_name": string }; Returns: string
                           },
"save_teacher_settings":
{ Args: { "p_cap": number,"p_digest": boolean,"p_opt_in": boolean,"p_skills": (string)[] }; Returns: undefined
                           },
"save_tour":
{ Args: { "p_outcome": string,"p_step": number,"p_tour": string }; Returns: undefined
                           },
"save_uni_question":
{ Args: { "p_options": Json,"p_prompt": string }; Returns: string
                           },
"save_venture_role":
{ Args: { "p_role"?: string,"p_skill_ids": (string)[],"p_slots": number,"p_title": string,"p_venture": string }; Returns: string
                           },
"saved_searches_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"schedule_plan_change":
{ Args: { "p_plan": string,"p_subject": string }; Returns: undefined
                           },
"score_team":
{ Args: { "p_feedback"?: string,"p_scores": Json,"p_team": string }; Returns: undefined
                           },
"search_chats":
{ Args: { "p_q": string,"p_thread"?: string }; Returns: {
              "created_at": string,"excerpt": string,"message_id": string,"sender_name": string,"thread_id": string,"thread_title": string
            }[]
                           },
"search_people":
{ Args: { "p_batch"?: number,"p_department"?: string,"p_offset"?: number,"p_q": string,"p_skill"?: string,"p_university"?: string }; Returns: {
              "avatar_path": string,"department": string,"friendship": string,"full_name": string,"graduation_year": number,"skills": (string)[],"university": string,"user_id": string,"username": string
            }[]
                           },
"search_talent":
{ Args: { "p_filters": Json,"p_offset"?: number }; Returns: Json
                           },
"search_ventures":
{ Args: { "p_offset"?: number,"p_q": string,"p_skill"?: string,"p_type": Database["public"]['Enums']["venture_type"],"p_university"?: string }; Returns: {
              "created_at": string,"id": string,"members": number,"open_slots": number,"owner_name": string,"owner_username": string,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"],"status": Database["public"]['Enums']["venture_status"],"summary": string,"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_name": string,"visibility": Database["public"]['Enums']["venture_visibility"]
            }[]
                           },
"security_not_me":
{ Args: { "p_token": string }; Returns: Json
                           },
"see_tip":
{ Args: { "p_tip": string }; Returns: undefined
                           },
"send_contact_request":
{ Args: { "p_message": string,"p_role": string,"p_student": string }; Returns: string
                           },
"send_friend_request":
{ Args: { "p_username": string }; Returns: {
              "request_id": string,"status": Database["public"]['Enums']["friend_request_status"]
            }[]
                           },
"send_message":
{ Args: { "p_body": string,"p_media"?: Json,"p_reply_to"?: string,"p_thread": string }; Returns: string
                           },
"set_branding_image":
{ Args: { "p_kind": string,"p_path": string }; Returns: undefined
                           },
"set_idea_status":
{ Args: { "p_id": string,"p_open": boolean }; Returns: undefined
                           },
"set_job_fair_status":
{ Args: { "p_action": string,"p_id": string }; Returns: undefined
                           },
"set_leaderboard_opt_out":
{ Args: { "p_out": boolean }; Returns: boolean
                           },
"set_member_role":
{ Args: { "p_member": string,"p_role": Database["public"]['Enums']["venture_team_role"],"p_venture": string }; Returns: undefined
                           },
"set_my_university":
{ Args: { "p_university_id": string }; Returns: boolean
                           },
"set_notification_pref":
{ Args: { "p_category": string,"p_channel": Database["public"]['Enums']["email_channel"] }; Returns: undefined
                           },
"set_org_member_role":
{ Args: { "p_role": Database["public"]['Enums']["org_role"],"p_user": string }; Returns: undefined
                           },
"set_read_receipts":
{ Args: { "p_on": boolean }; Returns: undefined
                           },
"set_ui_state":
{ Args: { "p_key": string,"p_value": Json }; Returns: undefined
                           },
"set_uni_admin_role":
{ Args: { "p_department": string,"p_role": Database["public"]['Enums']["uni_admin_role"],"p_user": string }; Returns: undefined
                           },
"set_venture_questions":
{ Args: { "p_questions": (string)[],"p_venture": string }; Returns: undefined
                           },
"shortlist_get":
{ Args: { "p_list": string }; Returns: Json
                           },
"shortlists_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"signin_failed":
{ Args: { "p_email": string,"p_ip_hash": string }; Returns: Json
                           },
"signin_status":
{ Args: { "p_email": string,"p_ip_hash": string }; Returns: Json
                           },
"start_code_check":
{ Args: { "p_id": string }; Returns: string
                           },
"start_github_link":
{ Args: { "p_code": string,"p_installation_id"?: number }; Returns: string
                           },
"start_review":
{ Args: { "p_venture": string }; Returns: string
                           },
"start_trial":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"start_venture_from_idea":
{ Args: { "p": Json,"p_idea": string }; Returns: string
                           },
"storage_usage":
{ Args: Record<PropertyKey, never>; Returns: {
              "bucket": string,"bytes": number,"objects": number,"quota_bytes": number
            }[]
                           },
"submit_appeal":
{ Args: { "p_body": string,"p_id": string,"p_type": string }; Returns: string
                           },
"submit_competition":
{ Args: { "p_id": string }; Returns: undefined
                           },
"submit_credential":
{ Args: { "p": Json }; Returns: string
                           },
"submit_feedback":
{ Args: { "p_body": string,"p_device": string,"p_page": string,"p_screenshot": string,"p_type": Database["public"]['Enums']["feedback_type"],"p_version": string }; Returns: string
                           },
"submit_org_document":
{ Args: { "p_path": string }; Returns: undefined
                           },
"submit_repo":
{ Args: { "p_team": string,"p_url": string }; Returns: undefined
                           },
"submit_report":
{ Args: { "p_detail"?: string,"p_messages"?: (string)[],"p_reason": Database["public"]['Enums']["report_reason"],"p_target": string,"p_type": Database["public"]['Enums']["report_target"] }; Returns: undefined
                           },
"submit_review":
{ Args: { "p_comments"?: string,"p_request": string,"p_rubric": Json }; Returns: string
                           },
"submit_sales_lead":
{ Args: { "p_email": string,"p_message": string,"p_name": string,"p_organisation": string,"p_role": string }; Returns: string
                           },
"submit_uni_claim":
{ Args: { "p": Json }; Returns: string
                           },
"supervision_for":
{ Args: { "p_venture": string }; Returns: Json
                           },
"supervisor_confirm_contribution":
{ Args: { "p_entry": string }; Returns: boolean
                           },
"supervisor_thread":
{ Args: { "p_venture": string }; Returns: Json
                           },
"survey_for_posts":
{ Args: { "p_ids": (string)[] }; Returns: {
              "answered_at": string,"can_change": boolean,"dimension": string,"my_answer": boolean,"post_id": string,"public_line": Json,"question": string,"question_id": number
            }[]
                           },
"talent_explore":
{ Args: { "p_filters": Json,"p_offset"?: number }; Returns: Json
                           },
"talent_facets":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"teacher_claim_code_check":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"teacher_code_check_case":
{ Args: { "p_id": string }; Returns: Json
                           },
"teacher_code_check_queue":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"teacher_contributions":
{ Args: { "p_venture": string }; Returns: Json
                           },
"teacher_deliverables":
{ Args: { "p_venture": string }; Returns: Json
                           },
"teacher_endorse":
{ Args: { "p_endorsee": string,"p_items": Json,"p_note"?: string,"p_venture": string }; Returns: number
                           },
"teacher_endorse_options":
{ Args: { "p_venture": string }; Returns: Json
                           },
"teacher_flag_queue":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"teacher_grade_code_check":
{ Args: { "p_feedback": string,"p_id": string,"p_rubric": Json }; Returns: boolean
                           },
"teacher_home":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"teacher_requests":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"teacher_review_request":
{ Args: { "p_request": string }; Returns: Json
                           },
"teacher_review_requests":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"teacher_settings_get":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"teacher_state":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"teacher_venture":
{ Args: { "p_venture": string }; Returns: Json
                           },
"teacher_ventures":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"teachers_for_venture":
{ Args: { "p_venture": string }; Returns: Json
                           },
"thread_messages":
{ Args: { "p_before"?: string,"p_limit"?: number,"p_thread": string }; Returns: {
              "body": string,"created_at": string,"deleted": boolean,"edited_at": string,"id": string,"link": Json,"media_height": number,"media_path": string,"media_width": number,"pinned": boolean,"reactions": Json,"reply_excerpt": string,"reply_sender_id": string,"reply_to_id": string,"sender_id": string
            }[]
                           },
"thread_people":
{ Args: { "p_thread": string }; Returns: {
              "avatar_path": string,"blocked": boolean,"is_me": boolean,"name": string,"user_id": string,"username": string
            }[]
                           },
"thread_pins":
{ Args: { "p_thread": string }; Returns: {
              "excerpt": string,"message_id": string,"pinned_at": string,"sender_id": string
            }[]
                           },
"tiers_for":
{ Args: { "p_users": (string)[] }; Returns: {
              "tier": Database["public"]['Enums']["ranking_tier"],"user_id": string
            }[]
                           },
"todo_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"toggle_reaction":
{ Args: { "p_emoji": string,"p_message": string }; Returns: boolean
                           },
"touch_activity":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"tour_state":
{ Args: { "p_tour": string }; Returns: Json
                           },
"transfer_uni_ownership":
{ Args: { "p_user": string }; Returns: undefined
                           },
"transfer_venture_ownership":
{ Args: { "p_member": string,"p_venture": string }; Returns: undefined
                           },
"transition_venture":
{ Args: { "p_to": Database["public"]['Enums']["venture_status"],"p_venture": string }; Returns: undefined
                           },
"unblock_company":
{ Args: { "p_org": string }; Returns: undefined
                           },
"unblock_user":
{ Args: { "p_username": string }; Returns: undefined
                           },
"unfriend":
{ Args: { "p_username": string }; Returns: undefined
                           },
"uni_add_exam_period":
{ Args: { "p_ends": string,"p_reason": string,"p_starts": string }; Returns: string
                           },
"uni_admins_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_announcements":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_approve_teacher":
{ Args: { "p_user": string }; Returns: undefined
                           },
"uni_audit_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_badges":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_calendar":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_change_slug":
{ Args: { "p_slug": string }; Returns: undefined
                           },
"uni_dashboard":
{ Args: { "p_area": string }; Returns: Json
                           },
"uni_delete_semester":
{ Args: { "p_id": string }; Returns: undefined
                           },
"uni_domains":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_ecosphere":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_end_announcement":
{ Args: { "p_post": string }; Returns: undefined
                           },
"uni_events":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_fair":
{ Args: { "p_id": string }; Returns: Json
                           },
"uni_fairs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_feature_options":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_hackathons":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_hide":
{ Args: { "p_id": string,"p_reason": string,"p_type": string }; Returns: string
                           },
"uni_home":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_import_faculty":
{ Args: { "p_rows": Json }; Returns: number
                           },
"uni_invite_preview":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"uni_moderation":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_post_announcement":
{ Args: { "p": Json }; Returns: string
                           },
"uni_questions":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_recent_feed":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_remove_exam_period":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"uni_revoke_teacher":
{ Args: { "p_reason": string,"p_user": string }; Returns: undefined
                           },
"uni_save_semester":
{ Args: { "p_ends": string,"p_name": string,"p_starts": string }; Returns: string
                           },
"uni_set_teacher_department":
{ Args: { "p_department": string,"p_user": string }; Returns: undefined
                           },
"uni_sponsorship":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_structure":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uni_students":
{ Args: { "p_batch"?: number,"p_department"?: string,"p_offset"?: number,"p_q"?: string }; Returns: Json
                           },
"uni_teachers":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"university_student_record":
{ Args: { "p_student": string }; Returns: Json
                           },
"unread_chat_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"unread_notification_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"unsubscribe_university_request":
{ Args: { "p_token": string }; Returns: boolean
                           },
"update_company_page":
{ Args: { "p": Json }; Returns: undefined
                           },
"update_venture":
{ Args: { "p": Json,"p_venture": string }; Returns: undefined
                           },
"use_mfa_backup_code":
{ Args: { "p_code": string }; Returns: boolean
                           },
"username_available":
{ Args: { "p_username": string }; Returns: boolean
                           },
"venture_by_link":
{ Args: { "p_venture": string }; Returns: {
              "created_at": string,"description": string,"id": string,"owner_id": string,"status": Database["public"]['Enums']["venture_status"],"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"visibility": Database["public"]['Enums']["venture_visibility"]
            }[]
                           },
"venture_chat":
{ Args: { "p_venture": string }; Returns: string
                           },
"venture_counts":
{ Args: { "p_venture": string }; Returns: {
              "deliverables": number,"followers": number,"members": number,"updates": number
            }[]
                           },
"venture_reviews_for":
{ Args: { "p_venture": string }; Returns: Json
                           },
"venture_team":
{ Args: { "p_venture": string }; Returns: {
              "avatar_path": string,"full_name": string,"is_owner": boolean,"joined_at": string,"profile_visible": boolean,"team_role": Database["public"]['Enums']["venture_team_role"],"user_id": string,"username": string
            }[]
                           },
"venture_verified_contributors":
{ Args: { "p_venture": string }; Returns: number
                           },
"verify_cv":
{ Args: { "p_code": string,"p_pdf_hash"?: string }; Returns: {
              "code": string,"expires_at": string,"issued_at": string,"key_id": string,"pdf_checked": boolean,"pdf_matches": boolean,"public_key": string,"revoked_at": string,"signature": string,"snapshot": Json,"snapshot_hash": string,"superseded_at": string
            }[]
                           },
"vote_poll":
{ Args: { "p_position": number,"p_post": string }; Returns: undefined
                           },
"withdraw_application":
{ Args: { "p_thread": string }; Returns: boolean
                           },
"withdraw_job_application":
{ Args: { "p_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_role": "student"|"faculty"|"recruiter"|"university_admin","account_status": "active"|"graduate"|"deleting","anti_gaming_kind": "ring"|"rapid_gain","appeal_decision_type": "sanction"|"report_case"|"cv_revocation"|"credential"|"code_check","appeal_status": "pending"|"upheld"|"overturned","application_stage": "applied"|"screening"|"interview"|"offer"|"hired"|"rejected"|"withdrawn","application_status": "pending"|"accepted"|"declined"|"withdrawn"|"closed","billing_subject": "user"|"org"|"university","chat_thread_type": "dm"|"group","code_check_status": "preparing"|"ready"|"in_progress"|"submitted"|"passed"|"failed"|"unavailable"|"expired","competition_status": "draft"|"in_review"|"rejected"|"approved"|"live"|"frozen"|"judged","contact_status": "pending"|"accepted"|"declined"|"expired","contribution_kind": "code"|"design"|"research"|"docs"|"management"|"other","contribution_source": "manual"|"github","credential_status": "pending"|"approved"|"rejected"|"expired","cv_visibility": "private"|"link"|"recruiters","domain_kind": "student"|"faculty"|"both","email_channel": "instant_email"|"digest"|"off","entitlement_kind": "bool"|"int"|"limit"|"enum","fair_queue_status": "waiting"|"called"|"talking"|"done"|"skipped"|"left","fair_status": "draft"|"published"|"cancelled","feedback_status": "received"|"reviewing"|"planned"|"shipped"|"wont_do","feedback_type": "bug"|"idea"|"confusing"|"praise","friend_request_status": "pending"|"accepted"|"declined","github_commit_status": "pending"|"counted"|"held"|"excluded","github_repo_kind": "owned"|"collaborator"|"fork"|"template","grant_source": "plan"|"add_on"|"sponsorship"|"trial"|"admin","idea_audience": "university"|"global","idea_difficulty": "intro"|"intermediate"|"advanced","idea_status": "open"|"closed","job_run_status": "running"|"succeeded"|"failed","job_status": "draft"|"live"|"closed"|"paused","looking_for_option": "internship"|"job"|"teammates"|"project"|"mentorship","org_role": "admin"|"recruiter"|"billing","org_status": "pending"|"verified"|"suspended"|"rejected","post_audience": "university"|"global","post_stage": "seed"|"limited"|"full"|"global_boost"|"demoted"|"held","post_type": "general"|"invite"|"announcement"|"event"|"poll"|"shipped","profile_visibility": "friends"|"university"|"global","ranking_adjustment_kind": "penalty"|"rapid_gain","ranking_tier": "raw"|"spark"|"flare"|"shine"|"radiant"|"luminary","report_case_status": "open"|"dismissed"|"removed"|"warned","report_reason": "spam"|"harassment"|"inappropriate"|"misinformation"|"impersonation"|"other","report_target": "post"|"comment"|"message"|"profile"|"venture","review_flag_kind": "burst"|"backdating"|"cross_account_duplicate","review_flag_status": "open"|"cleared"|"upheld","review_request_status": "open"|"submitted"|"declined"|"expired"|"cancelled","rsvp_status": "going"|"interested","sales_lead_status": "new"|"contacted"|"won"|"lost","sanction_kind": "warn"|"suspend"|"ban"|"throttle","skill_category": "language"|"framework"|"library"|"tool"|"platform"|"practice","staff_role": "moderator"|"trust_reviewer"|"accounts"|"super_admin","subscription_status": "trialing"|"active"|"past_due"|"expired"|"cancelled","supervisor_status": "invited"|"active"|"ended","sync_status": "queued"|"running"|"done"|"failed"|"cancelled","teacher_status": "pending"|"approved"|"revoked","uni_admin_role": "owner"|"admin"|"career"|"coordinator"|"comms","uni_event_scope": "university"|"global","uni_event_type": "talk"|"workshop"|"hackathon"|"competition"|"other","uni_hide_status": "hidden"|"restored"|"removed","uni_request_status": "pending"|"approved"|"rejected","venture_invite_status": "pending"|"accepted"|"declined"|"revoked","venture_stage": "idea"|"prototype"|"launched"|"revenue","venture_status": "recruiting"|"in_progress"|"completed"|"abandoned","venture_team_role": "lead"|"developer"|"designer"|"researcher"|"other","venture_type": "project"|"startup","venture_visibility": "public"|"university"|"unlisted"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_role": ["student", "faculty", "recruiter", "university_admin"],"account_status": ["active", "graduate", "deleting"],"anti_gaming_kind": ["ring", "rapid_gain"],"appeal_decision_type": ["sanction", "report_case", "cv_revocation", "credential", "code_check"],"appeal_status": ["pending", "upheld", "overturned"],"application_stage": ["applied", "screening", "interview", "offer", "hired", "rejected", "withdrawn"],"application_status": ["pending", "accepted", "declined", "withdrawn", "closed"],"billing_subject": ["user", "org", "university"],"chat_thread_type": ["dm", "group"],"code_check_status": ["preparing", "ready", "in_progress", "submitted", "passed", "failed", "unavailable", "expired"],"competition_status": ["draft", "in_review", "rejected", "approved", "live", "frozen", "judged"],"contact_status": ["pending", "accepted", "declined", "expired"],"contribution_kind": ["code", "design", "research", "docs", "management", "other"],"contribution_source": ["manual", "github"],"credential_status": ["pending", "approved", "rejected", "expired"],"cv_visibility": ["private", "link", "recruiters"],"domain_kind": ["student", "faculty", "both"],"email_channel": ["instant_email", "digest", "off"],"entitlement_kind": ["bool", "int", "limit", "enum"],"fair_queue_status": ["waiting", "called", "talking", "done", "skipped", "left"],"fair_status": ["draft", "published", "cancelled"],"feedback_status": ["received", "reviewing", "planned", "shipped", "wont_do"],"feedback_type": ["bug", "idea", "confusing", "praise"],"friend_request_status": ["pending", "accepted", "declined"],"github_commit_status": ["pending", "counted", "held", "excluded"],"github_repo_kind": ["owned", "collaborator", "fork", "template"],"grant_source": ["plan", "add_on", "sponsorship", "trial", "admin"],"idea_audience": ["university", "global"],"idea_difficulty": ["intro", "intermediate", "advanced"],"idea_status": ["open", "closed"],"job_run_status": ["running", "succeeded", "failed"],"job_status": ["draft", "live", "closed", "paused"],"looking_for_option": ["internship", "job", "teammates", "project", "mentorship"],"org_role": ["admin", "recruiter", "billing"],"org_status": ["pending", "verified", "suspended", "rejected"],"post_audience": ["university", "global"],"post_stage": ["seed", "limited", "full", "global_boost", "demoted", "held"],"post_type": ["general", "invite", "announcement", "event", "poll", "shipped"],"profile_visibility": ["friends", "university", "global"],"ranking_adjustment_kind": ["penalty", "rapid_gain"],"ranking_tier": ["raw", "spark", "flare", "shine", "radiant", "luminary"],"report_case_status": ["open", "dismissed", "removed", "warned"],"report_reason": ["spam", "harassment", "inappropriate", "misinformation", "impersonation", "other"],"report_target": ["post", "comment", "message", "profile", "venture"],"review_flag_kind": ["burst", "backdating", "cross_account_duplicate"],"review_flag_status": ["open", "cleared", "upheld"],"review_request_status": ["open", "submitted", "declined", "expired", "cancelled"],"rsvp_status": ["going", "interested"],"sales_lead_status": ["new", "contacted", "won", "lost"],"sanction_kind": ["warn", "suspend", "ban", "throttle"],"skill_category": ["language", "framework", "library", "tool", "platform", "practice"],"staff_role": ["moderator", "trust_reviewer", "accounts", "super_admin"],"subscription_status": ["trialing", "active", "past_due", "expired", "cancelled"],"supervisor_status": ["invited", "active", "ended"],"sync_status": ["queued", "running", "done", "failed", "cancelled"],"teacher_status": ["pending", "approved", "revoked"],"uni_admin_role": ["owner", "admin", "career", "coordinator", "comms"],"uni_event_scope": ["university", "global"],"uni_event_type": ["talk", "workshop", "hackathon", "competition", "other"],"uni_hide_status": ["hidden", "restored", "removed"],"uni_request_status": ["pending", "approved", "rejected"],"venture_invite_status": ["pending", "accepted", "declined", "revoked"],"venture_stage": ["idea", "prototype", "launched", "revenue"],"venture_status": ["recruiting", "in_progress", "completed", "abandoned"],"venture_team_role": ["lead", "developer", "designer", "researcher", "other"],"venture_type": ["project", "startup"],"venture_visibility": ["public", "university", "unlisted"]
          }
        }
} as const

