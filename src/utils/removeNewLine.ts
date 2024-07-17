export function removeNewLine(text: string): string {
  return text.trim().replaceAll("\n", " ")
}
