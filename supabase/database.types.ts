export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      board_preferences: {
        Row: {
          active_view: string | null
          client_id: string
          user_id: string
          visible_widgets: string[]
        }
        Insert: {
          active_view?: string | null
          client_id: string
          user_id?: string
          visible_widgets?: string[]
        }
        Update: {
          active_view?: string | null
          client_id?: string
          user_id?: string
          visible_widgets?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "board_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_asset_folders: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_asset_folders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_asset_folders_parent_fkey"
            columns: ["parent_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brand_asset_folders"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          category: string
          client_id: string
          created_at: string
          description: string
          folder_id: string | null
          id: string
          link_url: string | null
          mime_type: string | null
          name: string
          storage_path: string | null
          tags: string[]
        }
        Insert: {
          category: string
          client_id: string
          created_at?: string
          description?: string
          folder_id?: string | null
          id?: string
          link_url?: string | null
          mime_type?: string | null
          name: string
          storage_path?: string | null
          tags?: string[]
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          description?: string
          folder_id?: string | null
          id?: string
          link_url?: string | null
          mime_type?: string | null
          name?: string
          storage_path?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_assets_folder_client_fkey"
            columns: ["folder_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brand_asset_folders"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      brand_sections: {
        Row: {
          client_id: string
          content: Json
          section: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content?: Json
          section: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: Json
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_sections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_templates: {
        Row: {
          category: string
          client_id: string
          content: Json
          height: number
          id: string
          name: string
          width: number
        }
        Insert: {
          category: string
          client_id: string
          content?: Json
          height: number
          id?: string
          name: string
          width: number
        }
        Update: {
          category?: string
          client_id?: string
          content?: Json
          height?: number
          id?: string
          name?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_attachments: {
        Row: {
          briefing_id: string
          created_at: string
          file_size: number
          id: string
          mime_type: string
          name: string
          storage_path: string
        }
        Insert: {
          briefing_id: string
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          name: string
          storage_path: string
        }
        Update: {
          briefing_id?: string
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          name?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefing_attachments_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      briefings: {
        Row: {
          budget_note: string | null
          campaign_id: string | null
          client_id: string
          confirmed_credits: number | null
          created_at: string
          created_by: string
          direction: Json
          due_date: string | null
          estimated_credits: number
          goals: string
          id: string
          overview: string
          requested_by: string | null
          requested_deliverables: Json
          service_type: string
          status: Database["public"]["Enums"]["briefing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          budget_note?: string | null
          campaign_id?: string | null
          client_id: string
          confirmed_credits?: number | null
          created_at?: string
          created_by: string
          direction?: Json
          due_date?: string | null
          estimated_credits?: number
          goals?: string
          id?: string
          overview?: string
          requested_by?: string | null
          requested_deliverables?: Json
          service_type: string
          status?: Database["public"]["Enums"]["briefing_status"]
          title?: string
          updated_at?: string
        }
        Update: {
          budget_note?: string | null
          campaign_id?: string | null
          client_id?: string
          confirmed_credits?: number | null
          created_at?: string
          created_by?: string
          direction?: Json
          due_date?: string | null
          estimated_credits?: number
          goals?: string
          id?: string
          overview?: string
          requested_by?: string | null
          requested_deliverables?: Json
          service_type?: string
          status?: Database["public"]["Enums"]["briefing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefings_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "briefings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefings_service_type_fkey"
            columns: ["service_type"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          client_id: string
          created_at: string
          description: string
          end_date: string | null
          id: string
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_board_widgets: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          kind: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          kind: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_board_widgets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_board_widgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_comments: {
        Row: {
          author_kind: string
          author_label: string
          body: string
          created_at: string
          design_id: string | null
          id: string
          idempotency_key: string | null
          pin_t: number | null
          pin_x: number | null
          pin_y: number | null
          project_id: string
          publication_id: string | null
          resolved: boolean
        }
        Insert: {
          author_kind: string
          author_label: string
          body: string
          created_at?: string
          design_id?: string | null
          id?: string
          idempotency_key?: string | null
          pin_t?: number | null
          pin_x?: number | null
          pin_y?: number | null
          project_id: string
          publication_id?: string | null
          resolved?: boolean
        }
        Update: {
          author_kind?: string
          author_label?: string
          body?: string
          created_at?: string
          design_id?: string | null
          id?: string
          idempotency_key?: string | null
          pin_t?: number | null
          pin_x?: number | null
          pin_y?: number | null
          project_id?: string
          publication_id?: string | null
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_comments_design_id_project_id_publication_id_fkey"
            columns: ["design_id", "project_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "published_designs"
            referencedColumns: ["id", "project_id", "publication_id"]
          },
          {
            foreignKeyName: "client_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_comments_publication_id_project_id_fkey"
            columns: ["publication_id", "project_id"]
            isOneToOne: false
            referencedRelation: "published_versions"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      client_memberships: {
        Row: {
          client_id: string
          notify_all: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          notify_all?: boolean
          user_id: string
        }
        Update: {
          client_id?: string
          notify_all?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived: boolean
          created_at: string
          description: string
          id: string
          industry: string
          initials: string
          logo_path: string | null
          name: string
          slug: string
          updated_at: string
          website: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string
          id?: string
          industry?: string
          initials?: string
          logo_path?: string | null
          name: string
          slug: string
          updated_at?: string
          website?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string
          id?: string
          industry?: string
          initials?: string
          logo_path?: string | null
          name?: string
          slug?: string
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      competitors: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          google_advertiser_id: string | null
          id: string
          meta_page_id: string | null
          name: string
          tiktok_advertiser: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          google_advertiser_id?: string | null
          id?: string
          meta_page_id?: string | null
          name: string
          tiktok_advertiser?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          google_advertiser_id?: string | null
          id?: string
          meta_page_id?: string | null
          name?: string
          tiktok_advertiser?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_accounts: {
        Row: {
          balance: number
          client_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          client_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          client_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount: number
          balance_after: number
          client_id: string
          created_at: string
          description: string
          id: string
          idempotency_key: string
          kind: string
          project_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          client_id: string
          created_at?: string
          description: string
          id?: string
          idempotency_key: string
          kind: string
          project_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          idempotency_key?: string
          kind?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_project_id_client_id_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      credit_requests: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          ledger_id: string | null
          note: string
          requested_by: string
          resolved_at: string | null
          response_note: string
          status: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          ledger_id?: string | null
          note?: string
          requested_by: string
          resolved_at?: string | null
          response_note?: string
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          ledger_id?: string | null
          note?: string
          requested_by?: string
          resolved_at?: string | null
          response_note?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          format: string
          height: number | null
          id: string
          name: string
          project_id: string
          quantity: number
          scope: string
          sort_order: number
          width: number | null
        }
        Insert: {
          format: string
          height?: number | null
          id?: string
          name: string
          project_id: string
          quantity?: number
          scope?: string
          sort_order?: number
          width?: number | null
        }
        Update: {
          format?: string
          height?: number | null
          id?: string
          name?: string
          project_id?: string
          quantity?: number
          scope?: string
          sort_order?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_format_fkey"
            columns: ["format"]
            isOneToOne: false
            referencedRelation: "format_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_files: {
        Row: {
          created_at: string
          file_size: number
          id: string
          mime_type: string
          name: string
          project_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          name: string
          project_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          name?: string
          project_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      design_boards: {
        Row: {
          board_id: string
          created_at: string
          created_by: string
          designer_id: string
          due_date: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
          widget_id: string | null
        }
        Insert: {
          board_id: string
          created_at?: string
          created_by: string
          designer_id: string
          due_date?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
          widget_id?: string | null
        }
        Update: {
          board_id?: string
          created_at?: string
          created_by?: string
          designer_id?: string
          due_date?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_boards_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      design_version_miro_links: {
        Row: {
          board_id: string
          project_id: string
          updated_at: string
          updated_by: string
          version_id: string
          widget_id: string | null
        }
        Insert: {
          board_id: string
          project_id: string
          updated_at?: string
          updated_by: string
          version_id: string
          widget_id?: string | null
        }
        Update: {
          board_id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string
          version_id?: string
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_version_miro_links_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_version_miro_links_version_id_project_id_fkey"
            columns: ["version_id", "project_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      design_versions: {
        Row: {
          board_id: string | null
          created_at: string
          created_by: string
          deliverable_id: string | null
          id: string
          notes: string
          project_id: string
          request_key: string | null
          status: string
          version_number: number
        }
        Insert: {
          board_id?: string | null
          created_at?: string
          created_by: string
          deliverable_id?: string | null
          id?: string
          notes?: string
          project_id: string
          request_key?: string | null
          status?: string
          version_number: number
        }
        Update: {
          board_id?: string | null
          created_at?: string
          created_by?: string
          deliverable_id?: string | null
          id?: string
          notes?: string
          project_id?: string
          request_key?: string | null
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_versions_board_fk"
            columns: ["board_id", "project_id"]
            isOneToOne: false
            referencedRelation: "design_boards"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "design_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_versions_deliverable_id_project_id_fkey"
            columns: ["deliverable_id", "project_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "design_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      designs: {
        Row: {
          content: Json
          created_at: string
          created_by: string
          id: string
          internal_asset_path: string | null
          project_id: string
          sort_order: number
          title: string
          version_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by: string
          id?: string
          internal_asset_path?: string | null
          project_id: string
          sort_order?: number
          title: string
          version_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          internal_asset_path?: string | null
          project_id?: string
          sort_order?: number
          title?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "designs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_version_id_project_id_fkey"
            columns: ["version_id", "project_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      format_catalog: {
        Row: {
          definition: Json
          id: string
        }
        Insert: {
          definition: Json
          id: string
        }
        Update: {
          definition?: Json
          id?: string
        }
        Relationships: []
      }
      internal_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          design_id: string | null
          id: string
          idempotency_key: string | null
          pin_t: number | null
          pin_x: number | null
          pin_y: number | null
          project_id: string
          resolved: boolean
          version_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          design_id?: string | null
          id?: string
          idempotency_key?: string | null
          pin_t?: number | null
          pin_x?: number | null
          pin_y?: number | null
          project_id: string
          resolved?: boolean
          version_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          design_id?: string | null
          id?: string
          idempotency_key?: string | null
          pin_t?: number | null
          pin_x?: number | null
          pin_y?: number | null
          project_id?: string
          resolved?: boolean
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_comments_design_id_project_id_version_id_fkey"
            columns: ["design_id", "project_id", "version_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id", "project_id", "version_id"]
          },
          {
            foreignKeyName: "internal_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_comments_version_id_project_id_fkey"
            columns: ["version_id", "project_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      invitations: {
        Row: {
          client_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          kind: string
          project_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playground_boards: {
        Row: {
          client_id: string
          created_at: string
          id: string
          project_id: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          project_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          project_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "playground_boards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playground_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      playground_items: {
        Row: {
          asset_path: string | null
          board_id: string
          body: string
          created_at: string
          deleted_at: string | null
          height: number
          id: string
          kind: string
          mime_type: string | null
          revision: number
          title: string
          updated_at: string
          width: number
          x: number
          y: number
        }
        Insert: {
          asset_path?: string | null
          board_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          height: number
          id: string
          kind: string
          mime_type?: string | null
          revision?: number
          title: string
          updated_at?: string
          width: number
          x: number
          y: number
        }
        Update: {
          asset_path?: string | null
          board_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          height?: number
          id?: string
          kind?: string
          mime_type?: string | null
          revision?: number
          title?: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "playground_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "playground_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          removal_completed_at: string | null
          removed_at: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          removal_completed_at?: string | null
          removed_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          removal_completed_at?: string | null
          removed_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      project_assets: {
        Row: {
          category: string
          created_at: string
          file_size: number
          id: string
          mime_type: string
          name: string
          project_id: string
          storage_path: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          name: string
          project_id: string
          storage_path: string
        }
        Update: {
          category?: string
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          name?: string
          project_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          designer_id: string
          project_id: string
        }
        Insert: {
          designer_id: string
          project_id: string
        }
        Update: {
          designer_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_covers: {
        Row: {
          client_visible: boolean
          project_id: string
          storage_path: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          client_visible?: boolean
          project_id: string
          storage_path: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          client_visible?: boolean
          project_id?: string
          storage_path?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_covers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_covers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          board_position: Json
          briefing_id: string | null
          campaign_id: string | null
          client_id: string
          created_at: string
          delivered_at: string | null
          description: string
          due_date: string | null
          id: string
          service_type: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at: string
        }
        Insert: {
          board_position?: Json
          briefing_id?: string | null
          campaign_id?: string | null
          client_id: string
          created_at?: string
          delivered_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          service_type: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at?: string
        }
        Update: {
          board_position?: Json
          briefing_id?: string | null
          campaign_id?: string | null
          client_id?: string
          created_at?: string
          delivered_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          service_type?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_briefing_id_client_id_fkey"
            columns: ["briefing_id", "client_id"]
            isOneToOne: false
            referencedRelation: "briefings"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "projects_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_service_type_fkey"
            columns: ["service_type"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_miro_links: {
        Row: {
          board_id: string
          project_id: string
          publication_id: string
          updated_at: string
          updated_by: string
          widget_id: string | null
        }
        Insert: {
          board_id: string
          project_id: string
          publication_id: string
          updated_at?: string
          updated_by: string
          widget_id?: string | null
        }
        Update: {
          board_id?: string
          project_id?: string
          publication_id?: string
          updated_at?: string
          updated_by?: string
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_miro_links_publication_id_project_id_fkey"
            columns: ["publication_id", "project_id"]
            isOneToOne: false
            referencedRelation: "published_versions"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "publication_miro_links_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_reviews: {
        Row: {
          feedback: string
          id: string
          project_id: string
          publication_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          feedback?: string
          id?: string
          project_id: string
          publication_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          feedback?: string
          id?: string
          project_id?: string
          publication_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_reviews_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: true
            referencedRelation: "published_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_reviews_publication_id_project_id_fkey"
            columns: ["publication_id", "project_id"]
            isOneToOne: false
            referencedRelation: "published_versions"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "publication_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      published_designs: {
        Row: {
          asset_path: string | null
          content: Json
          id: string
          project_id: string
          publication_id: string
          sort_order: number
          title: string
        }
        Insert: {
          asset_path?: string | null
          content?: Json
          id?: string
          project_id: string
          publication_id: string
          sort_order?: number
          title: string
        }
        Update: {
          asset_path?: string | null
          content?: Json
          id?: string
          project_id?: string
          publication_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_designs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_designs_publication_id_project_id_fkey"
            columns: ["publication_id", "project_id"]
            isOneToOne: false
            referencedRelation: "published_versions"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      published_versions: {
        Row: {
          deliverable_id: string | null
          id: string
          project_id: string
          published_at: string
          release_note: string
          version_number: number
        }
        Insert: {
          deliverable_id?: string | null
          id?: string
          project_id: string
          published_at?: string
          release_note?: string
          version_number: number
        }
        Update: {
          deliverable_id?: string | null
          id?: string
          project_id?: string
          published_at?: string
          release_note?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_versions_deliverable_id_project_id_fkey"
            columns: ["deliverable_id", "project_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "published_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          definition: Json
          id: string
        }
        Insert: {
          definition: Json
          id: string
        }
        Update: {
          definition?: Json
          id?: string
        }
        Relationships: []
      }
      service_preset_history: {
        Row: {
          created_at: string
          due_days: number | null
          max_credits: number | null
          min_credits: number | null
          revision: number
          service_type: string
        }
        Insert: {
          created_at?: string
          due_days?: number | null
          max_credits?: number | null
          min_credits?: number | null
          revision: number
          service_type: string
        }
        Update: {
          created_at?: string
          due_days?: number | null
          max_credits?: number | null
          min_credits?: number | null
          revision?: number
          service_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_preset_history_service_type_fkey"
            columns: ["service_type"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_presets: {
        Row: {
          due_days: number | null
          max_credits: number | null
          min_credits: number | null
          revision: number
          service_type: string
          updated_at: string
        }
        Insert: {
          due_days?: number | null
          max_credits?: number | null
          min_credits?: number | null
          revision?: number
          service_type: string
          updated_at?: string
        }
        Update: {
          due_days?: number | null
          max_credits?: number | null
          min_credits?: number | null
          revision?: number
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_presets_service_type_fkey"
            columns: ["service_type"]
            isOneToOne: true
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      template_drafts: {
        Row: {
          client_id: string
          content: Json
          id: string
          name: string
          owner_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content?: Json
          id?: string
          name: string
          owner_id?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: Json
          id?: string
          name?: string
          owner_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_drafts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_drafts_template_id_client_id_fkey"
            columns: ["template_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brand_templates"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          id: number
          studio_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          id?: number
          studio_name?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          id?: number
          studio_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_briefing: { Args: { p_briefing_id: string }; Returns: string }
      accept_invitation: { Args: { p_token: string }; Returns: undefined }
      add_briefing_attachment: {
        Args: {
          p_briefing_id: string
          p_file_size: number
          p_mime_type: string
          p_name: string
          p_storage_path: string
        }
        Returns: string
      }
      add_delivery_file: {
        Args: {
          p_file_size: number
          p_mime_type: string
          p_name: string
          p_project_id: string
          p_storage_path: string
        }
        Returns: string
      }
      add_design: {
        Args: {
          p_content?: Json
          p_internal_asset_path?: string
          p_title: string
          p_version_id: string
        }
        Returns: string
      }
      adjust_credits: {
        Args: {
          p_amount: number
          p_client_id: string
          p_description: string
          p_idempotency_key: string
        }
        Returns: string
      }
      assign_designer: {
        Args: { p_designer_id: string; p_project_id: string }
        Returns: undefined
      }
      clear_project_cover: { Args: { p_project_id: string }; Returns: string }
      clear_publication_miro_link: {
        Args: { p_publication_id: string }
        Returns: undefined
      }
      clear_version_miro_link: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      client_team: {
        Args: { p_client_id: string }
        Returns: {
          display_name: string
          email: string
          user_id: string
        }[]
      }
      confirm_briefing_budget: {
        Args: { p_briefing_id: string; p_credits: number; p_note?: string }
        Returns: undefined
      }
      create_client: {
        Args: {
          p_industry?: string
          p_initial_credits?: number
          p_name: string
          p_slug: string
        }
        Returns: string
      }
      create_design_board: {
        Args: {
          p_designer_id: string
          p_due_date?: string
          p_name: string
          p_project_id: string
          p_url: string
        }
        Returns: string
      }
      create_design_version: {
        Args: {
          p_copy_version_id?: string
          p_deliverable_id: string
          p_notes?: string
        }
        Returns: string
      }
      create_invitation: {
        Args: {
          p_client_id?: string
          p_email: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      delete_playground_item: {
        Args: {
          p_asset_path?: string
          p_board_id: string
          p_expected_revision: number
          p_item_id: string
        }
        Returns: string
      }
      discard_prepared_assets: {
        Args: { p_paths: string[] }
        Returns: string[]
      }
      discard_sanitized_asset: {
        Args: { p_bucket_id: string; p_storage_path: string }
        Returns: undefined
      }
      finalize_asset_discard: {
        Args: { p_bucket_id: string; p_storage_path: string }
        Returns: undefined
      }
      find_sanitized_video_by_source: {
        Args: { p_project_id: string; p_source_path: string }
        Returns: {
          mime_type: string
          storage_path: string
        }[]
      }
      fulfill_credit_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: string
      }
      get_assigned_briefings: {
        Args: { p_client_id?: string }
        Returns: {
          campaign_id: string
          client_id: string
          created_at: string
          direction: Json
          due_date: string
          goals: string
          id: string
          overview: string
          requested_deliverables: Json
          service_type: string
          status: Database["public"]["Enums"]["briefing_status"]
          title: string
          updated_at: string
        }[]
      }
      get_playground_board: {
        Args: { p_client_id: string; p_project_id?: string }
        Returns: string
      }
      get_playground_cleanup: {
        Args: { p_board_id: string }
        Returns: {
          path: string
        }[]
      }
      list_stale_sanitized_assets: {
        Args: never
        Returns: {
          bucket_id: string
          storage_path: string
        }[]
      }
      list_stale_video_uploads: {
        Args: never
        Returns: {
          attested: boolean
          bucket_id: string
          storage_path: string
        }[]
      }
      mark_project_delivered: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      post_comment: {
        Args: {
          p_body: string
          p_channel: string
          p_design_id?: string
          p_idempotency_key?: string
          p_pin_t?: number
          p_pin_x?: number
          p_pin_y?: number
          p_project_id: string
          p_version_id?: string
        }
        Returns: string
      }
      publish_version: {
        Args: {
          p_assets?: Json
          p_idempotency_key?: string
          p_release_note?: string
          p_version_id: string
        }
        Returns: string
      }
      register_sanitized_asset: {
        Args: {
          p_bucket_id: string
          p_file_size: number
          p_mime_type: string
          p_prepared_by: string
          p_project_id: string
          p_sha256: string
          p_source_design_id?: string
          p_source_path?: string
          p_storage_path: string
        }
        Returns: undefined
      }
      register_sanitized_video: {
        Args: {
          p_file_size: number
          p_mime_type: string
          p_prepared_by: string
          p_project_id: string
          p_sha256: string
          p_source_path?: string
          p_storage_path: string
        }
        Returns: undefined
      }
      reject_credit_request: {
        Args: { p_note: string; p_request_id: string }
        Returns: undefined
      }
      remove_briefing_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      remove_client_member: {
        Args: { p_client_id: string; p_profile_id: string }
        Returns: boolean
      }
      remove_team_member: { Args: { p_profile_id: string }; Returns: undefined }
      request_credits: {
        Args: {
          p_amount: number
          p_client_id: string
          p_idempotency_key?: string
          p_note?: string
        }
        Returns: string
      }
      resolve_comment: {
        Args: { p_channel: string; p_comment_id: string; p_resolved?: boolean }
        Returns: undefined
      }
      review_publication: {
        Args: {
          p_decision: string
          p_feedback?: string
          p_publication_id: string
        }
        Returns: undefined
      }
      revoke_design_assignment: {
        Args: { p_designer_id: string; p_project_id: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      save_board_view: {
        Args: { p_active_view: string; p_client_id: string }
        Returns: string
      }
      save_board_widgets: {
        Args: { p_client_id: string; p_visible_widgets: string[] }
        Returns: string[]
      }
      save_briefing: {
        Args: {
          p_briefing_id?: string
          p_campaign_id?: string
          p_client_id: string
          p_deliverables?: Json
          p_direction?: Json
          p_due_date?: string
          p_estimated_credits?: number
          p_expected_updated_at?: string
          p_goals?: string
          p_overview?: string
          p_requested_by?: string
          p_service_type: string
          p_title?: string
        }
        Returns: string
      }
      save_briefing_revision: {
        Args: {
          p_briefing_id?: string
          p_campaign_id?: string
          p_client_id: string
          p_deliverables?: Json
          p_direction?: Json
          p_due_date?: string
          p_estimated_credits?: number
          p_expected_updated_at?: string
          p_goals?: string
          p_overview?: string
          p_requested_by?: string
          p_service_type: string
          p_title?: string
        }
        Returns: Json
      }
      save_playground_item: {
        Args: { p_board_id: string; p_expected_revision?: number; p_item: Json }
        Returns: Json
      }
      save_service_preset: {
        Args: {
          p_due_days: number
          p_expected_revision?: number
          p_max_credits: number
          p_min_credits: number
          p_service_type: string
        }
        Returns: number
      }
      send_board_round: {
        Args: {
          p_board_id: string
          p_frame_url?: string
          p_idempotency_key?: string
          p_note?: string
        }
        Returns: string
      }
      set_briefing_requester: {
        Args: { p_briefing_id: string; p_requested_by: string }
        Returns: undefined
      }
      set_client_notifications: {
        Args: { p_all: boolean; p_client_id: string }
        Returns: undefined
      }
      set_project_cover: {
        Args: {
          p_client_visible?: boolean
          p_project_id: string
          p_storage_path: string
        }
        Returns: string
      }
      set_project_cover_visibility: {
        Args: { p_client_visible: boolean; p_project_id: string }
        Returns: undefined
      }
      set_publication_miro_link: {
        Args: { p_publication_id: string; p_url: string }
        Returns: undefined
      }
      set_team_member_role: {
        Args: {
          p_profile_id: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      set_version_miro_link: {
        Args: { p_url: string; p_version_id: string }
        Returns: undefined
      }
      share_miro_version: {
        Args: {
          p_idempotency_key?: string
          p_note?: string
          p_project_id: string
          p_source_round?: string
          p_url: string
        }
        Returns: string
      }
      submit_briefing: { Args: { p_briefing_id: string }; Returns: undefined }
      submit_design_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      update_design_board: {
        Args: {
          p_board_id: string
          p_designer_id: string
          p_due_date?: string
          p_name: string
          p_url: string
        }
        Returns: undefined
      }
      update_workspace_settings: {
        Args: {
          p_expected_updated_at?: string
          p_studio_name: string
          p_timezone: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "agency" | "client" | "designer"
      briefing_status:
        | "draft"
        | "awaiting_review"
        | "budget_confirmed"
        | "accepted"
      project_status:
        | "planned"
        | "in_progress"
        | "internal_review"
        | "client_review"
        | "changes_requested"
        | "approved"
        | "delivered"
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
      app_role: ["agency", "client", "designer"],
      briefing_status: [
        "draft",
        "awaiting_review",
        "budget_confirmed",
        "accepted",
      ],
      project_status: [
        "planned",
        "in_progress",
        "internal_review",
        "client_review",
        "changes_requested",
        "approved",
        "delivered",
      ],
    },
  },
} as const

