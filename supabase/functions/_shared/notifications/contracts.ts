/** Accepted means provider acceptance, never proof of device delivery. */
export type SendResult = "accepted" | "retryable" | "invalid_destination" | "permanent";
export type Alert = { id: string; title: string; body: string; url: string; recipient_id?: string };
export type NativeDestination = { token: string; environment: "sandbox" | "production" };
export interface NativePushSender { send(destination: NativeDestination, alert: Alert, expiresAt: Date): Promise<SendResult> }
export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export interface BrowserPushSender { send(subscription: BrowserSubscription, alert: Alert, expiresAt: Date): Promise<SendResult> }
export type PreparedJob = {
  kind: "apns" | "web"; token: string; environment: "sandbox" | "production";
  subscription: BrowserSubscription | null; notification: Alert; expires_at: string;
};
export type Lease = { job_id: string; lease_id: string };
export interface DeliveryQueue {
  claim(): Promise<Lease[]>;
  prepare(lease: Lease): Promise<PreparedJob | null>;
  finish(lease: Lease, result: SendResult): Promise<void>;
}
