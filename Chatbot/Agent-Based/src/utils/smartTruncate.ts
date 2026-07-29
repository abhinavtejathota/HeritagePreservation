export function smartTruncate(
  text: string,
  maxWords = 8
): string {
  const tokens = text.split(/\s+/);
  if (tokens.length <= maxWords) return text;

  let wordCount = 0;
  let bestStopIndex = -1;

  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];

    if (!current || !next) continue;

    wordCount++;
    if (wordCount < maxWords) continue;

    const endsWithSentencePunctuation = /[.!?]$/.test(current);
    const nextLooksLikeSentenceStart = /^[A-Z]/.test(next);

    if (endsWithSentencePunctuation && nextLooksLikeSentenceStart) {
      bestStopIndex = i;
      break;
    }
  }

  //Ideal stop: confident sentence end
  if (bestStopIndex !== -1) {
    return tokens.slice(0, bestStopIndex + 1).join(" ");
  }

  //Secondary: clause boundary (comma / semicolon)
  for (let i = Math.min(maxWords, tokens.length - 1); i >= 0; i--) {
    const token = tokens[i];
    if (token && /[;,]$/.test(token)) {
      return tokens.slice(0, i + 1).join(" ");
    }
  }

  //Absolute fallback
  return tokens.slice(0, maxWords).join(" ") + "…";
}
