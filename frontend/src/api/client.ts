import type {
  AuthCheck,
  MatchDetail,
  MatchListResponse,
  MatchRecordResponse,
  ScoreboardItem,
  SubmissionDetail,
  SubmissionItem,
  Task1Latest,
  UserProfile,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      try {
        const data = (await res.json()) as { detail?: string | Array<{ msg?: string }> };
        if (typeof data.detail === 'string' && data.detail.trim()) {
          message = data.detail;
        } else if (Array.isArray(data.detail) && data.detail.length > 0) {
          const firstMsg = data.detail[0]?.msg;
          if (typeof firstMsg === 'string' && firstMsg.trim()) {
            message = firstMsg;
          }
        }
      } catch {
        // keep fallback message
      }
    } else {
      const text = await res.text();
      if (text.trim()) {
        message = text;
      }
    }

    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const api = {
  authCheck: () => request<AuthCheck>('/api/auth/check'),
  login: (studentId: string, password: string) =>
    request<AuthCheck>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ studentId, password }),
    }),
  logout: () => request<AuthCheck>('/api/auth/logout', { method: 'POST' }),
  forgetPassword: (studentId: string, password: string) =>
    request<{ status: string; token: string }>('/api/auth/forget-password', {
      method: 'POST',
      body: JSON.stringify({ studentId, password }),
    }),
  adminSetPassword: (studentId: string, token: string) =>
    request<{ status: string }>(`/api/auth/admin/setpwd/${studentId}/${token}`, { method: 'POST' }),

  scoreboard: () => request<ScoreboardItem[]>('/api/scoreboard'),

  profile: () => request<UserProfile>('/api/profile'),
  updateProfile: (payload: {
    name: string;
    tskin: string;
    bskin: string;
    password?: string;
    newpassword?: string;
  }) =>
    request<{ wrongPassword: boolean; profile: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  settings: () => request<{ compiler: string }>('/api/profile/settings'),
  updateSettings: (compiler: string) =>
    request<{ compiler: string }>('/api/profile/settings', {
      method: 'PUT',
      body: JSON.stringify({ compiler }),
    }),

  listSubmissions: () => request<SubmissionItem[]>('/api/submissions'),
  submitCode: (payload: { code: string; compiler: string; judge: boolean }) =>
    request<{ id: number; status: number }>('/api/submissions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submissionDetail: (id: number | string) => request<SubmissionDetail>(`/api/submissions/${id}`),
  latestTask1: () => request<Task1Latest>('/api/submissions/task1/latest'),
  latestTask1Case: (index: number | string) => request<{ index: number; status: number; stdout: string; stderr: string }>(`/api/submissions/task1/latest/cases/${index}`),

  listMatches: (query: string) => request<MatchListResponse>(`/api/matches${query ? `?${query}` : ''}`),
  matchDetail: (id: number | string) => request<MatchDetail>(`/api/matches/${id}`),
  matchRecord: (id: number | string) => request<MatchRecordResponse>(`/api/matches/${id}/record`),

  meta: () => request<{ compilers: string[] }>('/api/meta'),
};
