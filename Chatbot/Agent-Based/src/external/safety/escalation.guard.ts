export function escalationGuard(query: string): {
  allowed: boolean;
  reason?: string;
} {
  const q = query.toLowerCase();
  if (/\b(hack|bomb|kill|terror)\b/.test(q)) {
    return {
      allowed: false,
      reason: "Query violates content safety policies"
    };
  }

  return { allowed: true };
}
