export type AuthCheck = {
  status: 'OK' | 'FAIL';
  studentId?: string;
  realName?: string;
};

export type UserProfile = {
  studentId: string;
  realName: string;
  dispName: string;
  tankSkin: string;
  bulletSkin: string;
  compiler: string;
  win: number;
  lose: number;
  draw: number;
  score: number;
  admin: boolean;
};

export type ScoreboardItem = {
  id: number;
  dispName: string;
  score: number | string;
  win: number;
  lose: number;
  draw: number;
};

export type SubmissionItem = {
  id: number;
  status: number;
  compiler: string;
  createdAt: string;
};

export type SubmissionDetail = {
  id: number;
  status: number;
  compiler: string;
  createdAt: string;
  stack: string;
  stdout: string;
  stderr: string;
};

export type Task1Latest = {
  nosubmission: boolean;
  submission?: {
    id: number;
    status: number;
    compiler: string;
    stderr: string;
    cases: Array<{ index: number; status: number }>;
  };
  score?: number;
};

export type MatchPlayer = {
  id: number;
  dispName: string;
  score: number;
  tankSkin: string;
  bulletSkin: string;
};

export type MatchListItem = {
  id: number;
  status: number;
  winner: number | null;
  createdAt: string;
  p1: MatchPlayer;
  p2: MatchPlayer;
  scores?: {
    p1: [string, string];
    p2: [string, string];
  } | null;
};

export type MatchListResponse = {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  items: MatchListItem[];
};

export type MatchDetail = {
  id: number;
  winner: number | null;
  p1: string;
  p2: string;
  error: string;
};

export type MatchRecordResponse = {
  record: Array<{
    tanks: Array<{ position: [number, number]; direction: number; life: number }>;
    bullets: Array<{ position: [number, number]; direction: number; owner: number }>;
    shrink: number;
  }>;
  A: { stdout: string; stderr: string };
  B: { stdout: string; stderr: string };
  p1: string;
  p2: string;
  ts1: string;
  ts2: string;
  bs1: string;
  bs2: string;
};
