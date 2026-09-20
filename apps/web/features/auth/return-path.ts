export function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !/^\/(home|search|notifications|settings|clients|projects)(\/|\?|$)/.test(value) ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return "/home";
  return value;
}
