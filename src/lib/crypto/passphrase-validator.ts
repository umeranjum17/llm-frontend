export interface PassphraseStrength {
  score: 0 | 1 | 2 | 3 | 4;
  feedback: string[];
  isAcceptable: boolean;
}

const COMMON_PASSWORDS = new Set([
  "password",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "monkey",
  "1234567",
  "letmein",
  "trustno1",
  "dragon",
  "baseball",
  "iloveyou",
  "master",
  "sunshine",
  "ashley",
  "bailey",
  "passw0rd",
  "shadow",
]);

export function validatePassphraseStrength(passphrase: string): PassphraseStrength {
  const feedback: string[] = [];
  let score = 0;

  if (passphrase.length < 12) {
    feedback.push("Use at least 12 characters.");
    return { score: 0, feedback, isAcceptable: false };
  }

  if (passphrase.length >= 12) score++;
  if (passphrase.length >= 16) score++;

  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasNumber = /[0-9]/.test(passphrase);
  const hasSymbol = /[^a-zA-Z0-9]/.test(passphrase);

  const classCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
  if (classCount >= 2) score++;
  if (classCount >= 3) score++;

  if (COMMON_PASSWORDS.has(passphrase.toLowerCase())) {
    feedback.push("This passphrase is too common. Choose something unique.");
    return { score: 0, feedback, isAcceptable: false };
  }

  if (/(.)\1{2,}/.test(passphrase)) {
    feedback.push("Avoid repeated characters (e.g., 'aaa', '111').");
    score = Math.max(0, score - 1);
  }

  if (/012|123|234|345|456|567|678|789|890|abc|bcd|cde|def/.test(passphrase.toLowerCase())) {
    feedback.push("Avoid sequential patterns (e.g., '123', 'abc').");
    score = Math.max(0, score - 1);
  }

  const isAcceptable = passphrase.length >= 12 && classCount >= 2 && score >= 2;

  const normalizedScore = Math.min(4, Math.max(0, score)) as PassphraseStrength["score"];

  if (normalizedScore >= 4) {
    feedback.push("Excellent passphrase.");
  } else if (normalizedScore === 3) {
    feedback.push("Strong passphrase.");
  } else if (normalizedScore === 2) {
    feedback.push("Moderate strength. Add more character types for extra safety.");
  } else {
    feedback.push("Weak passphrase. Use 12+ characters with mixed types.");
  }

  return { score: normalizedScore, feedback, isAcceptable };
}
