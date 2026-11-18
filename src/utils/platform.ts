/**
 * Returns true when running inside a macOS WebView / browser environment.
 */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac/i.test(platform) || /Macintosh/i.test(navigator.userAgent);
}

/**
 * Returns true when running inside a Windows WebView / browser environment.
 */
export function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /win/i.test(platform) || /Windows/i.test(navigator.userAgent);
}
