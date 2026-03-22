export interface DeviceLoginApiResponse {
  code: string;
  message: string;
  results?: {
    device_id: string;
    qr_duration?: number;
    qr_link?: string;
    is_logged?: boolean;
    is_ready?: boolean;
    status?: string;
  };
}

export interface DeviceBootstrapApiResponse {
  code: string;
  message: string;
  results?: {
    created_at?: string;
    display_name?: string;
    id?: string;
    jid?: string;
    state?: string;
  };
}

export interface DeviceLoginResponse {
  code: string;
  message: string;
  results: {
    device_id: string;
    qr_duration: number;
    qr_link: string;
    qr_png_base64?: string;
    is_ready?: boolean;
  };
}

export interface DeviceLogoutApiResponse {
  code?: string;
  message?: string;
  results?: {
    device_id?: string;
    is_logged?: boolean;
    is_ready?: boolean;
    status?: string;
  };
}

export interface DeviceLogoutResponse {
  code: string;
  message: string;
  results: {
    device_id: string;
    is_ready: boolean;
  };
}
