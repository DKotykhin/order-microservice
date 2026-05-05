export interface EmailRequest {
  userId?: string;
  to?: string;
  subject: string;
  html?: string;
  template?: string;
  context?: Record<string, any>;
}
