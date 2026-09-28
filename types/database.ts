
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
                    "before_venture": boolean,"commit_sha": string | null,"corrects_id": string | null,"created_at": string,"description": string,"evidence_url": string | null,"hours": number | null,"id": string,"kind": Database["public"]['Enums']["contribution_kind"],"source": Database["public"]['Enums']["contribution_source"],"user_id": string,"venture_id": string
                  }
                  Insert: {
                    "before_venture"?: boolean,"commit_sha"?: string | null,"corrects_id"?: string | null,"created_at"?: string,"description": string,"evidence_url"?: string | null,"hours"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["contribution_kind"],"source"?: Database["public"]['Enums']["contribution_source"],"user_id": string,"venture_id": string
                  }
                  Update: {
                    "before_venture"?: boolean,"commit_sha"?: string | null,"corrects_id"?: string | null,"created_at"?: string,"description"?: string,"evidence_url"?: string | null,"hours"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["contribution_kind"],"source"?: Database["public"]['Enums']["contribution_source"],"user_id"?: string,"venture_id"?: string
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
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"bio": string | null,"campus": string | null,"cover_path": string | null,"created_at": string,"department": string | null,"full_name": string,"graduation_year": number | null,"looking_for": (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete": boolean,"programme": string | null,"recruiter_visible": boolean,"role": Database["public"]['Enums']["account_role"],"university_id": string | null,"updated_at": string,"user_id": string,"username": string | null,"visibility": Database["public"]['Enums']["profile_visibility"]
                  }
                  Insert: {
                    "avatar_path"?: string | null,"bio"?: string | null,"campus"?: string | null,"cover_path"?: string | null,"created_at"?: string,"department"?: string | null,"full_name": string,"graduation_year"?: number | null,"looking_for"?: (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete"?: boolean,"programme"?: string | null,"recruiter_visible"?: boolean,"role"?: Database["public"]['Enums']["account_role"],"university_id"?: string | null,"updated_at"?: string,"user_id": string,"username"?: string | null,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Update: {
                    "avatar_path"?: string | null,"bio"?: string | null,"campus"?: string | null,"cover_path"?: string | null,"created_at"?: string,"department"?: string | null,"full_name"?: string,"graduation_year"?: number | null,"looking_for"?: (Database["public"]['Enums']["looking_for_option"])[],"onboarding_complete"?: boolean,"programme"?: string | null,"recruiter_visible"?: boolean,"role"?: Database["public"]['Enums']["account_role"],"university_id"?: string | null,"updated_at"?: string,"user_id"?: string,"username"?: string | null,"visibility"?: Database["public"]['Enums']["profile_visibility"]
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
                    "department": string | null,"full_name": string,"graduation_year": number | null,"user_id": string,"username": string | null
                  }
                  Insert: {
                    "department"?: string | null,"full_name": string,"graduation_year"?: number | null,"user_id": string,"username"?: string | null
                  }
                  Update: {
                    "department"?: string | null,"full_name"?: string,"graduation_year"?: number | null,"user_id"?: string,"username"?: string | null
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
                },"review_flags": {
                  Row: {
                    "created_at": string,"id": number,"key": string,"kind": Database["public"]['Enums']["review_flag_kind"],"note": string | null,"refs": NonNullable<Json>,"resolved_at": string | null,"reviewer_id": string | null,"status": Database["public"]['Enums']["review_flag_status"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"key": string,"kind": Database["public"]['Enums']["review_flag_kind"],"note"?: string | null,"refs"?: NonNullable<Json>,"resolved_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"key"?: string,"kind"?: Database["public"]['Enums']["review_flag_kind"],"note"?: string | null,"refs"?: NonNullable<Json>,"resolved_at"?: string | null,"reviewer_id"?: string | null,"status"?: Database["public"]['Enums']["review_flag_status"],"user_id"?: string
                  }
                  Relationships: [
                    
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
                },"user_skills": {
                  Row: {
                    "active_days": number,"hits": number,"last_used_at": string | null,"level": number,"lines": number,"repos": number,"skill_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "active_days"?: number,"hits"?: number,"last_used_at"?: string | null,"level": number,"lines"?: number,"repos"?: number,"skill_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_days"?: number,"hits"?: number,"last_used_at"?: string | null,"level"?: number,"lines"?: number,"repos"?: number,"skill_id"?: string,"updated_at"?: string,"user_id"?: string
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
                    "abandoned_at": string | null,"affiliation": string | null,"completed_at": string | null,"created_at": string,"description": string,"id": string,"owner_id": string,"pitch_url": string | null,"repo_full_name": string | null,"repo_id": number | null,"skill_ids": (string)[],"stage": Database["public"]['Enums']["venture_stage"] | null,"status": Database["public"]['Enums']["venture_status"],"team_size": number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"updated_at": string,"visibility": Database["public"]['Enums']["venture_visibility"]
                  }
                  Insert: {
                    "abandoned_at"?: string | null,"affiliation"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description": string,"id"?: string,"owner_id": string,"pitch_url"?: string | null,"repo_full_name"?: string | null,"repo_id"?: number | null,"skill_ids"?: (string)[],"stage"?: Database["public"]['Enums']["venture_stage"] | null,"status"?: Database["public"]['Enums']["venture_status"],"team_size"?: number,"title": string,"type": Database["public"]['Enums']["venture_type"],"university_id": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["venture_visibility"]
                  }
                  Update: {
                    "abandoned_at"?: string | null,"affiliation"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"owner_id"?: string,"pitch_url"?: string | null,"repo_full_name"?: string | null,"repo_id"?: number | null,"skill_ids"?: (string)[],"stage"?: Database["public"]['Enums']["venture_stage"] | null,"status"?: Database["public"]['Enums']["venture_status"],"team_size"?: number,"title"?: string,"type"?: Database["public"]['Enums']["venture_type"],"university_id"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["venture_visibility"]
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
                    "before_venture": boolean | null,"by_member": boolean | null,"commit_sha": string | null,"confirmations": number | null,"confirmed_by_me": boolean | null,"corrected_at": string | null,"created_at": string | null,"current_id": string | null,"description": string | null,"evidence_url": string | null,"hours": number | null,"id": string | null,"kind": Database["public"]['Enums']["contribution_kind"] | null,"peer_verified": boolean | null,"source": Database["public"]['Enums']["contribution_source"] | null,"user_id": string | null,"venture_id": string | null
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
"add_venture_deliverable":
{ Args: { "p_label": string,"p_url": string,"p_venture": string }; Returns: string
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
"complete_onboarding":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"confirm_contribution":
{ Args: { "p_entry": string }; Returns: boolean
                           },
"correct_contribution":
{ Args: { "p_description": string,"p_evidence_url"?: string,"p_hours"?: number,"p_kind": Database["public"]['Enums']["contribution_kind"],"p_original": string }; Returns: string
                           },
"create_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"create_venture":
{ Args: { "p": Json }; Returns: string
                           },
"decide_application":
{ Args: { "p_accept": boolean,"p_thread": string }; Returns: Database["public"]['Enums']["application_status"]
                           },
"delete_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: undefined
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
"follow_venture":
{ Args: { "p_follow": boolean,"p_venture": string }; Returns: boolean
                           },
"friendship_state":
{ Args: { "p_username": string }; Returns: {
              "request_id": string,"state": string
            }[]
                           },
"get_profile_card":
{ Args: { "p_username": string }; Returns: {
              "department": string,"full_name": string,"graduation_year": number,"username": string
            }[]
                           },
"health_check":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"leave_venture":
{ Args: { "p_venture": string }; Returns: undefined
                           },
"link_venture_repo":
{ Args: { "p_repo"?: number,"p_venture": string }; Returns: undefined
                           },
"log_contribution":
{ Args: { "p_description": string,"p_evidence_url"?: string,"p_hours"?: number,"p_kind": Database["public"]['Enums']["contribution_kind"],"p_venture": string }; Returns: string
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
"mfa_backup_codes_remaining":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_blocks":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"full_name": string,"username": string
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
"my_skills":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_days": number,"hits": number,"last_used_at": string,"level": number,"lines": number,"repos": number,"skill_id": string
            }[]
                           },
"pending_friend_request_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"post_venture_update":
{ Args: { "p_body": string,"p_venture": string }; Returns: string
                           },
"profile_ventures":
{ Args: { "p_user": string }; Returns: {
              "id": string,"is_owner": boolean,"joined_at": string,"status": Database["public"]['Enums']["venture_status"],"team_role": Database["public"]['Enums']["venture_team_role"],"title": string,"type": Database["public"]['Enums']["venture_type"]
            }[]
                           },
"rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"record_github_webhook":
{ Args: { "p_action"?: string,"p_delivery_id": string,"p_event": string,"p_installation_id"?: number,"p_payload": Json }; Returns: boolean
                           },
"record_sign_in":
{ Args: { "p_device_hash": string,"p_ip_hash": string,"p_method": string,"p_user_agent": string }; Returns: Json
                           },
"remove_venture_deliverable":
{ Args: { "p_deliverable": string }; Returns: boolean
                           },
"remove_venture_member":
{ Args: { "p_member": string,"p_venture": string }; Returns: undefined
                           },
"request_github_resync":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"review_flag_details":
{ Args: { "p_flag": number }; Returns: {
              "commits": number,"created_at": string,"id": number,"kind": Database["public"]['Enums']["review_flag_kind"],"refs": Json,"status": Database["public"]['Enums']["review_flag_status"],"user_id": string
            }[]
                           },
"revoke_invite":
{ Args: { "p_invite": string }; Returns: boolean
                           },
"save_venture_role":
{ Args: { "p_role"?: string,"p_skill_ids": (string)[],"p_slots": number,"p_title": string,"p_venture": string }; Returns: string
                           },
"security_not_me":
{ Args: { "p_token": string }; Returns: Json
                           },
"send_friend_request":
{ Args: { "p_username": string }; Returns: {
              "request_id": string,"status": Database["public"]['Enums']["friend_request_status"]
            }[]
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
"set_venture_questions":
{ Args: { "p_questions": (string)[],"p_venture": string }; Returns: undefined
                           },
"signin_failed":
{ Args: { "p_email": string,"p_ip_hash": string }; Returns: Json
                           },
"signin_status":
{ Args: { "p_email": string,"p_ip_hash": string }; Returns: Json
                           },
"start_github_link":
{ Args: { "p_code": string,"p_installation_id"?: number }; Returns: string
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
"withdraw_application":
{ Args: { "p_thread": string }; Returns: boolean
                           }
          }
          Enums: {
            "account_role": "student"|"faculty"|"recruiter"|"university_admin","application_status": "pending"|"accepted"|"declined"|"withdrawn"|"closed","contribution_kind": "code"|"design"|"research"|"docs"|"management"|"other","contribution_source": "manual"|"github","domain_kind": "student"|"faculty"|"both","email_channel": "instant_email"|"digest"|"off","friend_request_status": "pending"|"accepted"|"declined","github_commit_status": "pending"|"counted"|"held"|"excluded","github_repo_kind": "owned"|"collaborator"|"fork"|"template","job_run_status": "running"|"succeeded"|"failed","looking_for_option": "internship"|"job"|"teammates"|"project"|"mentorship","profile_visibility": "friends"|"university"|"global","review_flag_kind": "burst"|"backdating"|"cross_account_duplicate","review_flag_status": "open"|"cleared"|"upheld","skill_category": "language"|"framework"|"library"|"tool"|"platform"|"practice","staff_role": "moderator"|"trust_reviewer"|"accounts"|"super_admin","sync_status": "queued"|"running"|"done"|"failed"|"cancelled","venture_invite_status": "pending"|"accepted"|"declined"|"revoked","venture_stage": "idea"|"prototype"|"launched"|"revenue","venture_status": "recruiting"|"in_progress"|"completed"|"abandoned","venture_team_role": "lead"|"developer"|"designer"|"researcher"|"other","venture_type": "project"|"startup","venture_visibility": "public"|"university"|"unlisted"
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
            "account_role": ["student", "faculty", "recruiter", "university_admin"],"application_status": ["pending", "accepted", "declined", "withdrawn", "closed"],"contribution_kind": ["code", "design", "research", "docs", "management", "other"],"contribution_source": ["manual", "github"],"domain_kind": ["student", "faculty", "both"],"email_channel": ["instant_email", "digest", "off"],"friend_request_status": ["pending", "accepted", "declined"],"github_commit_status": ["pending", "counted", "held", "excluded"],"github_repo_kind": ["owned", "collaborator", "fork", "template"],"job_run_status": ["running", "succeeded", "failed"],"looking_for_option": ["internship", "job", "teammates", "project", "mentorship"],"profile_visibility": ["friends", "university", "global"],"review_flag_kind": ["burst", "backdating", "cross_account_duplicate"],"review_flag_status": ["open", "cleared", "upheld"],"skill_category": ["language", "framework", "library", "tool", "platform", "practice"],"staff_role": ["moderator", "trust_reviewer", "accounts", "super_admin"],"sync_status": ["queued", "running", "done", "failed", "cancelled"],"venture_invite_status": ["pending", "accepted", "declined", "revoked"],"venture_stage": ["idea", "prototype", "launched", "revenue"],"venture_status": ["recruiting", "in_progress", "completed", "abandoned"],"venture_team_role": ["lead", "developer", "designer", "researcher", "other"],"venture_type": ["project", "startup"],"venture_visibility": ["public", "university", "unlisted"]
          }
        }
} as const

