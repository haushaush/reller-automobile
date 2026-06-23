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
          publish_email_sent_at?: string | null
          publish_email_status?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
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
          started_at: string
          status: string | null
          stop_reason: string | null
          sync_name: string
          vehicles_added: number | null
          vehicles_marked_sold: number | null
          vehicles_total: number | null
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
          started_at?: string
          status?: string | null
          stop_reason?: string | null
          sync_name: string
          vehicles_added?: number | null
          vehicles_marked_sold?: number | null
          vehicles_total?: number | null
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
          started_at?: string
          status?: string | null
          stop_reason?: string | null
          sync_name?: string
          vehicles_added?: number | null
          vehicles_marked_sold?: number | null
          vehicles_total?: number | null
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
          brand: string | null
          category: string | null
          climatisation: string | null
          condition: string | null
          created_at: string
          creation_date: string | null
          cubic_capacity: number | null
          currency: string | null
          damage_unrepaired: boolean | null
          description: string | null
          detail_page_url: string | null
          exterior_color: string | null
          fuel: string | null
          gearbox: string | null
          id: string
          image_urls: string[] | null
          interior_color: string | null
          interior_type: string | null
          is_sold: boolean
          mileage: number | null
          mobile_de_id: string
          model: string | null
          model_description: string | null
          modification_date: string | null
          num_seats: number | null
          power: number | null
          price: number | null
          price_type: string | null
          seller_city: string | null
          seller_zipcode: string | null
          sold_at: string | null
          source: string
          synced_at: string
          title: string
          updated_at: string
          usage_type: string | null
          vatable: boolean | null
          vehicle_category: string | null
          vin: string | null
          year: string | null
        }
        Insert: {
          body_type?: string | null
          brand?: string | null
          category?: string | null
          climatisation?: string | null
          condition?: string | null
          created_at?: string
          creation_date?: string | null
          cubic_capacity?: number | null
          currency?: string | null
          damage_unrepaired?: boolean | null
          description?: string | null
          detail_page_url?: string | null
          exterior_color?: string | null
          fuel?: string | null
          gearbox?: string | null
          id?: string
          image_urls?: string[] | null
          interior_color?: string | null
          interior_type?: string | null
          is_sold?: boolean
          mileage?: number | null
          mobile_de_id: string
          model?: string | null
          model_description?: string | null
          modification_date?: string | null
          num_seats?: number | null
          power?: number | null
          price?: number | null
          price_type?: string | null
          seller_city?: string | null
          seller_zipcode?: string | null
          sold_at?: string | null
          source?: string
          synced_at?: string
          title: string
          updated_at?: string
          usage_type?: string | null
          vatable?: boolean | null
          vehicle_category?: string | null
          vin?: string | null
          year?: string | null
        }
        Update: {
          body_type?: string | null
          brand?: string | null
          category?: string | null
          climatisation?: string | null
          condition?: string | null
          created_at?: string
          creation_date?: string | null
          cubic_capacity?: number | null
          currency?: string | null
          damage_unrepaired?: boolean | null
          description?: string | null
          detail_page_url?: string | null
          exterior_color?: string | null
          fuel?: string | null
          gearbox?: string | null
          id?: string
          image_urls?: string[] | null
          interior_color?: string | null
          interior_type?: string | null
          is_sold?: boolean
          mileage?: number | null
          mobile_de_id?: string
          model?: string | null
          model_description?: string | null
          modification_date?: string | null
          num_seats?: number | null
          power?: number | null
          price?: number | null
          price_type?: string | null
          seller_city?: string | null
          seller_zipcode?: string | null
          sold_at?: string | null
          source?: string
          synced_at?: string
          title?: string
          updated_at?: string
          usage_type?: string | null
          vatable?: boolean | null
          vehicle_category?: string | null
          vin?: string | null
          year?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_is_admin: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
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
    },
  },
} as const
