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
      active_alerts: {
        Row: {
          alert_id: string
          area_desc: string | null
          certainty: string | null
          effective: string | null
          ends: string | null
          event: string | null
          expires_at: string | null
          first_seen_at: string
          geometry: Json | null
          headline: string | null
          message_type: string | null
          onset: string | null
          properties: Json | null
          sent: string | null
          severity: string | null
          status: string | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          alert_id: string
          area_desc?: string | null
          certainty?: string | null
          effective?: string | null
          ends?: string | null
          event?: string | null
          expires_at?: string | null
          first_seen_at?: string
          geometry?: Json | null
          headline?: string | null
          message_type?: string | null
          onset?: string | null
          properties?: Json | null
          sent?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          alert_id?: string
          area_desc?: string | null
          certainty?: string | null
          effective?: string | null
          ends?: string | null
          event?: string | null
          expires_at?: string | null
          first_seen_at?: string
          geometry?: Json | null
          headline?: string | null
          message_type?: string | null
          onset?: string | null
          properties?: Json | null
          sent?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string
          urgency?: string | null
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
      enso_state: {
        Row: {
          id: number
          last_error: string | null
          last_run_at: string | null
          lean: string | null
          oni: number | null
          phase: string | null
          region: string | null
          season: string | null
          source: string | null
          updated_at: string
          year: string | null
        }
        Insert: {
          id?: number
          last_error?: string | null
          last_run_at?: string | null
          lean?: string | null
          oni?: number | null
          phase?: string | null
          region?: string | null
          season?: string | null
          source?: string | null
          updated_at?: string
          year?: string | null
        }
        Update: {
          id?: number
          last_error?: string | null
          last_run_at?: string | null
          lean?: string | null
          oni?: number | null
          phase?: string | null
          region?: string | null
          season?: string | null
          source?: string | null
          updated_at?: string
          year?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          badge: string
          content: string
          created_at: string | null
          id: string
          user_id: string
          username: string
        }
        Insert: {
          badge?: string
          content: string
          created_at?: string | null
          id?: string
          user_id: string
          username: string
        }
        Update: {
          badge?: string
          content?: string
          created_at?: string | null
          id?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      nhc_storms: {
        Row: {
          advisory_url: string | null
          basin: string | null
          classification: string | null
          classification_label: string | null
          danger_level: string | null
          discussion_url: string | null
          forecast_graphics_url: string | null
          intensity_kt: number | null
          intensity_mph: number | null
          is_dangerous: boolean | null
          last_update: string | null
          lat: number | null
          lat_str: string | null
          lon: number | null
          lon_str: string | null
          movement_dir_compass: string | null
          movement_speed: number | null
          name: string
          pressure: number | null
          raw: Json | null
          storm_id: string
          updated_at: string
        }
        Insert: {
          advisory_url?: string | null
          basin?: string | null
          classification?: string | null
          classification_label?: string | null
          danger_level?: string | null
          discussion_url?: string | null
          forecast_graphics_url?: string | null
          intensity_kt?: number | null
          intensity_mph?: number | null
          is_dangerous?: boolean | null
          last_update?: string | null
          lat?: number | null
          lat_str?: string | null
          lon?: number | null
          lon_str?: string | null
          movement_dir_compass?: string | null
          movement_speed?: number | null
          name: string
          pressure?: number | null
          raw?: Json | null
          storm_id: string
          updated_at?: string
        }
        Update: {
          advisory_url?: string | null
          basin?: string | null
          classification?: string | null
          classification_label?: string | null
          danger_level?: string | null
          discussion_url?: string | null
          forecast_graphics_url?: string | null
          intensity_kt?: number | null
          intensity_mph?: number | null
          is_dangerous?: boolean | null
          last_update?: string | null
          lat?: number | null
          lat_str?: string | null
          lon?: number | null
          lon_str?: string | null
          movement_dir_compass?: string | null
          movement_speed?: number | null
          name?: string
          pressure?: number | null
          raw?: Json | null
          storm_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          badge: string
          created_at: string | null
          email: string
          id: string
          location: string | null
          meteorologist_applied: boolean
          username: string
        }
        Insert: {
          badge?: string
          created_at?: string | null
          email: string
          id: string
          location?: string | null
          meteorologist_applied?: boolean
          username: string
        }
        Update: {
          badge?: string
          created_at?: string | null
          email?: string
          id?: string
          location?: string | null
          meteorologist_applied?: boolean
          username?: string
        }
        Relationships: []
      }
      report_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          signature: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          signature: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          signature?: string
        }
        Relationships: []
      }
      spc_outlook_state: {
        Row: {
          groups: Json | null
          id: number
          issue: string | null
          last_error: string | null
          last_run_at: string | null
          timing: string | null
          updated_at: string
          valid_window: Json | null
        }
        Insert: {
          groups?: Json | null
          id?: number
          issue?: string | null
          last_error?: string | null
          last_run_at?: string | null
          timing?: string | null
          updated_at?: string
          valid_window?: Json | null
        }
        Update: {
          groups?: Json | null
          id?: number
          issue?: string | null
          last_error?: string | null
          last_run_at?: string | null
          timing?: string | null
          updated_at?: string
          valid_window?: Json | null
        }
        Relationships: []
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
      zone_geom_cache: {
        Row: {
          fetched_at: string
          geometry: Json
          zone_url: string
        }
        Insert: {
          fetched_at?: string
          geometry: Json
          zone_url: string
        }
        Update: {
          fetched_at?: string
          geometry?: Json
          zone_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_user: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      is_meteorologist: { Args: { _user_id: string }; Returns: boolean }
      message_signature: { Args: { _content: string }; Returns: string }
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
