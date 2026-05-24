export type JobStatus =
  | "queued"
  | "waiting_for_agent"
  | "code_analysis"
  | "exploring"
  | "site_mapping"
  | "classifying"
  | "questioning"
  | "reconstructing"
  | "analyzing"
  | "generating"
  | "done"
  | "failed"
  | "stopped";

export interface JobState {
  id: string;
  url: string;
  max_steps: number;
  status: JobStatus;
  current_step: number;
  total_steps: number;
  current_action: string | null;
  features_found: number;
  error: string | null;
  created_at: number;
  queue_position: number;
  github_repo: string | null;
  has_code_analysis: boolean;
}

export interface Endpoint {
  method: string;
  host: string;
  path: string;
}

export interface QueryParam {
  name: string;
  type: string;
  required: boolean;
}

export interface BodySchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  endpoint: {
    method: string;
    url_template: string;
    query_params: QueryParam[];
    body_schema: BodySchema | null;
  };
  returns: string;
}

export interface FeatureSpec {
  product_name: string;
  base_url: string;
  auth: { type: string; notes: string };
  features: Feature[];
}

export interface AuthField {
  name: string;   // field key, e.g. "username", "password"
  label: string;  // display label detected from the page
  description?: string;
}

export interface FeatureContext {
  feature_id: string;
  feature_name: string;
  feature_type: string;
}

export interface SiteFeature {
  feature_id: string;
  name: string;
  description: string;
  feature_type: string;
  has_endpoint: boolean;
  ui_trigger: string;
  triggering_element: string | null;
  status: "pending" | "has_endpoint" | "questioning" | "reconstructed" | "failed";
}

export interface SitePage {
  url: string;
  title: string;
  description: string;
  features: SiteFeature[];
}

export interface SiteMapData {
  pages: SitePage[];
  total_features: number;
  features_with_endpoints: number;
  features_needing_reconstruction: number;
}

export interface ChatMessage {
  id: string;
  sender: "agent" | "user";
  text: string;
  timestamp: number;
  question_id?: string;
  question_type?: "text" | "credentials" | "choice" | "file_upload" | "env_vars";
  fields?: AuthField[];
  choices?: string[];
  answered?: boolean;
  timed_out?: boolean;
  feature_context?: FeatureContext;
}

// SSE event union
export type SSEEvent =
  | { type: "stage_change"; stage: JobStatus; features_found?: number }
  | { type: "step_update"; step: number; total_steps: number; screenshot_url: string }
  | { type: "reasoning"; step: number; action: string; reasoning: string }
  | { type: "network_update"; endpoints: Endpoint[] }
  | { type: "features_found"; count: number }
  | { type: "auth_required"; fields: AuthField[] }
  | { type: "auth_accepted" }
  | { type: "auth_timeout" }
  | { type: "chat_question"; question_id: string; text: string; question_type: "text" | "credentials" | "choice" | "file_upload" | "env_vars"; fields?: AuthField[]; choices?: string[]; feature_context?: FeatureContext }
  | { type: "chat_answer_received"; question_id: string }
  | { type: "chat_timeout"; question_id: string }
  | { type: "user_message"; text: string }
  | { type: "code_analysis_done"; routes_found: number; env_vars_found: number; vector_backend: string }
  | { type: "code_analysis_warning"; message: string }
  | { type: "error"; message: string }
  | { type: "heartbeat" }
  | { type: "queue_position"; position: number; queue_length: number }
  | { type: "site_map_built"; pages: number; features: number; features_with_endpoints: number; features_needing_reconstruction: number }
  | { type: "classification_done"; breakdown: Record<string, number> }
  | { type: "reconstruction_progress"; feature_id: string; feature_name: string; status: "questioning" | "generating" | "done" | "failed"; implementation_type: string }
  | { type: "stopped" };
