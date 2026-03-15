import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      mt5_accounts: {
        Row: {
          id: string;
          user_id: string;
          mt5_login: string;
          server: string;
          account_type: string;
          verified: boolean;
          verification_status: string;
          rejected_reason: string | null;
          created_at: string;
          verified_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          mt5_login: string;
          server: string;
          account_type?: string;
          verified?: boolean;
          verification_status?: string;
          rejected_reason?: string | null;
          created_at?: string;
          verified_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          mt5_login?: string;
          server?: string;
          account_type?: string;
          verified?: boolean;
          verification_status?: string;
          rejected_reason?: string | null;
          created_at?: string;
          verified_at?: string | null;
        };
      };
      signals: {
        Row: {
          id: string;
          symbol: string;
          direction: string;
          entry_price: number;
          stop_loss: number;
          take_profit: number;
          confidence: number;
          reasoning: string | null;
          expires_at: string;
          is_active: boolean;
          created_at: string;
        };
      };
      ea_connections: {
        Row: {
          id: string;
          user_id: string;
          mt5_login: string;
          status: string;
          last_ping: string;
          version: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      trades: {
        Row: {
          id: string;
          user_id: string;
          mt5_login: string;
          signal_id: string | null;
          symbol: string;
          direction: string;
          entry_price: number;
          exit_price: number | null;
          stop_loss: number | null;
          take_profit: number | null;
          lot_size: number;
          profit_loss: number;
          status: string;
          opened_at: string;
          closed_at: string | null;
          created_at: string;
        };
      };
    };
  };
}
