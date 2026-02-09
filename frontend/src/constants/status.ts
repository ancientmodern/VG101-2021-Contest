export const submissionStatusText: Record<number, string> = {
  [-1]: 'Pending',
  0: 'Effective',
  1: 'Inactive',
  2: 'Compile Error',
};

export const judgeStatusText: Record<number, string> = {
  0: 'Waiting',
  1: 'Fetched',
  2: 'Compiling',
  3: 'Judging',
  4: 'Accepted',
  5: 'Wrong Answer',
  6: 'Time Exceeded',
  7: 'Memory Exceeded',
  8: 'Runtime Error',
  9: 'Compile Error',
  10: 'System Error',
};

export function submissionStatusClass(status: number): string {
  switch (status) {
    case 0:
      return 'ok';
    case 1:
      return 'muted';
    case 2:
      return 'error';
    default:
      return 'pending';
  }
}

export function judgeStatusClass(status: number): string {
  if (status === 4) return 'ok';
  if (status >= 5) return 'error';
  if (status >= 1) return 'pending';
  return 'pending';
}

export function scoreToColor(score: number | string): string {
  if (score === 'unrated' || typeof score !== 'number' || score < 1000) return 'gray';
  if (score < 1500) return '#111';
  if (score < 2000) return '#178a4a';
  if (score < 2400) return '#2a9d8f';
  if (score < 2800) return '#4465d9';
  if (score < 3000) return '#7a1fa2';
  if (score < 3200) return '#d97706';
  return '#dc2626';
}
