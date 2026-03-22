export interface SendMessagePayload {
  is_forwarded: boolean;
  message: string;
  frequency: number;
  recipients: Array<{ name: string; phone: string }>;
  send_window?: {
    start: string;
    end: string;
  };
}
