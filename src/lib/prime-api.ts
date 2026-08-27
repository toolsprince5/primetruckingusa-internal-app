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

async function uploadPrivateImage(bucket: 'receipts' | 'inspection-photos' | 'delivery-documents', ownerId: string, uri: string, prefix: string) {
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

export async function loadActiveDrivers() {
  const { data, error } = await client().from('profiles').select('id, full_name, email, role').eq('role', 'driver').eq('active', true).order('full_name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

/** Restores the employee session saved in the device's encrypted storage. */
export async function restoreSessionProfile(): Promise<Profile | null> {
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  if (!data.session?.user) return null;
  return getMyProfile(data.session.user.id);
}

/** Completes a password-recovery session opened from the Prime Trucking USA app link. */
export async function completePasswordRecovery(accessToken: string, refreshToken: string, password: string) {
  const { error: sessionError } = await client().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) throw sessionError;
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Sends a self-service password-reset email. Supabase issues the same generic
 * response whether or not the address belongs to an account, so this never
 * reveals which work emails exist.
 */
export async function requestPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email, {
    // HTTPS works in any browser. The reset page also offers an optional
    // "Open in app" action for employees who have the mobile app installed.
    redirectTo: 'https://primetruckingusa.com/reset-password/',
  });
  if (error) throw error;
}

export async function getMyProfile(id: string): Promise<Profile> {
  const { data, error } = await client().from('profiles').select('id, full_name, email, role').eq('id', id).single();
  if (error) throw error;
  return data as Profile;
}

export async function loadMyLoads() {
  const { data, error } = await client()
    .from('loads')
    .select('id, load_number, rate_cents, pickup_name, pickup_address, pickup_at, delivery_name, delivery_address, delivery_at, status, rate_confirmations(id, storage_path, original_filename, acknowledged_at, uploaded_by, created_at), delivery_documents(id, document_type, storage_path, original_filename, driver_id, created_at)')
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'rate_confirmations', ascending: false })
    .order('created_at', { referencedTable: 'delivery_documents', ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRateConfirmationUrl(storagePath: string) {
  const { data, error } = await client().storage.from('rate-confirmations').createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Uploads a rate confirmation for a load. Calling this again for a load that
 * already has one adds a new, separately timestamped version rather than
 * overwriting - the previous version(s) remain visible to admins/dispatch,
 * and the newest is treated as current. This is how a dispatcher "updates"
 * a rate confirmation when a broker resends one under the same load/document
 * number with revised terms.
 */
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

/** All rate confirmations a specific dispatcher has sent, newest first, for the admin activity view. */
export async function loadRateConfirmationsForDispatcher(dispatcherId: string) {
  const { data, error } = await client()
    .from('rate_confirmations')
    .select('id, load_id, storage_path, original_filename, created_at, loads(load_number)')
    .eq('uploaded_by', dispatcherId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
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

/** A signed link to view one receipt photo. Admins can open any driver's receipt this way. */
export async function getReceiptImageUrl(storagePath: string) {
  const { data, error } = await client().storage.from('receipts').createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

/** All of one driver's receipts, newest first, for the admin activity view. */
export async function loadReceiptsForDriver(driverId: string) {
  const { data, error } = await client().from('receipts').select('id, driver_id, load_id, receipt_type, amount_cents, receipt_date, storage_path, notes, review_status, reviewed_by, created_at, updated_at').eq('driver_id', driverId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadInspections() {
  const { data, error } = await client().from('inspection_reports').select('id, driver_id, load_id, inspection_type, checklist, comments, fault_reported, photo_paths, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** All of one driver's pre-trip/post-trip inspections, newest first, for the admin activity view. */
export async function loadInspectionsForDriver(driverId: string) {
  const { data, error } = await client().from('inspection_reports').select('id, driver_id, load_id, inspection_type, checklist, comments, fault_reported, photo_paths, created_at').eq('driver_id', driverId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A signed link to view one inspection photo. Admins can open any driver's inspection photo this way. */
export async function getInspectionPhotoUrl(storagePath: string) {
  const { data, error } = await client().storage.from('inspection-photos').createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function submitInspection(input: { driverId: string; inspectionType: InspectionType; checklist: Record<string, boolean>; comments?: string; faultReported: boolean; photoUris?: string[]; loadId?: string }) {
  const photoPaths = await Promise.all((input.photoUris ?? []).map((uri, index) => uploadPrivateImage('inspection-photos', input.driverId, uri, `inspection-${index}`)));
  const { error } = await client().from('inspection_reports').insert({ driver_id: input.driverId, load_id: input.loadId ?? null, inspection_type: input.inspectionType, checklist: input.checklist, comments: input.comments ?? null, fault_reported: input.faultReported, photo_paths: photoPaths });
  if (error) throw error;
}

export type DeliveryDocumentType = 'pod' | 'bol';

/** A driver sending a clear photo of the Proof of Delivery or Bill of Lading for a load. */
export async function uploadDeliveryDocument(input: { loadId: string; driverId: string; documentType: DeliveryDocumentType; uri: string; filename?: string }) {
  const storagePath = await uploadPrivateImage('delivery-documents', input.driverId, input.uri, input.documentType);
  const { error } = await client().from('delivery_documents').insert({ load_id: input.loadId, driver_id: input.driverId, document_type: input.documentType, storage_path: storagePath, original_filename: input.filename ?? null, uploaded_by: input.driverId });
  if (error) throw error;
}

/** All of one driver's POD/BOL uploads, newest first, for the admin activity view. */
export async function loadDeliveryDocumentsForDriver(driverId: string) {
  const { data, error } = await client().from('delivery_documents').select('id, load_id, driver_id, document_type, storage_path, original_filename, created_at, loads(load_number)').eq('driver_id', driverId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDeliveryDocumentUrl(storagePath: string) {
  const { data, error } = await client().storage.from('delivery-documents').createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
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

export type ChatThreadSummary = { id: string; title: string | null; is_group: boolean; created_at: string };

/** Creates a WhatsApp-style group thread. Admin-only at the database layer; the creator is always included as a member. */
export async function createGroupThread(title: string, memberIds: string[], creatorId: string) {
  const { data: thread, error: threadError } = await client().from('chat_threads').insert({ title, is_group: true, created_by: creatorId }).select('id').single();
  if (threadError) throw threadError;
  const uniqueMemberIds = [...new Set([creatorId, ...memberIds])];
  const { error: memberError } = await client().from('chat_members').insert(uniqueMemberIds.map((profile_id) => ({ thread_id: thread.id, profile_id })));
  if (memberError) throw memberError;
  return thread.id as string;
}

/** Every thread (direct or group) the given profile currently belongs to. */
export async function loadMyThreads(profileId: string) {
  const { data, error } = await client().from('chat_members').select('thread_id, chat_threads(id, title, is_group, created_at)').eq('profile_id', profileId);
  if (error) throw error;
  return (data ?? []).map((row: any) => row.chat_threads).filter(Boolean) as ChatThreadSummary[];
}

/**
 * The current members of one thread, for display and for the add/remove
 * participants panel. Uses list_thread_members() rather than a direct table
 * query: chat_members' own RLS only exposes the caller's own membership row
 * (by design, see 014_group_chat_management.sql), so listing co-members
 * needs the scoped RPC instead.
 */
export async function loadThreadMembers(threadId: string) {
  const { data, error } = await client().rpc('list_thread_members', { thread_id: threadId });
  if (error) throw error;
  return (data ?? []) as (Profile & { joined_at: string })[];
}

/** Admin, or a dispatcher already in the group, adding a participant. Enforced by RLS either way. */
export async function addThreadMember(threadId: string, profileId: string) {
  const { error } = await client().from('chat_members').insert({ thread_id: threadId, profile_id: profileId });
  if (error) throw error;
}

/** Admin, or a dispatcher already in the group, removing a participant. Enforced by RLS either way. */
export async function removeThreadMember(threadId: string, profileId: string) {
  const { error } = await client().from('chat_members').delete().eq('thread_id', threadId).eq('profile_id', profileId);
  if (error) throw error;
}

export async function getTrackingSettings(driverId: string) {
  const { data, error } = await client().from('tracking_settings').select('driver_id, enabled, on_duty, updated_at').eq('driver_id', driverId).maybeSingle();
  if (error) throw error;
  return data ?? { driver_id: driverId, enabled: true, on_duty: true, updated_at: null };
}

/** Admin-only override. Turning this off always wins over the driver's own duty status. */
export async function setTrackingEnabled(driverId: string, enabled: boolean, updatedBy: string) {
  const { error } = await client().from('tracking_settings').upsert({ driver_id: driverId, enabled, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** A driver starting or ending their own workday. Cannot override an admin's tracking pause. */
export async function setDriverDutyStatus(driverId: string, onDuty: boolean) {
  const { error } = await client().from('tracking_settings').upsert({ driver_id: driverId, on_duty: onDuty, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' });
  if (error) throw error;
}

export type DriverLocation = {
  id?: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  heading_degrees?: number | null;
  speed_mps?: number | null;
  recorded_at: string;
};

export async function saveLocationTelemetry(input: {
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  recordedAt?: string;
}) {
  const { error } = await client().from('location_events').insert({
    driver_id: input.driverId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_meters: input.accuracy ?? null,
    heading_degrees: input.heading ?? null,
    speed_mps: input.speed ?? null,
    recorded_at: input.recordedAt ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadLatestLocations() {
  const { data, error } = await client().from('location_events').select('id, driver_id, latitude, longitude, accuracy_meters, heading_degrees, speed_mps, recorded_at').order('recorded_at', { ascending: false }).limit(250);
  if (error) throw error;
  const newestByDriver = new Map<string, any>();
  for (const item of data ?? []) if (!newestByDriver.has(item.driver_id)) newestByDriver.set(item.driver_id, item);
  return [...newestByDriver.values()];
}

export function subscribeToFleetLocations(onLocation: (location: DriverLocation) => void) {
  return client().channel('fleet-location-events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_events' }, (payload) => onLocation(payload.new as DriverLocation))
    .subscribe();
}

export function subscribeToTrackingSetting(driverId: string, onChange: (setting: { enabled: boolean; on_duty: boolean }) => void) {
  return client().channel(`tracking:${driverId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tracking_settings', filter: `driver_id=eq.${driverId}` }, (payload) => onChange(payload.new as { enabled: boolean; on_duty: boolean }))
    .subscribe();
}
