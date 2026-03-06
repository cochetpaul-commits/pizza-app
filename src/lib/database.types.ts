export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      suppliers: {
        Row: {
          id: string;
          name: string | null;
          is_active?: boolean;
          email?: string | null;
          phone?: string | null;
          contact_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          is_active?: boolean;
          email?: string | null;
          phone?: string | null;
          contact_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          is_active?: boolean;
          email?: string | null;
          phone?: string | null;
          contact_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      supplier_invoices: {
        Row: {
          id: string;
          user_id: string;
          supplier_id: string;
          supplier_name: string | null;
          invoice_number: string | null;
          invoice_date: string | null;
          total_ht: number | null;
          total_ttc: number | null;
          currency: string;
          source_file_name: string | null;
          raw_text: string | null;
          parsed_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          supplier_id: string;
          supplier_name?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          total_ht?: number | null;
          total_ttc?: number | null;
          currency?: string;
          source_file_name?: string | null;
          raw_text?: string | null;
          parsed_json?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          supplier_id?: string;
          supplier_name?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          total_ht?: number | null;
          total_ttc?: number | null;
          currency?: string;
          source_file_name?: string | null;
          raw_text?: string | null;
          parsed_json?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      supplier_invoice_lines: {
        Row: {
          id: string;
          user_id: string;
          invoice_id: string;
          supplier_id: string;
          sku: string | null;
          name: string | null;
          quantity: number | null;
          unit: string | null;
          unit_price: number | null;
          total_price: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          invoice_id: string;
          supplier_id: string;
          sku?: string | null;
          name?: string | null;
          quantity?: number | null;
          unit?: string | null;
          unit_price?: number | null;
          total_price?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          invoice_id?: string;
          supplier_id?: string;
          sku?: string | null;
          name?: string | null;
          quantity?: number | null;
          unit?: string | null;
          unit_price?: number | null;
          total_price?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
