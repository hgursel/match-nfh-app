export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export const MAX_PROFILE_BYTES = 100 * 1024; // 100 KB
export const MAX_MESSAGE_BYTES = 50 * 1024;  // 50 KB
