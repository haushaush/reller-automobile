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
          min_year?: string | null
          name?: string | null
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
          synced_at: string
          title: string
          updated_at: string
          usage_type: string | null
          vatable: boolean | null
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
          synced_at?: string
          title: string
          updated_at?: string
          usage_type?: string | null
          vatable?: boolean | null
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
          synced_at?: string
          title?: string
          updated_at?: string
          usage_type?: string | null
          vatable?: boolean | null
          year?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
