export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      flow_days: {
        Row: {
          id: string; user_id: string; day: string; theme: string | null;
          main_outcome: string | null; whats_happening: string | null;
          story_opportunity: string | null; notes: string | null;
          capacity_minutes: number | null; metadata: Json;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id: string; day: string; theme?: string | null;
          main_outcome?: string | null; whats_happening?: string | null;
          story_opportunity?: string | null; notes?: string | null;
          capacity_minutes?: number | null; metadata?: Json;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["flow_days"]["Insert"]>;
        Relationships: [];
      };
      flow_items: {
        Row: {
          id: string; user_id: string; day: string | null; project_id: string | null;
          item_type: string; title: string; description: string | null;
          status: string; priority: number; start_time: string | null;
          duration_minutes: number | null; sort_order: number;
          linked_moment_id: string | null; linked_content_id: string | null;
          linked_episode_id: string | null; metadata: Json;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id: string; day?: string | null; project_id?: string | null;
          item_type?: string; title: string; description?: string | null;
          status?: string; priority?: number; start_time?: string | null;
          duration_minutes?: number | null; sort_order?: number;
          linked_moment_id?: string | null; linked_content_id?: string | null;
          linked_episode_id?: string | null; metadata?: Json;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["flow_items"]["Insert"]>;
        Relationships: [];
      };
      flow_projects: {
        Row: {
          id: string; user_id: string; name: string; description: string | null;
          icon: string | null; color: string | null; archived: boolean;
          sort_order: number; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id: string; name: string; description?: string | null;
          icon?: string | null; color?: string | null; archived?: boolean;
          sort_order?: number; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["flow_projects"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type FlowDay = Database["public"]["Tables"]["flow_days"]["Row"];
export type FlowItem = Database["public"]["Tables"]["flow_items"]["Row"];
