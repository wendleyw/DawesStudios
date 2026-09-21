// Next's client-side navigation leaves keyboard focus on <body> after the redirect out of /login,
// so a keyboard user lands on the workspace with no visible focus at all. sessionStorage carries the
// "a sign-in just happened" signal across that navigation (it does not survive a hard reload of an
// already-authenticated page, so it never fires outside the sign-in path); the workspace shell reads
// and clears it once, moving focus to the page's main landmark.
const FLAG = "dawes:focus-main-after-sign-in";

export function markPostSignInFocus() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // Storage can be unavailable (private browsing, disabled storage); the redirect still succeeds,
    // it just falls back to the browser's default focus handling.
  }
}

export function consumePostSignInFocus(): boolean {
  try {
    if (sessionStorage.getItem(FLAG) !== "1") return false;
    sessionStorage.removeItem(FLAG);
    return true;
  } catch {
    return false;
  }
}
