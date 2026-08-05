export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          audience: string
          bounced_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_type: string | null
          expose_path: string | null
          id: string
          mail_type: string
          metadata: Json
          mobile_ad_draft_id: string | null
          mobile_ad_id: string | null
          opened_at: string | null
          provider: string | null
          provider_message_id: string | null
          provider_response: Json | null
          recipients: string[]
          sent_at: string | null
          status: string
          story_id: string | null
          subject: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          audience?: string
          bounced_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string | null
          expose_path?: string | null
          id?: string
          mail_type: string
          metadata?: Json
          mobile_ad_draft_id?: string | null
          mobile_ad_id?: string | null
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          recipients?: string[]
          sent_at?: string | null
          status?: string
          story_id?: string | null
          subject?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          audience?: string
          bounced_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string | null
          expose_path?: string | null
          id?: string
          mail_type?: string
          metadata?: Json
          mobile_ad_draft_id?: string | null
          mobile_ad_id?: string | null
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          recipients?: string[]
          sent_at?: string | null
          status?: string
          story_id?: string | null
          subject?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expose_generation_failures: {
        Row: {
          context: string | null
          created_at: string
          error_message: string
          id: string
          vehicle_id: string | null
          vehicle_title: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          error_message: string
          id?: string
          vehicle_id?: string | null
          vehicle_title?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          error_message?: string
          id?: string
          vehicle_id?: string | null
          vehicle_title?: string | null
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          created_at: string
          email: string
          first_name: string
          gdpr_accepted: boolean
          id: string
          ip_address: string | null
          last_name: string
          message: string | null
          phone: string | null
          preferred_contact: string | null
          salutation: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          gdpr_accepted?: boolean
          id?: string
          ip_address?: string | null
          last_name: string
          message?: string | null
          phone?: string | null
          preferred_contact?: string | null
          salutation?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          gdpr_accepted?: boolean
          id?: string
          ip_address?: string | null
          last_name?: string
          message?: string | null
          phone?: string | null
          preferred_contact?: string | null
          salutation?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      inquiry_vehicles: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string
          vehicle_id: string
          vehicle_snapshot: Json
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id: string
          vehicle_id: string
          vehicle_snapshot: Json
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string
          vehicle_id?: string
          vehicle_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_vehicles_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_tasks: {
        Row: {
          action: Database["public"]["Enums"]["listing_task_action"]
          created_at: string
          dismissed_at: string | null
          done_at: string | null
          done_by: string | null
          id: string
          listing_id: string | null
          reason: string | null
          vehicle_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["listing_task_action"]
          created_at?: string
          dismissed_at?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          listing_id?: string | null
          reason?: string | null
          vehicle_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["listing_task_action"]
          created_at?: string
          dismissed_at?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          listing_id?: string | null
          reason?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_tasks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_tasks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          account_key: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          external_ad_id: string | null
          external_url: string | null
          id: string
          is_manual: boolean
          last_checked_at: string | null
          last_pushed_at: string | null
          note: string | null
          platform: Database["public"]["Enums"]["listing_platform"]
          published_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          account_key?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          external_ad_id?: string | null
          external_url?: string | null
          id?: string
          is_manual?: boolean
          last_checked_at?: string | null
          last_pushed_at?: string | null
          note?: string | null
          platform: Database["public"]["Enums"]["listing_platform"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          account_key?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          external_ad_id?: string | null
          external_url?: string | null
          id?: string
          is_manual?: boolean
          last_checked_at?: string | null
          last_pushed_at?: string | null
          note?: string | null
          platform?: Database["public"]["Enums"]["listing_platform"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_guard_log: {
        Row: {
          context: string
          created_at: string
          detail: string | null
          id: string
          offending_field: string
          offending_value: string
        }
        Insert: {
          context: string
          created_at?: string
          detail?: string | null
          id?: string
          offending_field: string
          offending_value: string
        }
        Update: {
          context?: string
          created_at?: string
          detail?: string | null
          id?: string
          offending_field?: string
          offending_value?: string
        }
        Relationships: []
      }
      mail_settings: {
        Row: {
          id: number
          inquiry_inbox: string
          reply_to_customer: string
          reply_to_internal: string | null
          sender_address: string
          sender_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          inquiry_inbox?: string
          reply_to_customer?: string
          reply_to_internal?: string | null
          sender_address?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          inquiry_inbox?: string
          reply_to_customer?: string
          reply_to_internal?: string | null
          sender_address?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mobile_ad_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          error_message: string | null
          id: string
          image_paths: string[] | null
          mobile_ad_id: string | null
          payload: Json
          publish_email_error: string | null
          publish_email_last_attempt_at: string | null
          publish_email_sent_at: string | null
          publish_email_status: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          error_message?: string | null
          id?: string
          image_paths?: string[] | null
          mobile_ad_id?: string | null
          payload?: Json
          publish_email_error?: string | null
          publish_email_last_attempt_at?: string | null
          publish_email_sent_at?: string | null
          publish_email_status?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          error_message?: string | null
          id?: string
          image_paths?: string[] | null
          mobile_ad_id?: string | null
          payload?: Json
          publish_email_error?: string | null
          publish_email_last_attempt_at?: string | null
          publish_email_sent_at?: string | null
          publish_email_status?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      mobile_de_label_map: {
        Row: {
          field: string
          key: string
          label: string
          prio: number
        }
        Insert: {
          field: string
          key: string
          label: string
          prio?: number
        }
        Update: {
          field?: string
          key?: string
          label?: string
          prio?: number
        }
        Relationships: []
      }
      mobile_push_log: {
        Row: {
          action: string
          created_at: string
          id: string
          request_body: Json | null
          response_body: string | null
          response_status: number | null
          vehicle_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          request_body?: Json | null
          response_body?: string | null
          response_status?: number | null
          vehicle_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          request_body?: Json | null
          response_body?: string | null
          response_status?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobile_push_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_reconciliation_issues: {
        Row: {
          detail: string | null
          detected_at: string
          id: string
          issue_type: string
          mobile_ad_id: string | null
          resolved_at: string | null
          scope: string
          severity: string
          vehicle_id: string | null
        }
        Insert: {
          detail?: string | null
          detected_at?: string
          id?: string
          issue_type: string
          mobile_ad_id?: string | null
          resolved_at?: string | null
          scope?: string
          severity?: string
          vehicle_id?: string | null
        }
        Update: {
          detail?: string | null
          detected_at?: string
          id?: string
          issue_type?: string
          mobile_ad_id?: string | null
          resolved_at?: string | null
          scope?: string
          severity?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobile_reconciliation_issues_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          payload: Json
          send_error: string | null
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          payload?: Json
          send_error?: string | null
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          payload?: Json
          send_error?: string | null
          sent_at?: string | null
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          created_at: string
          email: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          email: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          digest_mode: Database["public"]["Enums"]["digest_mode"]
          event_type: Database["public"]["Enums"]["notification_event_type"]
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          digest_mode?: Database["public"]["Enums"]["digest_mode"]
          event_type: Database["public"]["Enums"]["notification_event_type"]
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          digest_mode?: Database["public"]["Enums"]["digest_mode"]
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_accounts: {
        Row: {
          account_key: string
          created_at: string
          default_for_categories: string[]
          id: string
          is_active: boolean
          label: string
          password_secret_name: string | null
          platform: Database["public"]["Enums"]["listing_platform"]
          seller_id: string | null
          sort_order: number
          updated_at: string
          username_secret_name: string | null
        }
        Insert: {
          account_key: string
          created_at?: string
          default_for_categories?: string[]
          id?: string
          is_active?: boolean
          label: string
          password_secret_name?: string | null
          platform: Database["public"]["Enums"]["listing_platform"]
          seller_id?: string | null
          sort_order?: number
          updated_at?: string
          username_secret_name?: string | null
        }
        Update: {
          account_key?: string
          created_at?: string
          default_for_categories?: string[]
          id?: string
          is_active?: boolean
          label?: string
          password_secret_name?: string | null
          platform?: Database["public"]["Enums"]["listing_platform"]
          seller_id?: string | null
          sort_order?: number
          updated_at?: string
          username_secret_name?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          id: string
          price: number
          recorded_at: string
          vehicle_id: string
        }
        Insert: {
          id?: string
          price: number
          recorded_at?: string
          vehicle_id: string
        }
        Update: {
          id?: string
          price?: number
          recorded_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_locks: {
        Row: {
          lock_name: string
          locked_at: string
          locked_until: string
        }
        Insert: {
          lock_name: string
          locked_at?: string
          locked_until: string
        }
        Update: {
          lock_name?: string
          locked_at?: string
          locked_until?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          mobile_total_results: number | null
          page_size: number | null
          pages_fetched: number | null
          price_changes: number | null
          quality_issues_found: number | null
          started_at: string
          status: string | null
          stop_reason: string | null
          sync_name: string
          vehicles_added: number | null
          vehicles_marked_sold: number | null
          vehicles_total: number | null
          vehicles_unchanged: number | null
          vehicles_updated: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          mobile_total_results?: number | null
          page_size?: number | null
          pages_fetched?: number | null
          price_changes?: number | null
          quality_issues_found?: number | null
          started_at?: string
          status?: string | null
          stop_reason?: string | null
          sync_name: string
          vehicles_added?: number | null
          vehicles_marked_sold?: number | null
          vehicles_total?: number | null
          vehicles_unchanged?: number | null
          vehicles_updated?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          mobile_total_results?: number | null
          page_size?: number | null
          pages_fetched?: number | null
          price_changes?: number | null
          quality_issues_found?: number | null
          started_at?: string
          status?: string | null
          stop_reason?: string | null
          sync_name?: string
          vehicles_added?: number | null
          vehicles_marked_sold?: number | null
          vehicles_total?: number | null
          vehicles_unchanged?: number | null
          vehicles_updated?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_alerts: {
        Row: {
          body_type: string | null
          brand: string | null
          category: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_notified_at: string | null
          max_mileage: number | null
          max_price: number | null
          message: string | null
          min_year: string | null
          name: string | null
        }
        Insert: {
          body_type?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          max_mileage?: number | null
          max_price?: number | null
          message?: string | null
          min_year?: string | null
          name?: string | null
        }
        Update: {
          body_type?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          max_mileage?: number | null
          max_price?: number | null
          message?: string | null
          min_year?: string | null
          name?: string | null
        }
        Relationships: []
      }
      vehicle_audit_log: {
        Row: {
          action: string
          created_at: string
          field: string | null
          id: string
          new_value: string | null
          old_value: string | null
          user_email: string | null
          user_id: string | null
          vehicle_id: string
        }
        Insert: {
          action: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_email?: string | null
          user_id?: string | null
          vehicle_id: string
        }
        Update: {
          action?: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_email?: string | null
          user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_audit_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_exposes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          pdf_url: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_price_history: {
        Row: {
          currency: string
          id: string
          price: number | null
          recorded_at: string
          vehicle_id: string
        }
        Insert: {
          currency?: string
          id?: string
          price?: number | null
          recorded_at?: string
          vehicle_id: string
        }
        Update: {
          currency?: string
          id?: string
          price?: number | null
          recorded_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_price_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_private_data: {
        Row: {
          updated_at: string
          vehicle_id: string
          vin: string | null
        }
        Insert: {
          updated_at?: string
          vehicle_id: string
          vin?: string | null
        }
        Update: {
          updated_at?: string
          vehicle_id?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_private_data_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_quality_issues: {
        Row: {
          detail: string | null
          detected_at: string
          id: string
          issue_type: string
          resolved_at: string | null
          severity: string
          vehicle_id: string
        }
        Insert: {
          detail?: string | null
          detected_at?: string
          id?: string
          issue_type: string
          resolved_at?: string | null
          severity?: string
          vehicle_id: string
        }
        Update: {
          detail?: string | null
          detected_at?: string
          id?: string
          issue_type?: string
          resolved_at?: string | null
          severity?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_quality_issues_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_stories: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          sent_at: string | null
          sent_to_dealer: boolean
          story_image_url: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          sent_at?: string | null
          sent_to_dealer?: boolean
          story_image_url: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          sent_at?: string | null
          sent_to_dealer?: boolean
          story_image_url?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          body_type: string | null
          body_type_key: string | null
          body_type_label: string | null
          brand: string | null
          category: string | null
          climatisation: string | null
          climatisation_key: string | null
          climatisation_label: string | null
          condition: string | null
          condition_key: string | null
          condition_label: string | null
          created_at: string
          creation_date: string | null
          cubic_capacity: number | null
          currency: string | null
          custom_image_urls: string[] | null
          damage_unrepaired: boolean | null
          description: string | null
          detail_page_url: string | null
          exterior_color: string | null
          exterior_color_key: string | null
          exterior_color_label: string | null
          fuel: string | null
          fuel_key: string | null
          fuel_label: string | null
          gearbox: string | null
          gearbox_key: string | null
          gearbox_label: string | null
          hidden_image_urls: string[] | null
          id: string
          image_order: string[] | null
          image_urls: string[] | null
          interior_color: string | null
          interior_type: string | null
          interior_type_key: string | null
          interior_type_label: string | null
          is_featured: boolean
          is_sold: boolean
          last_pushed_at: string | null
          manual_overrides: Json
          mileage: number | null
          mobile_ad_id: string | null
          mobile_de_id: string
          mobile_payload: Json | null
          model: string | null
          model_description: string | null
          modification_date: string | null
          new_sync_email_error: string | null
          new_sync_email_last_attempt_at: string | null
          new_sync_email_sent_at: string | null
          new_sync_email_status: string | null
          num_seats: number | null
          power: number | null
          price: number | null
          price_type: string | null
          publish_error: string | null
          publish_status: Database["public"]["Enums"]["publish_status"] | null
          published_at: string | null
          reserved_at: string | null
          reserved_note: string | null
          seller_city: string | null
          seller_zipcode: string | null
          sold_at: string | null
          source: string
          synced_at: string
          title: string
          updated_at: string
          usage_type: string | null
          usage_type_key: string | null
          usage_type_label: string | null
          vatable: boolean | null
          vehicle_category: string | null
          year: string | null
        }
        Insert: {
          body_type?: string | null
          body_type_key?: string | null
          body_type_label?: string | null
          brand?: string | null
          category?: string | null
          climatisation?: string | null
          climatisation_key?: string | null
          climatisation_label?: string | null
          condition?: string | null
          condition_key?: string | null
          condition_label?: string | null
          created_at?: string
          creation_date?: string | null
          cubic_capacity?: number | null
          currency?: string | null
          custom_image_urls?: string[] | null
          damage_unrepaired?: boolean | null
          description?: string | null
          detail_page_url?: string | null
          exterior_color?: string | null
          exterior_color_key?: string | null
          exterior_color_label?: string | null
          fuel?: string | null
          fuel_key?: string | null
          fuel_label?: string | null
          gearbox?: string | null
          gearbox_key?: string | null
          gearbox_label?: string | null
          hidden_image_urls?: string[] | null
          id?: string
          image_order?: string[] | null
          image_urls?: string[] | null
          interior_color?: string | null
          interior_type?: string | null
          interior_type_key?: string | null
          interior_type_label?: string | null
          is_featured?: boolean
          is_sold?: boolean
          last_pushed_at?: string | null
          manual_overrides?: Json
          mileage?: number | null
          mobile_ad_id?: string | null
          mobile_de_id: string
          mobile_payload?: Json | null
          model?: string | null
          model_description?: string | null
          modification_date?: string | null
          new_sync_email_error?: string | null
          new_sync_email_last_attempt_at?: string | null
          new_sync_email_sent_at?: string | null
          new_sync_email_status?: string | null
          num_seats?: number | null
          power?: number | null
          price?: number | null
          price_type?: string | null
          publish_error?: string | null
          publish_status?: Database["public"]["Enums"]["publish_status"] | null
          published_at?: string | null
          reserved_at?: string | null
          reserved_note?: string | null
          seller_city?: string | null
          seller_zipcode?: string | null
          sold_at?: string | null
          source?: string
          synced_at?: string
          title: string
          updated_at?: string
          usage_type?: string | null
          usage_type_key?: string | null
          usage_type_label?: string | null
          vatable?: boolean | null
          vehicle_category?: string | null
          year?: string | null
        }
        Update: {
          body_type?: string | null
          body_type_key?: string | null
          body_type_label?: string | null
          brand?: string | null
          category?: string | null
          climatisation?: string | null
          climatisation_key?: string | null
          climatisation_label?: string | null
          condition?: string | null
          condition_key?: string | null
          condition_label?: string | null
          created_at?: string
          creation_date?: string | null
          cubic_capacity?: number | null
          currency?: string | null
          custom_image_urls?: string[] | null
          damage_unrepaired?: boolean | null
          description?: string | null
          detail_page_url?: string | null
          exterior_color?: string | null
          exterior_color_key?: string | null
          exterior_color_label?: string | null
          fuel?: string | null
          fuel_key?: string | null
          fuel_label?: string | null
          gearbox?: string | null
          gearbox_key?: string | null
          gearbox_label?: string | null
          hidden_image_urls?: string[] | null
          id?: string
          image_order?: string[] | null
          image_urls?: string[] | null
          interior_color?: string | null
          interior_type?: string | null
          interior_type_key?: string | null
          interior_type_label?: string | null
          is_featured?: boolean
          is_sold?: boolean
          last_pushed_at?: string | null
          manual_overrides?: Json
          mileage?: number | null
          mobile_ad_id?: string | null
          mobile_de_id?: string
          mobile_payload?: Json | null
          model?: string | null
          model_description?: string | null
          modification_date?: string | null
          new_sync_email_error?: string | null
          new_sync_email_last_attempt_at?: string | null
          new_sync_email_sent_at?: string | null
          new_sync_email_status?: string | null
          num_seats?: number | null
          power?: number | null
          price?: number | null
          price_type?: string | null
          publish_error?: string | null
          publish_status?: Database["public"]["Enums"]["publish_status"] | null
          published_at?: string | null
          reserved_at?: string | null
          reserved_note?: string | null
          seller_city?: string | null
          seller_zipcode?: string | null
          sold_at?: string | null
          source?: string
          synced_at?: string
          title?: string
          updated_at?: string
          usage_type?: string | null
          usage_type_key?: string | null
          usage_type_label?: string | null
          vatable?: boolean | null
          vehicle_category?: string | null
          year?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vehicle_listing_overview: {
        Row: {
          error_count: number | null
          listings: Json | null
          live_count: number | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_user_is_admin: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mobile_de_resolve_key: {
        Args: { _field: string; _value: string }
        Returns: string
      }
      mobile_de_resolve_label: {
        Args: { _field: string; _value: string }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer" | "seller"
      digest_mode: "immediate" | "daily"
      listing_platform: "mobile_de" | "autoscout24" | "kleinanzeigen"
      listing_status:
        | "not_listed"
        | "draft"
        | "publishing"
        | "live"
        | "error"
        | "paused"
        | "ended"
      listing_task_action:
        | "end_listing"
        | "update_price"
        | "mark_reserved"
        | "reactivate"
      notification_event_type:
        | "inquiry_received"
        | "vehicle_sold"
        | "vehicle_published"
        | "publish_failed"
        | "story_generated"
        | "expose_created"
        | "quality_report"
        | "open_tasks_reminder"
      publish_status:
        | "draft"
        | "publishing"
        | "published"
        | "publish_error"
        | "unpublished"
        | "out_of_sync"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer", "seller"],
      digest_mode: ["immediate", "daily"],
      listing_platform: ["mobile_de", "autoscout24", "kleinanzeigen"],
      listing_status: [
        "not_listed",
        "draft",
        "publishing",
        "live",
        "error",
        "paused",
        "ended",
      ],
      listing_task_action: [
        "end_listing",
        "update_price",
        "mark_reserved",
        "reactivate",
      ],
      notification_event_type: [
        "inquiry_received",
        "vehicle_sold",
        "vehicle_published",
        "publish_failed",
        "story_generated",
        "expose_created",
        "quality_report",
        "open_tasks_reminder",
      ],
      publish_status: [
        "draft",
        "publishing",
        "published",
        "publish_error",
        "unpublished",
        "out_of_sync",
      ],
    },
  },
} as const
