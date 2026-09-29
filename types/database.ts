
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
            "agreement_acceptances": {
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
                    "created_at": string,"dm_key": string | null,"id": string,"last_message_at": string | null,"type": Database["public"]['Enums']["chat_thread_type"],"venture_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"dm_key"?: string | null,"id"?: string,"last_message_at"?: string | null,"type": Database["public"]['Enums']["chat_thread_type"],"venture_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"dm_key"?: string | null,"id"?: string,"last_message_at"?: string | null,"type"?: Database["public"]['Enums']["chat_thread_type"],"venture_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_threads_venture_id_fkey"
      columns: ["venture_id"]
isOneToOne: false
      referencedRelation: "ventures"
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
                    "answers": NonNullable<Json>,"claimed_at": string | null,"claimed_by": string | null,"deadline_at": string | null,"end_line": number | null,"feedback": string | null,"graded_at": string | null,"grader_id": string | null,"id": string,"path": string | null,"prompt_id": string | null,"ready_at": string | null,"repo_id": number | null,"requested_at": string,"rubric": Json | null,"sha": string | null,"skill_id": string,"snippet_served_at": string | null,"start_line": number | null,"started_at": string | null,"status": Database["public"]['Enums']["code_check_status"],"submitted_at": string | null,"unavailable_reason": string | null,"user_id": string
                  }
                  Insert: {
                    "answers"?: NonNullable<Json>,"claimed_at"?: string | null,"claimed_by"?: string | null,"deadline_at"?: string | null,"end_line"?: number | null,"feedback"?: string | null,"graded_at"?: string | null,"grader_id"?: string | null,"id"?: string,"path"?: string | null,"prompt_id"?: string | null,"ready_at"?: string | null,"repo_id"?: number | null,"requested_at"?: string,"rubric"?: Json | null,"sha"?: string | null,"skill_id": string,"snippet_served_at"?: string | null,"start_line"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["code_check_status"],"submitted_at"?: string | null,"unavailable_reason"?: string | null,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"claimed_at"?: string | null,"claimed_by"?: string | null,"deadline_at"?: string | null,"end_line"?: number | null,"feedback"?: string | null,"graded_at"?: string | null,"grader_id"?: string | null,"id"?: string,"path"?: string | null,"prompt_id"?: string | null,"ready_at"?: string | null,"repo_id"?: number | null,"requested_at"?: string,"rubric"?: Json | null,"sha"?: string | null,"skill_id"?: string,"snippet_served_at"?: string | null,"start_line"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["code_check_status"],"submitted_at"?: string | null,"unavailable_reason"?: string | null,"user_id"?: string
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
                },"contribution_confirmations": {
                  Row: {
                    "confirmer_id": string,"contribution_id": string,"created_at": string
                  }
                  Insert: {
                    "confirmer_id": string,"contribution_id": string,"created_at"?: string
                  }
                  Update: {
                    "confirmer_id"?: string,"contribution_id"?: string,"created_at"?: string
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
                    "before_venture": boolean,"commit_sha": string | null,"corrects_id": string | null,"created_at": string,"description": string,"evidence_url": string | null,"hours": number | null,"id": string,"kind": Database["public"]['Enums']["contribution_kind"],"skill_ids": (string)[],"source": Database["public"]['Enums']["contribution_source"],"user_id": string,"venture_id": string
                  }
                  Insert: {
                    "before_venture"?: boolean,"commit_sha"?: string | null,"corrects_id"?: string | null,"created_at"?: string,"description": string,"evidence_url"?: string | null,"hours"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["contribution_kind"],"skill_ids"?: (string)[],"source"?: Database["public"]['Enums']["contribution_source"],"user_id": string,"venture_id": string
                  }
                  Update: {
                    "before_venture"?: boolean,"commit_sha"?: string | null,"corrects_id"?: string | null,"created_at"?: string,"description"?: string,"evidence_url"?: string | null,"hours"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["contribution_kind"],"skill_ids"?: (string)[],"source"?: Database["public"]['Enums']["contribution_source"],"user_id"?: string,"venture_id"?: string
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
                },"endorsements": {
                  Row: {
                    "created_at": string,"endorsee_id": string,"endorser_id": string,"evidence_id": string | null,"hidden": boolean,"hidden_at": string | null,"id": string,"note": string | null,"skill_id": string,"venture_id": string
                  }
                  Insert: {
                    "created_at"?: string,"endorsee_id": string,"endorser_id": string,"evidence_id"?: string | null,"hidden"?: boolean,"hidden_at"?: string | null,"id"?: string,"note"?: string | null,"skill_id": string,"venture_id": string
                  }
                  Update: {
                    "created_at"?: string,"endorsee_id"?: string,"endorser_id"?: string,"evidence_id"?: string | null,"hidden"?: boolean,"hidden_at"?: string | null,"id"?: string,"note"?: string | null,"skill_id"?: string,"venture_id"?: string
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
                    "authored_at": string | null,"exclusion": string | null,"extracted_at": string | null,"files": number,"first_seen_at": string,"meaningful_lines": number,"occurred_at": string,"repo_id": number,"seen_via": string,"sha": string,"signed": boolean,"status": Database["public"]['Enums']["github_commit_status"],"user_id": string
                  }
                  Insert: {
                    "authored_at"?: string | null,"exclusion"?: string | null,"extracted_at"?: string | null,"files"?: number,"first_seen_at"?: string,"meaningful_lines"?: number,"occurred_at": string,"repo_id": number,"seen_via": string,"sha": string,"signed"?: boolean,"status"?: Database["public"]['Enums']["github_commit_status"],"user_id": string
                  }
                  Update: {
                    "authored_at"?: string | null,"exclusion"?: string | null,"extracted_at"?: string | null,"files"?: number,"first_seen_at"?: string,"meaningful_lines"?: number,"occurred_at"?: string,"repo_id"?: number,"seen_via"?: string,"sha"?: string,"signed"?: boolean,"status"?: Database["public"]['Enums']["github_commit_status"],"user_id"?: string
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
                    "classified_at": string | null,"discovered_at": string,"excluded": boolean,"harvested_at": string | null,"installation_id": number,"kind": Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at": string | null,"repo_id": number,"user_id": string
                  }
                  Insert: {
                    "classified_at"?: string | null,"discovered_at"?: string,"excluded"?: boolean,"harvested_at"?: string | null,"installation_id": number,"kind"?: Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at"?: string | null,"repo_id": number,"user_id": string
                  }
                  Update: {
                    "classified_at"?: string | null,"discovered_at"?: string,"excluded"?: boolean,"harvested_at"?: string | null,"installation_id"?: number,"kind"?: Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at"?: string | null,"repo_id"?: number,"user_id"?: string
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
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"id": string,"parent_id": string | null,"pinned": boolean,"post_id": string,"removed_by": string | null
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"parent_id"?: string | null,"pinned"?: boolean,"post_id": string,"removed_by"?: string | null
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"parent_id"?: string | null,"pinned"?: boolean,"post_id"?: string,"removed_by"?: string | null
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
                    "audience": Database["public"]['Enums']["post_audience"],"author_id": string,"body": string,"created_at": string,"edited_at": string | null,"id": string,"link_url": string | null,"pinned_until": string | null,"removed_at": string | null,"removed_by": string | null,"stage": Database["public"]['Enums']["post_stage"],"stage_changed_at": string,"type": Database["public"]['Enums']["post_type"],"university_id": string | null,"venture_id": string | null
                  }
                  Insert: {
                    "audience": Database["public"]['Enums']["post_audience"],"author_id": string,"body": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"link_url"?: string | null,"pinned_until"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"stage"?: Database["public"]['Enums']["post_stage"],"stage_changed_at"?: string,"type": Database["public"]['Enums']["post_type"],"university_id"?: string | null,"venture_id"?: string | null
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["post_audience"],"author_id"?: string,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"link_url"?: string | null,"pinned_until"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"stage"?: Database["public"]['Enums']["post_stage"],"stage_changed_at"?: string,"type"?: Database["public"]['Enums']["post_type"],"university_id"?: string | null,"venture_id"?: string | null
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
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"bio": string | null,"campus": string | null,"chat_read_receipts": boolean,"cover_path": string | null,"created_at": string,"department": string | null,"full_name": string,"graduation_year": number | null,"leaderboard_opt_out": boolean,"looking_for": (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete": boolean,"programme": string | null,"recruiter_visible": boolean,"role": Database["public"]['Enums']["account_role"],"university_id": string | null,"updated_at": string,"user_id": string,"username": string | null,"visibility": Database["public"]['Enums']["profile_visibility"]
                  }
                  Insert: {
                    "avatar_path"?: string | null,"bio"?: string | null,"campus"?: string | null,"chat_read_receipts"?: boolean,"cover_path"?: string | null,"created_at"?: string,"department"?: string | null,"full_name": string,"graduation_year"?: number | null,"leaderboard_opt_out"?: boolean,"looking_for"?: (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete"?: boolean,"programme"?: string | null,"recruiter_visible"?: boolean,"role"?: Database["public"]['Enums']["account_role"],"university_id"?: string | null,"updated_at"?: string,"user_id": string,"username"?: string | null,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Update: {
                    "avatar_path"?: string | null,"bio"?: string | null,"campus"?: string | null,"chat_read_receipts"?: boolean,"cover_path"?: string | null,"created_at"?: string,"department"?: string | null,"full_name"?: string,"graduation_year"?: number | null,"leaderboard_opt_out"?: boolean,"looking_for"?: (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete"?: boolean,"programme"?: string | null,"recruiter_visible"?: boolean,"role"?: Database["public"]['Enums']["account_role"],"university_id"?: string | null,"updated_at"?: string,"user_id"?: string,"username"?: string | null,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Relationships: [
                    {
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
                },"sanctions": {
                  Row: {
                    "case_id": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["sanction_kind"],"reason": string,"staff_id": string,"until": string | null,"user_id": string
                  }
                  Insert: {
                    "case_id"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["sanction_kind"],"reason": string,"staff_id": string,"until"?: string | null,"user_id": string
                  }
                  Update: {
                    "case_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["sanction_kind"],"reason"?: string,"staff_id"?: string,"until"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sanctions_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "report_cases"
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
                },"universities": {
                  Row: {
                    "city": string | null,"created_at": string,"id": string,"name": string,"province": string | null,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"id"?: string,"name": string,"province"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"province"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                    "active_days": number,"hits": number,"last_used_at": string | null,"level": number,"lines": number,"peer_verified": boolean,"repos": number,"skill_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "active_days"?: number,"hits"?: number,"last_used_at"?: string | null,"level": number,"lines"?: number,"peer_verified"?: boolean,"repos"?: number,"skill_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_days"?: number,"hits"?: number,"last_used_at"?: string | null,"level"?: number,"lines"?: number,"peer_verified"?: boolean,"repos"?: number,"skill_id"?: string,"updated_at"?: string,"user_id"?: string
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
                    "abandoned_at": string | null,"affiliation": string | null,"completed_at": string | null,"created_at": string,"description": string,"id": string,"owner_id": string,"pitch_url": string | null,"repo_full_name": string | null,"repo_id": number | null,"search": unknown,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"] | null,"status": Database["public"]['Enums']["venture_status"],"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"updated_at": string,"visibility": Database["public"]['Enums']["venture_visibility"]
                  }
                  Insert: {
                    "abandoned_at"?: string | null,"affiliation"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description": string,"id"?: string,"owner_id": string,"pitch_url"?: string | null,"repo_full_name"?: string | null,"repo_id"?: number | null,"search"?: never,"skill_ids"?: (string)[],"stage"?: Database["public"]['Enums']["venture_stage"] | null,"status"?: Database["public"]['Enums']["venture_status"],"team_size"?: number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["venture_visibility"]
                  }
                  Update: {
                    "abandoned_at"?: string | null,"affiliation"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"owner_id"?: string,"pitch_url"?: string | null,"repo_full_name"?: string | null,"repo_id"?: number | null,"search"?: never,"skill_ids"?: (string)[],"stage"?: Database["public"]['Enums']["venture_stage"] | null,"status"?: Database["public"]['Enums']["venture_status"],"team_size"?: number,"title"?: string,"type"?: Database["public"]['Enums']["venture_type"],"university_id"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["venture_visibility"]
                  }
                  Relationships: [
                    {
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
                    "before_venture": boolean | null,"by_member": boolean | null,"commit_sha": string | null,"confirmations": number | null,"confirmed_by_me": boolean | null,"corrected_at": string | null,"created_at": string | null,"current_id": string | null,"description": string | null,"evidence_url": string | null,"hours": number | null,"id": string | null,"kind": Database["public"]['Enums']["contribution_kind"] | null,"peer_verified": boolean | null,"skill_ids": (string)[] | null,"source": Database["public"]['Enums']["contribution_source"] | null,"user_id": string | null,"venture_id": string | null
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
            "add_application_message":
{ Args: { "p_body": string,"p_thread": string }; Returns: number
                           },
"add_comment":
{ Args: { "p_body": string,"p_parent": string,"p_post": string }; Returns: string
                           },
"add_exam_period":
{ Args: { "p_ends": string,"p_reason": string,"p_starts": string,"p_university": string }; Returns: string
                           },
"add_venture_deliverable":
{ Args: { "p_label": string,"p_url": string,"p_venture": string }; Returns: string
                           },
"answer_survey":
{ Args: { "p_answer": boolean,"p_latency_ms": number,"p_post": string }; Returns: undefined
                           },
"application_people":
{ Args: { "p_ids": (string)[] }; Returns: {
              "full_name": string,"user_id": string,"username": string
            }[]
                           },
"apply_to_venture":
{ Args: { "p_answers"?: (string)[],"p_message": string,"p_role"?: string,"p_venture": string }; Returns: string
                           },
"block_user":
{ Args: { "p_username": string }; Returns: undefined
                           },
"browse_ventures":
{ Args: { "p_before"?: string,"p_limit"?: number,"p_my_university"?: boolean,"p_open_roles"?: boolean,"p_status"?: Database["public"]['Enums']["venture_status"],"p_type": Database["public"]['Enums']["venture_type"] }; Returns: {
              "created_at": string,"id": string,"members": number,"open_slots": number,"owner_name": string,"owner_username": string,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"],"status": Database["public"]['Enums']["venture_status"],"summary": string,"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_name": string,"visibility": Database["public"]['Enums']["venture_visibility"]
            }[]
                           },
"cancel_friend_request":
{ Args: { "p_request": string }; Returns: undefined
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
"claim_ranking_flag":
{ Args: { "p_claim": boolean,"p_id": string }; Returns: undefined
                           },
"claim_review_flag":
{ Args: { "p_claim": boolean,"p_flag": number }; Returns: undefined
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
"complete_onboarding":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"confirm_contribution":
{ Args: { "p_entry": string }; Returns: boolean
                           },
"correct_contribution":
{ Args: { "p_description": string,"p_evidence_url"?: string,"p_hours"?: number,"p_kind": Database["public"]['Enums']["contribution_kind"],"p_original": string,"p_skill_ids"?: (string)[] }; Returns: string
                           },
"create_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"create_post":
{ Args: { "p": Json }; Returns: string
                           },
"create_venture":
{ Args: { "p": Json }; Returns: string
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
"decide_application":
{ Args: { "p_accept": boolean,"p_thread": string }; Returns: Database["public"]['Enums']["application_status"]
                           },
"delete_comment":
{ Args: { "p_comment": string }; Returns: undefined
                           },
"delete_credential":
{ Args: { "p_id": string }; Returns: boolean
                           },
"delete_message":
{ Args: { "p_message": string }; Returns: string
                           },
"delete_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"delete_post":
{ Args: { "p_post": string }; Returns: (string)[]
                           },
"delete_venture_role":
{ Args: { "p_role": string,"p_venture": string }; Returns: undefined
                           },
"delete_venture_update":
{ Args: { "p_update": string }; Returns: boolean
                           },
"disconnect_github":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"dm_receipt":
{ Args: { "p_thread": string }; Returns: string
                           },
"edit_message":
{ Args: { "p_body": string,"p_message": string }; Returns: undefined
                           },
"edit_post":
{ Args: { "p_body": string,"p_post": string }; Returns: undefined
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
              "created_at": string,"endorser_avatar_path": string,"endorser_id": string,"endorser_name": string,"endorser_username": string,"has_evidence": boolean,"hidden": boolean,"id": string,"note": string,"skill_id": string,"skill_name": string,"venture_id": string,"venture_title": string
            }[]
                           },
"exam_period_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"created_by_name": string,"ends_on": string,"id": string,"reason": string,"starts_on": string,"university_id": string,"university_name": string
            }[]
                           },
"feed_page":
{ Args: { "p_audience": Database["public"]['Enums']["post_audience"],"p_cursor"?: string,"p_filter"?: string,"p_limit"?: number }; Returns: {
              "next_cursor": string,"post_id": string,"rank": number
            }[]
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
"grade_code_check":
{ Args: { "p_feedback": string,"p_id": string,"p_rubric": Json }; Returns: boolean
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
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"invite_to_venture":
{ Args: { "p_username": string,"p_venture": string }; Returns: string
                           },
"is_staff":
{ Args: { "p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"job_run_finish":
{ Args: { "p_error"?: string,"p_id": string,"p_rows"?: number,"p_status": Database["public"]['Enums']["job_run_status"] }; Returns: undefined
                           },
"job_run_start":
{ Args: { "p_job": string,"p_meta"?: Json }; Returns: string
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
"leave_venture":
{ Args: { "p_venture": string }; Returns: undefined
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
"mfa_backup_codes_remaining":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mute_thread":
{ Args: { "p_hours": number,"p_thread": string }; Returns: undefined
                           },
"mute_user":
{ Args: { "p_mute": boolean,"p_username": string }; Returns: undefined
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
              "active_days": number,"hits": number,"last_used_at": string,"level": number,"lines": number,"repos": number,"skill_id": string
            }[]
                           },
"my_threads":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_path": string,"id": string,"last_message": string,"last_message_at": string,"last_sender_is_me": boolean,"muted": boolean,"title": string,"type": Database["public"]['Enums']["chat_thread_type"],"unread": number,"username": string,"venture_id": string
            }[]
                           },
"ops_case":
{ Args: { "p_case": string }; Returns: Json
                           },
"ops_queue":
{ Args: { "p_status"?: string }; Returns: {
              "claimed_by_me": boolean,"claimed_by_name": string,"excerpt": string,"id": string,"last_reported_at": string,"opened_at": string,"owner_name": string,"reasons": (Database["public"]['Enums']["report_reason"])[],"reports": number,"soft_signal": boolean,"status": Database["public"]['Enums']["report_case_status"],"target_type": Database["public"]['Enums']["report_target"]
            }[]
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
"record_github_webhook":
{ Args: { "p_action"?: string,"p_delivery_id": string,"p_event": string,"p_installation_id"?: number,"p_payload": Json }; Returns: boolean
                           },
"record_sign_in":
{ Args: { "p_device_hash": string,"p_ip_hash": string,"p_method": string,"p_user_agent": string }; Returns: Json
                           },
"record_views":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"remove_exam_period":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"remove_venture_deliverable":
{ Args: { "p_deliverable": string }; Returns: boolean
                           },
"remove_venture_member":
{ Args: { "p_member": string,"p_venture": string }; Returns: undefined
                           },
"request_code_check":
{ Args: { "p_skill": string }; Returns: string
                           },
"request_github_resync":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"resolve_case":
{ Args: { "p_action": string,"p_case": string,"p_reason": string,"p_severity"?: string }; Returns: undefined
                           },
"resolve_review_flag":
{ Args: { "p_flag": number,"p_note": string,"p_upheld": boolean }; Returns: boolean
                           },
"respond_friend_request":
{ Args: { "p_accept": boolean,"p_request": string }; Returns: undefined
                           },
"respond_invite":
{ Args: { "p_accept": boolean,"p_invite": string }; Returns: Database["public"]['Enums']["venture_invite_status"]
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
"revoke_invite":
{ Args: { "p_invite": string }; Returns: boolean
                           },
"rsvp_event":
{ Args: { "p_post": string,"p_status": Database["public"]['Enums']["rsvp_status"] }; Returns: undefined
                           },
"save_code_check":
{ Args: { "p_answers": Json,"p_id": string,"p_submit"?: boolean }; Returns: Database["public"]['Enums']["code_check_status"]
                           },
"save_venture_role":
{ Args: { "p_role"?: string,"p_skill_ids": (string)[],"p_slots": number,"p_title": string,"p_venture": string }; Returns: string
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
"search_ventures":
{ Args: { "p_offset"?: number,"p_q": string,"p_skill"?: string,"p_type": Database["public"]['Enums']["venture_type"],"p_university"?: string }; Returns: {
              "created_at": string,"id": string,"members": number,"open_slots": number,"owner_name": string,"owner_username": string,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"],"status": Database["public"]['Enums']["venture_status"],"summary": string,"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_name": string,"visibility": Database["public"]['Enums']["venture_visibility"]
            }[]
                           },
"security_not_me":
{ Args: { "p_token": string }; Returns: Json
                           },
"send_friend_request":
{ Args: { "p_username": string }; Returns: {
              "request_id": string,"status": Database["public"]['Enums']["friend_request_status"]
            }[]
                           },
"send_message":
{ Args: { "p_body": string,"p_media"?: Json,"p_reply_to"?: string,"p_thread": string }; Returns: string
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
"set_read_receipts":
{ Args: { "p_on": boolean }; Returns: undefined
                           },
"set_venture_questions":
{ Args: { "p_questions": (string)[],"p_venture": string }; Returns: undefined
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
"storage_usage":
{ Args: Record<PropertyKey, never>; Returns: {
              "bucket": string,"bytes": number,"objects": number,"quota_bytes": number
            }[]
                           },
"submit_credential":
{ Args: { "p": Json }; Returns: string
                           },
"submit_report":
{ Args: { "p_detail"?: string,"p_messages"?: (string)[],"p_reason": Database["public"]['Enums']["report_reason"],"p_target": string,"p_type": Database["public"]['Enums']["report_target"] }; Returns: undefined
                           },
"survey_for_posts":
{ Args: { "p_ids": (string)[] }; Returns: {
              "answered_at": string,"can_change": boolean,"dimension": string,"my_answer": boolean,"post_id": string,"public_line": Json,"question": string,"question_id": number
            }[]
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
"toggle_reaction":
{ Args: { "p_emoji": string,"p_message": string }; Returns: boolean
                           },
"touch_activity":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"transfer_venture_ownership":
{ Args: { "p_member": string,"p_venture": string }; Returns: undefined
                           },
"transition_venture":
{ Args: { "p_to": Database["public"]['Enums']["venture_status"],"p_venture": string }; Returns: undefined
                           },
"unblock_user":
{ Args: { "p_username": string }; Returns: undefined
                           },
"unfriend":
{ Args: { "p_username": string }; Returns: undefined
                           },
"unread_chat_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"unread_notification_count":
{ Args: Record<PropertyKey, never>; Returns: number
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
"venture_team":
{ Args: { "p_venture": string }; Returns: {
              "avatar_path": string,"full_name": string,"is_owner": boolean,"joined_at": string,"profile_visible": boolean,"team_role": Database["public"]['Enums']["venture_team_role"],"user_id": string,"username": string
            }[]
                           },
"venture_verified_contributors":
{ Args: { "p_venture": string }; Returns: number
                           },
"vote_poll":
{ Args: { "p_position": number,"p_post": string }; Returns: undefined
                           },
"withdraw_application":
{ Args: { "p_thread": string }; Returns: boolean
                           }
          }
          Enums: {
            "account_role": "student"|"faculty"|"recruiter"|"university_admin","anti_gaming_kind": "ring"|"rapid_gain","application_status": "pending"|"accepted"|"declined"|"withdrawn"|"closed","chat_thread_type": "dm"|"group","code_check_status": "preparing"|"ready"|"in_progress"|"submitted"|"passed"|"failed"|"unavailable"|"expired","contribution_kind": "code"|"design"|"research"|"docs"|"management"|"other","contribution_source": "manual"|"github","credential_status": "pending"|"approved"|"rejected"|"expired","cv_visibility": "private"|"link"|"recruiters","domain_kind": "student"|"faculty"|"both","email_channel": "instant_email"|"digest"|"off","friend_request_status": "pending"|"accepted"|"declined","github_commit_status": "pending"|"counted"|"held"|"excluded","github_repo_kind": "owned"|"collaborator"|"fork"|"template","job_run_status": "running"|"succeeded"|"failed","looking_for_option": "internship"|"job"|"teammates"|"project"|"mentorship","post_audience": "university"|"global","post_stage": "seed"|"limited"|"full"|"global_boost"|"demoted"|"held","post_type": "general"|"invite"|"announcement"|"event"|"poll"|"shipped","profile_visibility": "friends"|"university"|"global","ranking_adjustment_kind": "penalty"|"rapid_gain","ranking_tier": "raw"|"spark"|"flare"|"shine"|"radiant"|"luminary","report_case_status": "open"|"dismissed"|"removed"|"warned","report_reason": "spam"|"harassment"|"inappropriate"|"misinformation"|"impersonation"|"other","report_target": "post"|"comment"|"message"|"profile"|"venture","review_flag_kind": "burst"|"backdating"|"cross_account_duplicate","review_flag_status": "open"|"cleared"|"upheld","rsvp_status": "going"|"interested","sanction_kind": "warn"|"suspend"|"ban"|"throttle","skill_category": "language"|"framework"|"library"|"tool"|"platform"|"practice","staff_role": "moderator"|"trust_reviewer"|"accounts"|"super_admin","sync_status": "queued"|"running"|"done"|"failed"|"cancelled","venture_invite_status": "pending"|"accepted"|"declined"|"revoked","venture_stage": "idea"|"prototype"|"launched"|"revenue","venture_status": "recruiting"|"in_progress"|"completed"|"abandoned","venture_team_role": "lead"|"developer"|"designer"|"researcher"|"other","venture_type": "project"|"startup","venture_visibility": "public"|"university"|"unlisted"
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
            "account_role": ["student", "faculty", "recruiter", "university_admin"],"anti_gaming_kind": ["ring", "rapid_gain"],"application_status": ["pending", "accepted", "declined", "withdrawn", "closed"],"chat_thread_type": ["dm", "group"],"code_check_status": ["preparing", "ready", "in_progress", "submitted", "passed", "failed", "unavailable", "expired"],"contribution_kind": ["code", "design", "research", "docs", "management", "other"],"contribution_source": ["manual", "github"],"credential_status": ["pending", "approved", "rejected", "expired"],"cv_visibility": ["private", "link", "recruiters"],"domain_kind": ["student", "faculty", "both"],"email_channel": ["instant_email", "digest", "off"],"friend_request_status": ["pending", "accepted", "declined"],"github_commit_status": ["pending", "counted", "held", "excluded"],"github_repo_kind": ["owned", "collaborator", "fork", "template"],"job_run_status": ["running", "succeeded", "failed"],"looking_for_option": ["internship", "job", "teammates", "project", "mentorship"],"post_audience": ["university", "global"],"post_stage": ["seed", "limited", "full", "global_boost", "demoted", "held"],"post_type": ["general", "invite", "announcement", "event", "poll", "shipped"],"profile_visibility": ["friends", "university", "global"],"ranking_adjustment_kind": ["penalty", "rapid_gain"],"ranking_tier": ["raw", "spark", "flare", "shine", "radiant", "luminary"],"report_case_status": ["open", "dismissed", "removed", "warned"],"report_reason": ["spam", "harassment", "inappropriate", "misinformation", "impersonation", "other"],"report_target": ["post", "comment", "message", "profile", "venture"],"review_flag_kind": ["burst", "backdating", "cross_account_duplicate"],"review_flag_status": ["open", "cleared", "upheld"],"rsvp_status": ["going", "interested"],"sanction_kind": ["warn", "suspend", "ban", "throttle"],"skill_category": ["language", "framework", "library", "tool", "platform", "practice"],"staff_role": ["moderator", "trust_reviewer", "accounts", "super_admin"],"sync_status": ["queued", "running", "done", "failed", "cancelled"],"venture_invite_status": ["pending", "accepted", "declined", "revoked"],"venture_stage": ["idea", "prototype", "launched", "revenue"],"venture_status": ["recruiting", "in_progress", "completed", "abandoned"],"venture_team_role": ["lead", "developer", "designer", "researcher", "other"],"venture_type": ["project", "startup"],"venture_visibility": ["public", "university", "unlisted"]
          }
        }
} as const

