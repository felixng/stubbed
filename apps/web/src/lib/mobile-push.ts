export type MobilePushEligibility = "ios_home_screen" | "android" | "install_ios" | "desktop" | "unsupported";
export type PushContext = {
  userAgent: string; platform: string; maxTouchPoints: number; standalone: boolean;
  secure: boolean; serviceWorker: boolean; pushManager: boolean; notifications: boolean;
};
/** Capability alone never opts desktop browsers into delivery. No fingerprinting. */
export function mobilePushEligibility(c: PushContext): MobilePushEligibility {
  const ios = /iPad|iPhone|iPod/.test(c.userAgent) || (/Mac/.test(c.platform) && c.maxTouchPoints > 1);
  const android = /Android/i.test(c.userAgent);
  if (!ios && !android) return "desktop";
  if (ios && !c.standalone) return "install_ios";
  if (!c.secure || !c.serviceWorker || !c.pushManager || !c.notifications) return "unsupported";
  return ios ? "ios_home_screen" : "android";
}
export function canRegisterMobilePush(eligibility: MobilePushEligibility): eligibility is "ios_home_screen" | "android" {
  return eligibility === "ios_home_screen" || eligibility === "android";
}
/** Call from the direct Enable click before awaiting registration/network work. */
export async function requestMobilePermission(eligibility: MobilePushEligibility, permission: NotificationPermission, request: () => Promise<NotificationPermission>): Promise<NotificationPermission> {
  if (!canRegisterMobilePush(eligibility) || permission !== "default") return permission;
  return request();
}

export function effectivePushPermission(permission: NotificationPermission, refused: boolean): NotificationPermission {
  return permission === "granted" ? "granted" : refused ? "denied" : permission;
}
export function pushKeyMatches(expected: Uint8Array | null, existing: ArrayBuffer | null): boolean {
  if (!expected) return true;
  return !!existing && expected.length === existing.byteLength && expected.every((byte,index) => new Uint8Array(existing)[index] === byte);
}
