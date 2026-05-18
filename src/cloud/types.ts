export interface CloudSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  user: { id: string; email?: string };
}

export interface CloudKeyMeta {
  provider: string;
  setAt: string;
  last4?: string;
}

export interface DeviceAuthStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}
