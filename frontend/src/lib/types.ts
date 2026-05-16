export type JobStatus =
  | "queued"
  | "code_analysis"
  | "exploring"
  | "analyzing"
  | "generating"
  | "done"
  | "failed";

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
  | { type: "chat_question"; question_id: string; text: string; question_type: "text" | "credentials" | "choice" | "file_upload" | "env_vars"; fields?: AuthField[]; choices?: string[] }
  | { type: "chat_answer_received"; question_id: string }
  | { type: "chat_timeout"; question_id: string }
  | { type: "user_message"; text: string }
  | { type: "code_analysis_done"; routes_found: number; env_vars_found: number; vector_backend: string }
  | { type: "code_analysis_warning"; message: string }
  | { type: "error"; message: string }
  | { type: "heartbeat" };
