export function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
