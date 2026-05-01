export interface EmailRequest {
  to: string;
  subject: string;
  html?: string;
  template?: string;
  context?: Record<string, any>;
}
