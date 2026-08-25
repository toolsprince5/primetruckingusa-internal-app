import { supabase } from './supabase';

export type AppRole = 'admin' | 'dispatcher' | 'driver';
export type ReceiptType = 'fuel' | 'toll' | 'repair' | 'other';
export type InspectionType = 'pre_trip' | 'post_trip' | 'other';
export type Profile = { id: string; full_name: string; email: string; role: AppRole };
export type AppMessage = { id: string; thread_id: string; sender_id: string; body: string; created_at: string };
export type WeeklyEarnings = { driver_id: string; week_start: string; payment_date: string; rate_cents: number; fuel_cents: number; net_cents: number };

function client() {
  if (!supabase) throw new Error('Supabase is not configured for this build.');
  return supabase;
}

function extensionFor(uri: string) {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : 'jpg';
}

async function uploadPrivateImage(bucket: 'receipts' | 'inspection-photos', ownerId: string, uri: string, prefix: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected image could not be read.');
  const blob = await response.blob();
  const storagePath = `${ownerId}/${prefix}-${Date.now()}.${extensionFor(uri)}`;
  const { error } = await client().storage.from(bucket).upload(storagePath, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return storagePath;
}

export async function signIn(email: string, password: string): Promise<Profile> {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('No user was returned after sign-in.');
  return getMyProfile(data.user.id);
}

/** Creates an account only after the server validates a one-time employee invite. */
export async function claimEmployeeInvite(token: string, password: string) {
  const { data, error } = await client().functions.invoke('claim-employee-invite', { body: { token, password } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { email: string; message: string };
}

export async function createEmployeeInvite(input: { email: string; fullName: string; role: 'driver' | 'dispatcher'; dispatcherId?: string }) {
  const { data, error } = await client().functions.invoke('create-employee-invite', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { id: string; expiresAt: string; inviteUrl: string; emailed: boolean };
}

export async function loadActiveDispatchers() {
  const { data, error } = await client().from('profiles').select('id, full_name, email, role').eq('role', 'dispatcher').eq('active', true).order('full_name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

/** Completes a password-recovery session opened from the Prime Trucking USA app link. */
export async function completePasswordRecovery(accessToken: string, refreshToken: string, password: string) {
  const { error: sessionError } = await client().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) throw sessionError;
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}

export async function getMyProfile(id: string): Promise<Profile> {
  const { data, error } = await client().from('profiles').select('id, full_name, email, role').eq('id', id).single();
  if (error) throw error;
  return data as Profile;
}

export async function loadMyLoads() {
  const { data, error } = await client().from('loads').select('id, load_number, rate_cents, pickup_name, pickup_address, pickup_at, delivery_name, delivery_address, delivery_at, status, rate_confirmations(id, storage_path, original_filename, acknowledged_at)').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRateConfirmationUrl(storagePath: string) {
  const { data, error } = await client().storage.from('rate-confirmations').createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadRateConfirmation(input: { loadId: string; uploadedBy: string; uri: string; filename: string; mimeType?: string | null }) {
  const response = await fetch(input.uri);
  if (!response.ok) throw new Error('The selected rate confirmation could not be read.');
  const blob = await response.blob();
  const storagePath = `${input.loadId}/${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: uploadError } = await client().storage.from('rate-confirmations').upload(storagePath, blob, { contentType: input.mimeType || blob.type || 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await client().from('rate_confirmations').insert({ load_id: input.loadId, storage_path: storagePath, original_filename: input.filename, uploaded_by: input.uploadedBy });
  if (error) throw error;
}

export async function loadReceipts() {
  const { data, error } = await client().from('receipts').select('id, driver_id, load_id, receipt_type, amount_cents, receipt_date, storage_path, notes, review_status, created_at').order('receipt_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveReceipt(input: { driverId: string; amountCents: number; receiptType: ReceiptType; imageUri: string; notes?: string; loadId?: string }) {
  const storagePath = await uploadPrivateImage('receipts', input.driverId, input.imageUri, input.receiptType);
  const { error } = await client().from('receipts').insert({ driver_id: input.driverId, load_id: input.loadId ?? null, receipt_type: input.receiptType, amount_cents: input.amountCents, storage_path: storagePath, notes: input.notes ?? null });
  if (error) throw error;
}

export async function reviewReceipt(receiptId: string, status: 'approved' | 'rejected', reviewerId: string) {
  const { error } = await client().from('receipts').update({ review_status: status, reviewed_by: reviewerId }).eq('id', receiptId);
  if (error) throw error;
}

export async function loadInspections() {
  const { data, error } = await client().from('inspection_reports').select('id, driver_id, load_id, inspection_type, checklist, comments, fault_reported, photo_paths, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function submitInspection(input: { driverId: string; inspectionType: InspectionType; checklist: Record<string, boolean>; comments?: string; faultReported: boolean; photoUris?: string[]; loadId?: string }) {
  const photoPaths = await Promise.all((input.photoUris ?? []).map((uri, index) => uploadPrivateImage('inspection-photos', input.driverId, uri, `inspection-${index}`)));
  const { error } = await client().from('inspection_reports').insert({ driver_id: input.driverId, load_id: input.loadId ?? null, inspection_type: input.inspectionType, checklist: input.checklist, comments: input.comments ?? null, fault_reported: input.faultReported, photo_paths: photoPaths });
  if (error) throw error;
}

export async function loadWeeklyEarnings() {
  const { data, error } = await client().from('weekly_driver_earnings').select('*').order('week_start', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WeeklyEarnings[];
}

export async function listConversationPartners(profile: Profile) {
  const { data, error } = await client().rpc('list_allowed_chat_partners');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function getOrCreateDirectThread(peerId: string) {
  const { data, error } = await client().rpc('get_or_create_direct_thread', { peer_id: peerId });
  if (error) throw error;
  return data as string;
}

export async function loadThreadMessages(threadId: string) {
  const { data, error } = await client().from('messages').select('id, thread_id, sender_id, body, created_at').eq('thread_id', threadId).order('created_at');
  if (error) throw error;
  return (data ?? []) as AppMessage[];
}

export async function sendThreadMessage(threadId: string, senderId: string, body: string) {
  const { error } = await client().from('messages').insert({ thread_id: threadId, sender_id: senderId, body: body.trim() });
  if (error) throw error;
}

export function subscribeToThread(threadId: string, onMessage: (message: AppMessage) => void) {
  return client().channel(`thread:${threadId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, (payload) => onMessage(payload.new as AppMessage)).subscribe();
}

export async function getTrackingSettings(driverId: string) {
  const { data, error } = await client().from('tracking_settings').select('driver_id, enabled, updated_at').eq('driver_id', driverId).maybeSingle();
  if (error) throw error;
  return data ?? { driver_id: driverId, enabled: true, updated_at: null };
}

export async function setTrackingEnabled(driverId: string, enabled: boolean, updatedBy: string) {
  const { error } = await client().from('tracking_settings').upsert({ driver_id: driverId, enabled, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function saveLocation(driverId: string, latitude: number, longitude: number) {
  const { error } = await client().from('location_events').insert({ driver_id: driverId, latitude, longitude });
  if (error) throw error;
}

export async function loadLatestLocations() {
  const { data, error } = await client().from('location_events').select('id, driver_id, latitude, longitude, recorded_at').order('recorded_at', { ascending: false }).limit(100);
  if (error) throw error;
  const newestByDriver = new Map<string, any>();
  for (const item of data ?? []) if (!newestByDriver.has(item.driver_id)) newestByDriver.set(item.driver_id, item);
  return [...newestByDriver.values()];
}
