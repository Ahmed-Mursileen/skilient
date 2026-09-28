
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
                    "created_at": string,"default_branch": string | null,"fork": boolean,"full_name": string,"owner_id": number,"parent_full_name": string | null,"private": boolean,"pushed_at": string | null,"repo_id": number,"template_full_name": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"default_branch"?: string | null,"fork"?: boolean,"full_name": string,"owner_id": number,"parent_full_name"?: string | null,"private": boolean,"pushed_at"?: string | null,"repo_id": number,"template_full_name"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_branch"?: string | null,"fork"?: boolean,"full_name"?: string,"owner_id"?: number,"parent_full_name"?: string | null,"private"?: boolean,"pushed_at"?: string | null,"repo_id"?: number,"template_full_name"?: string | null,"updated_at"?: string
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
                    "classified_at": string | null,"discovered_at": string,"excluded": boolean,"installation_id": number,"kind": Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at": string | null,"repo_id": number,"user_id": string
                  }
                  Insert: {
                    "classified_at"?: string | null,"discovered_at"?: string,"excluded"?: boolean,"installation_id": number,"kind"?: Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at"?: string | null,"repo_id": number,"user_id": string
                  }
                  Update: {
                    "classified_at"?: string | null,"discovered_at"?: string,"excluded"?: boolean,"installation_id"?: number,"kind"?: Database["public"]['Enums']["github_repo_kind"] | null,"last_synced_at"?: string | null,"repo_id"?: number,"user_id"?: string
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
                    "commits_analysed": number,"created_at": string,"error": string | null,"finished_at": string | null,"id": number,"repos_done": number,"repos_total": number,"skills_found": number,"stage": string | null,"status": Database["public"]['Enums']["sync_status"],"trigger": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "commits_analysed"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"repos_done"?: number,"repos_total"?: number,"skills_found"?: number,"stage"?: string | null,"status"?: Database["public"]['Enums']["sync_status"],"trigger": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "commits_analysed"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"repos_done"?: number,"repos_total"?: number,"skills_found"?: number,"stage"?: string | null,"status"?: Database["public"]['Enums']["sync_status"],"trigger"?: string,"updated_at"?: string,"user_id"?: string
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "complete_onboarding":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"create_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"delete_mfa_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"disconnect_github":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"is_staff":
{ Args: { "p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"job_run_finish":
{ Args: { "p_error"?: string,"p_id": string,"p_rows"?: number,"p_status": Database["public"]['Enums']["job_run_status"] }; Returns: undefined
                           },
"job_run_start":
{ Args: { "p_job": string,"p_meta"?: Json }; Returns: string
                           },
"log_security_event":
{ Args: { "p_ip_hash": string,"p_kind": string,"p_user_agent": string }; Returns: undefined
                           },
"mfa_backup_codes_remaining":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_gate_state":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"request_github_resync":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"security_not_me":
{ Args: { "p_token": string }; Returns: Json
                           },
"set_my_university":
{ Args: { "p_university_id": string }; Returns: boolean
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
"use_mfa_backup_code":
{ Args: { "p_code": string }; Returns: boolean
                           },
"username_available":
{ Args: { "p_username": string }; Returns: boolean
                           }
          }
          Enums: {
            "account_role": "student"|"faculty"|"recruiter"|"university_admin","domain_kind": "student"|"faculty"|"both","github_repo_kind": "owned"|"collaborator"|"fork"|"template","job_run_status": "running"|"succeeded"|"failed","looking_for_option": "internship"|"job"|"teammates"|"project"|"mentorship","profile_visibility": "friends"|"university"|"global","staff_role": "moderator"|"trust_reviewer"|"accounts"|"super_admin","sync_status": "queued"|"running"|"done"|"failed"|"cancelled"
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
            "account_role": ["student", "faculty", "recruiter", "university_admin"],"domain_kind": ["student", "faculty", "both"],"github_repo_kind": ["owned", "collaborator", "fork", "template"],"job_run_status": ["running", "succeeded", "failed"],"looking_for_option": ["internship", "job", "teammates", "project", "mentorship"],"profile_visibility": ["friends", "university", "global"],"staff_role": ["moderator", "trust_reviewer", "accounts", "super_admin"],"sync_status": ["queued", "running", "done", "failed", "cancelled"]
          }
        }
} as const

