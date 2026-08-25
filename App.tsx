import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import MapView, { Marker } from 'react-native-maps';
import { isSupabaseConfigured } from './src/lib/supabase';
import {
  getOrCreateDirectThread,
  getRateConfirmationUrl,
  getTrackingSettings,
  listConversationPartners,
  loadInspections,
  loadLatestLocations,
  loadMyLoads,
  loadReceipts,
  loadThreadMessages,
  loadWeeklyEarnings,
  reviewReceipt,
  saveLocation,
  saveReceipt,
  sendThreadMessage,
  setTrackingEnabled,
  signIn,
  signOut,
  submitInspection,
  subscribeToThread,
  type AppMessage,
  type Profile,
  uploadRateConfirmation,
} from './src/lib/prime-api';
import { registerPushDevice } from './src/lib/notifications';

type Role = 'Driver' | 'Dispatcher' | 'Admin';
type Screen = 'home' | 'messages' | 'loads' | 'receipts' | 'earnings' | 'inspections' | 'tracking' | 'settings';

const RED = '#B51F2B';
const NAVY = '#102A43';
const INK = '#172B4D';
const MIST = '#F4F7FA';

const demo = {
  Driver: { name: 'Driver', email: 'driver.test@primetruckingusa.com' },
  Dispatcher: { name: 'Dispatcher', email: 'dispatch.test@primetruckingusa.com' },
  Admin: { name: 'Admin', email: 'admin.test@primetruckingusa.com' },
} satisfies Record<Role, { name: string; email: string }>;

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

function Pill({ children, tone = 'blue' }: { children: string; tone?: 'blue' | 'green' | 'red' }) {
  return <Text style={[styles.pill, tone === 'green' && styles.greenPill, tone === 'red' && styles.redPill]}>{children}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export default function App() {
  const [role, setRole] = useState<Role>('Driver');
  const [signedIn, setSignedIn] = useState(false);
  const [authenticatedProfile, setAuthenticatedProfile] = useState<Profile | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [share, setShare] = useState(true);
  const [fuel, setFuel] = useState(84.02);
  const [percentage, setPercentage] = useState('25');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(['Dispatcher: Please confirm you received Load #4598933-1.', 'Driver: Received. I will complete the pre-trip inspection before pickup.']);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [inspectionUri, setInspectionUri] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState('Driver • location not yet refreshed');
  const [locationCoords, setLocationCoords] = useState({ latitude: 41.6528, longitude: -83.5379 });

  const loadTotal = 2900;
  const net = useMemo(() => loadTotal - fuel, [fuel]);
  const takeHome = net * ((Number(percentage) || 0) / 100);
  const person = authenticatedProfile
    ? { name: authenticatedProfile.full_name || authenticatedProfile.role, email: authenticatedProfile.email }
    : demo[role];

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages((current) => [...current, `${person.name}: ${message.trim()}`]);
    setMessage('');
  };

  const productionSignIn = async () => {
    if (!isSupabaseConfigured) return Alert.alert('Preview build', 'This local preview is not configured with public Supabase build variables yet. Use a role preview below, or add the variables in .env / your EAS secrets.');
    if (!loginEmail || !loginPassword) return Alert.alert('Enter your details', 'Enter your email and password to sign in.');
    setSigningIn(true);
    try {
      const profile = await signIn(loginEmail.trim(), loginPassword);
      setAuthenticatedProfile(profile);
      setRole(profile.role.charAt(0).toUpperCase() + profile.role.slice(1) as Role);
      setSignedIn(true);
      setLoginPassword('');
      registerPushDevice(profile.id).catch(() => undefined);
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Please check your login details and try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const leaveApp = async () => {
    if (authenticatedProfile) {
      try { await signOut(); } catch { /* local UI can still return to sign-in if the network is unavailable */ }
    }
    setAuthenticatedProfile(null);
    setSignedIn(false);
  };

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.login}>
          <Text style={styles.flag}>PRIME TRUCKING USA</Text>
          <Text style={styles.brand}>Employee Portal</Text>
          <Text style={styles.subtitle}>Dispatch. Drive. Deliver.</Text>
          <Card>
            <Text style={styles.label}>Secure employee sign-in</Text>
            <TextInput value={loginEmail} onChangeText={setLoginEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" style={styles.fullInput} />
            <TextInput value={loginPassword} onChangeText={setLoginPassword} secureTextEntry placeholder="Password" style={styles.fullInput} />
            <Pressable style={styles.primary} onPress={productionSignIn} disabled={signingIn}><Text style={styles.primaryText}>{signingIn ? 'Signing in…' : 'Sign in securely'}</Text></Pressable>
            <View style={styles.divider} />
            <Text style={styles.label}>Preview as a role</Text>
            {(Object.keys(demo) as Role[]).map((option) => (
              <Pressable key={option} onPress={() => setRole(option)} style={[styles.roleButton, role === option && styles.roleSelected]}>
                <Text style={[styles.roleText, role === option && styles.roleTextSelected]}>{option}</Text>
                <Text style={[styles.roleEmail, role === option && styles.roleTextSelected]}>{demo[option].email}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.outline} onPress={() => setSignedIn(true)}><Text style={styles.outlineText}>Open selected preview</Text></Pressable>
          </Card>
          <Text style={styles.legal}>Prototype only. Production access will use invite-only accounts and secure password reset.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const nav: { key: Screen; title: string }[] = role === 'Driver'
    ? [{ key: 'home', title: 'Home' }, { key: 'messages', title: 'Messages' }, { key: 'loads', title: 'Load' }, { key: 'earnings', title: 'Pay' }, { key: 'tracking', title: 'Track' }]
    : [{ key: 'home', title: 'Home' }, { key: 'messages', title: 'Messages' }, { key: 'loads', title: 'Loads' }, { key: 'tracking', title: 'Map' }, { key: 'settings', title: 'Admin' }];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View><Text style={styles.headerBrand}>PRIME</Text><Text style={styles.headerSub}>TRUCKING USA</Text></View>
        <Pressable onPress={leaveApp}><Text style={styles.profile}>{person.name.slice(0, 1)}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {screen === 'home' && <Home role={role} setScreen={setScreen} net={net} />}
        {screen === 'messages' && <Messages role={role} profile={authenticatedProfile} messages={messages} message={message} setMessage={setMessage} sendMessage={sendMessage} />}
        {screen === 'loads' && <Loads role={role} profile={authenticatedProfile} />}
        {screen === 'receipts' && <Receipts profile={authenticatedProfile} fuel={fuel} setFuel={setFuel} receiptUri={receiptUri} setReceiptUri={setReceiptUri} />}
        {screen === 'earnings' && <Earnings profile={authenticatedProfile} net={net} fuel={fuel} percentage={percentage} setPercentage={setPercentage} takeHome={takeHome} />}
        {screen === 'inspections' && <Inspections profile={authenticatedProfile} inspectionUri={inspectionUri} setInspectionUri={setInspectionUri} />}
        {screen === 'tracking' && <Tracking role={role} profile={authenticatedProfile} share={share} setShare={setShare} locationLabel={locationLabel} setLocationLabel={setLocationLabel} locationCoords={locationCoords} setLocationCoords={setLocationCoords} />}
        {screen === 'settings' && <Settings role={role} share={share} setShare={setShare} />}
      </ScrollView>
      <View style={styles.nav}>{nav.map((item) => <Pressable key={item.key} style={styles.navItem} onPress={() => setScreen(item.key)}><Text style={[styles.navText, screen === item.key && styles.navActive]}>{item.title}</Text></Pressable>)}</View>
    </SafeAreaView>
  );
}

function Home({ role, setScreen, net }: { role: Role; setScreen: (screen: Screen) => void; net: number }) {
  return <>
    <Text style={styles.eyebrow}>GOOD MORNING</Text><Text style={styles.title}>{role}</Text>
    <Card><View style={styles.row}><View><Text style={styles.cardTitle}>Payment week</Text><Text style={styles.big}>Paid Friday, Aug 28</Text><Text style={styles.muted}>Aug 17 - Aug 23 work week</Text></View><Pill tone="green">On track</Pill></View></Card>
    {role === 'Driver' ? <>
      <Card><Text style={styles.cardTitle}>This week’s estimate</Text><Text style={styles.amount}>{money(net)}</Text><Text style={styles.muted}>After approved fuel receipts</Text><View style={styles.divider} /><View style={styles.row}><Text style={styles.smallBold}>Load #4598933-1</Text><Pill>Assigned</Pill></View><Text style={styles.muted}>Pickup: Mahwah, NJ • Delivery: Shelby, IA</Text><Pressable onPress={() => setScreen('loads')}><Text style={styles.link}>Open load details →</Text></Pressable></Card>
      <View style={styles.grid}><Pressable style={styles.action} onPress={() => setScreen('receipts')}><Text style={styles.actionIcon}>+</Text><Text style={styles.actionText}>Upload fuel receipt</Text></Pressable><Pressable style={styles.action} onPress={() => setScreen('inspections')}><Text style={styles.actionIcon}>✓</Text><Text style={styles.actionText}>Pre-trip check</Text></Pressable></View>
    </> : <>
      <View style={styles.grid}><Card><Text style={styles.cardTitle}>Drivers active</Text><Text style={styles.amount}>1</Text><Text style={styles.muted}>Driver is on duty</Text></Card><Card><Text style={styles.cardTitle}>Open load</Text><Text style={styles.amount}>1</Text><Text style={styles.muted}>Rate: $2,900.00</Text></Card></View>
      <Card><Text style={styles.cardTitle}>Attention needed</Text><Text style={styles.smallBold}>Fuel receipt waiting for review</Text><Text style={styles.muted}>Driver uploaded a $84.02 fuel receipt.</Text><Pressable onPress={() => setScreen('receipts')}><Text style={styles.link}>Review receipt →</Text></Pressable></Card>
    </>}
  </>;
}

function Messages({ role, profile, messages, message, setMessage, sendMessage }: { role: Role; profile: Profile | null; messages: string[]; message: string; setMessage: (value: string) => void; sendMessage: () => void }) {
  const [partners, setPartners] = useState<Profile[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Profile | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<AppMessage[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!profile) return; listConversationPartners(profile).then((people) => { setPartners(people); setSelectedPartner(people[0] ?? null); }).catch(() => undefined); }, [profile?.id]);
  useEffect(() => { if (!profile || !selectedPartner) return; let active = true; getOrCreateDirectThread(selectedPartner.id).then(async (id) => { if (!active) return; setThreadId(id); setLiveMessages(await loadThreadMessages(id)); }).catch((e) => Alert.alert('Messages unavailable', e instanceof Error ? e.message : 'Please try again.')); return () => { active = false; }; }, [profile?.id, selectedPartner?.id]);
  useEffect(() => { if (!threadId) return; const channel = subscribeToThread(threadId, (next) => setLiveMessages((current) => current.some((item) => item.id === next.id) ? current : [...current, next])); return () => { channel.unsubscribe(); }; }, [threadId]);
  const sendLive = async () => { if (!profile || !threadId || !message.trim()) return; setBusy(true); try { await sendThreadMessage(threadId, profile.id, message); setMessage(''); } catch (e) { Alert.alert('Message not sent', e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } };
  const shown = profile ? liveMessages : messages.map((body, index) => ({ id: String(index), sender_id: body.startsWith('Driver') ? 'driver' : 'dispatch', body, thread_id: '', created_at: '' }));
  return <><Text style={styles.title}>Messages</Text><Card><View style={styles.row}><View><Text style={styles.cardTitle}>{selectedPartner?.full_name || (role === 'Driver' ? 'Dispatcher' : 'Driver')}</Text><Text style={styles.muted}>Direct operational chat</Text></View><Pill tone="green">Available</Pill></View>{profile && partners.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{partners.map((partner) => <Pressable key={partner.id} onPress={() => setSelectedPartner(partner)}><Pill tone={selectedPartner?.id === partner.id ? 'green' : 'blue'}>{partner.full_name || partner.role}</Pill></Pressable>)}</ScrollView>}</Card><Card>{shown.map((item) => <Text key={item.id} style={[styles.bubble, item.sender_id === profile?.id || item.sender_id === 'driver' ? styles.driverBubble : styles.dispatchBubble]}>{item.body}</Text>)}<View style={styles.compose}><TextInput value={message} onChangeText={setMessage} placeholder="Write a message" style={styles.input} /><Pressable onPress={profile ? sendLive : sendMessage} disabled={busy} style={styles.send}><Text style={styles.primaryText}>{busy ? '…' : 'Send'}</Text></Pressable></View></Card><Text style={styles.notice}>Drivers may message only their dispatcher and admins. Admins can review operational conversations.</Text><Pressable style={styles.outline} onPress={() => Alert.alert('Calls', 'Secure Stream voice and video calling is connected at the server layer. The native call screen is the next build step.')}><Text style={styles.outlineText}>Start voice or video call</Text></Pressable></>;
}

function Loads({ role, profile }: { role: Role; profile: Profile | null }) {
  const [loads, setLoads] = useState<any[]>([]);
  const refreshLoads = () => loadMyLoads().then(setLoads).catch((e) => Alert.alert('Loads unavailable', e instanceof Error ? e.message : 'Please try again.'));
  useEffect(() => { if (profile) refreshLoads(); }, [profile?.id]);
  const activeLoads = profile ? loads : [{ id: 'demo', load_number: '4598933-1', rate_cents: 290000, pickup_name: 'Thermwell Products', pickup_address: 'Mahwah, NJ', delivery_name: 'Menard', delivery_address: 'Shelby, IA', status: 'assigned', rate_confirmations: [] }];
  const attachRateConfirmation = async (loadId: string) => { if (!profile) return Alert.alert('Preview only', 'Sign in to send a rate confirmation.'); const selected = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false }); if (selected.canceled) return; const file = selected.assets[0]; try { await uploadRateConfirmation({ loadId, uploadedBy: profile.id, uri: file.uri, filename: file.name || 'rate-confirmation.pdf', mimeType: file.mimeType }); await refreshLoads(); Alert.alert('Sent', 'The rate confirmation is now available securely to the assigned driver.'); } catch (e) { Alert.alert('Document not sent', e instanceof Error ? e.message : 'Please try again.'); } };
  return <><Text style={styles.title}>{role === 'Driver' ? 'My Load' : 'Load Management'}</Text>{activeLoads.length === 0 && <Card><Text style={styles.muted}>No assigned loads yet.</Text></Card>}{activeLoads.map((load) => <Card key={load.id}><View style={styles.row}><Text style={styles.smallBold}>Load #{load.load_number}</Text><Pill tone="green">{load.status}</Pill></View><Text style={styles.amount}>{money(load.rate_cents / 100)}</Text><Text style={styles.muted}>Rate confirmation total</Text><View style={styles.divider} /><Text style={styles.cardTitle}>Pickup</Text><Text style={styles.body}>{load.pickup_name || '—'} • {load.pickup_address || '—'}</Text><Text style={styles.cardTitle}>Delivery</Text><Text style={styles.body}>{load.delivery_name || '—'}</Text>{load.rate_confirmations?.[0] && <Pressable style={styles.outline} onPress={async () => { try { await Linking.openURL(await getRateConfirmationUrl(load.rate_confirmations[0].storage_path)); } catch (e) { Alert.alert('Document unavailable', e instanceof Error ? e.message : 'Please try again.'); } }}><Text style={styles.outlineText}>View rate confirmation</Text></Pressable>}{profile && (profile.role === 'dispatcher' || profile.role === 'admin') && <Pressable style={styles.primary} onPress={() => attachRateConfirmation(load.id)}><Text style={styles.primaryText}>Send rate confirmation PDF</Text></Pressable>}</Card>)}</>;
}

function Receipts({ profile, fuel, setFuel, receiptUri, setReceiptUri }: { profile: Profile | null; fuel: number; setFuel: (amount: number) => void; receiptUri: string | null; setReceiptUri: (uri: string | null) => void }) {
  const [amount, setAmount] = useState(String(fuel));
  const [receipts, setReceipts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const refresh = () => profile && loadReceipts().then(setReceipts).catch(() => undefined);
  useEffect(() => { refresh(); }, [profile?.id]);
  const chooseReceipt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to attach a fuel receipt.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) setReceiptUri(result.assets[0].uri);
  };
  const latest = receipts[0];
  const submit = async () => { const value = Number(amount); if (!Number.isFinite(value) || value <= 0) return Alert.alert('Check the amount', 'Enter a valid fuel amount.'); if (!receiptUri) return Alert.alert('Add the receipt photo', 'Choose a receipt image before saving.'); if (!profile) { setFuel(value); return Alert.alert('Saved locally', 'Connect Supabase to save this receipt for dispatcher review.'); } setSaving(true); try { await saveReceipt({ driverId: profile.id, amountCents: Math.round(value * 100), receiptType: 'fuel', imageUri: receiptUri }); setFuel(value); setReceiptUri(null); refresh(); Alert.alert('Submitted', 'Your fuel receipt is in private storage and awaiting review.'); } catch (e) { Alert.alert('Receipt not saved', e instanceof Error ? e.message : 'Please try again.'); } finally { setSaving(false); } };
  return <><Text style={styles.title}>Fuel Receipts</Text>{latest && <Card><Text style={styles.cardTitle}>Latest receipt</Text><Text style={styles.amount}>{money(latest.amount_cents / 100)}</Text><Text style={styles.muted}>{latest.receipt_type} • {latest.review_status}</Text>{profile && profile.role !== 'driver' && latest.review_status === 'pending' && <View style={styles.row}><Pressable style={styles.outline} onPress={async () => { await reviewReceipt(latest.id, 'approved', profile.id); refresh(); }}><Text style={styles.outlineText}>Approve</Text></Pressable><Pressable style={styles.danger} onPress={async () => { await reviewReceipt(latest.id, 'rejected', profile.id); refresh(); }}><Text style={styles.dangerText}>Reject</Text></Pressable></View>}</Card>}<Card><Text style={styles.cardTitle}>Upload fuel receipt</Text><Text style={styles.label}>Fuel amount</Text><TextInput value={amount} keyboardType="decimal-pad" onChangeText={setAmount} style={styles.fullInput} />{receiptUri && <Image source={{ uri: receiptUri }} style={styles.uploadPreview} accessibilityLabel="Selected fuel receipt" />}<Pressable style={styles.outline} onPress={chooseReceipt}><Text style={styles.outlineText}>{receiptUri ? 'Replace receipt photo' : 'Add receipt photo'}</Text></Pressable><Pressable style={styles.primary} onPress={submit} disabled={saving}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Submit fuel receipt'}</Text></Pressable></Card></>;
}

function Earnings({ profile, net, fuel, percentage, setPercentage, takeHome }: { profile: Profile | null; net: number; fuel: number; percentage: string; setPercentage: (value: string) => void; takeHome: number }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  useEffect(() => { if (profile) loadWeeklyEarnings().then(setWeeks).catch((e) => Alert.alert('Earnings unavailable', e instanceof Error ? e.message : 'Please try again.')); }, [profile?.id]);
  const week = profile ? weeks[0] : { payment_date: '2026-08-28', week_start: '2026-08-17', rate_cents: 290000, fuel_cents: Math.round(fuel * 100), net_cents: Math.round(net * 100) };
  const liveNet = week ? week.net_cents / 100 : 0;
  const liveTakeHome = liveNet * ((Number(percentage) || 0) / 100);
  return <><Text style={styles.title}>Weekly Earnings</Text>{!week && <Card><Text style={styles.muted}>No completed work week is available yet.</Text></Card>}{week && <Card><Pill tone="green">{`Payment Friday, ${new Date(`${week.payment_date}T12:00:00`).toLocaleDateString()}`}</Pill><Text style={styles.cardTitle}>{new Date(`${week.week_start}T12:00:00`).toLocaleDateString()} work week • paid one week behind</Text><View style={styles.line}><Text style={styles.body}>Delivered rate confirmations</Text><Text style={styles.smallBold}>{money(week.rate_cents / 100)}</Text></View><View style={styles.line}><Text style={styles.body}>Approved fuel only</Text><Text style={styles.smallBold}>-{money(week.fuel_cents / 100)}</Text></View><View style={styles.divider} /><View style={styles.line}><Text style={styles.cardTitle}>Net after fuel</Text><Text style={styles.big}>{money(liveNet)}</Text></View></Card>}<Card><Text style={styles.cardTitle}>Your percentage estimate</Text><TextInput value={percentage} keyboardType="decimal-pad" onChangeText={setPercentage} style={styles.fullInput} /><Text style={styles.amount}>{money(profile ? liveTakeHome : takeHome)}</Text><Text style={styles.muted}>Fuel is the only deduction in this estimate. Final amount requires approval.</Text></Card></>;
}

function Inspections({ profile, inspectionUri, setInspectionUri }: { profile: Profile | null; inspectionUri: string | null; setInspectionUri: (uri: string | null) => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({ brakes: false, lights: false, fluids: false, trailer: false });
  const [comments, setComments] = useState('');
  const [fault, setFault] = useState(false);
  const [saving, setSaving] = useState(false);
  const addInspectionPhoto = async () => {
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (!camera.granted) return Alert.alert('Camera permission needed', 'Allow camera access to document the inspection.');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setInspectionUri(result.assets[0].uri);
  };
  const items = [['brakes', 'Brakes and tires checked'], ['lights', 'Lights and mirrors checked'], ['fluids', 'Fluids checked'], ['trailer', 'Trailer and securement checked']] as const;
  const submit = async () => { if (!profile) return Alert.alert('Preview only', 'Connect Supabase to submit an inspection.'); setSaving(true); try { await submitInspection({ driverId: profile.id, inspectionType: 'pre_trip', checklist: checks, comments, faultReported: fault, photoUris: inspectionUri ? [inspectionUri] : [] }); setInspectionUri(null); setComments(''); setFault(false); Alert.alert('Inspection submitted', fault ? 'Your fault report is visible to dispatch and admin.' : 'Dispatch can now review your pre-trip inspection.'); } catch (e) { Alert.alert('Inspection not saved', e instanceof Error ? e.message : 'Please try again.'); } finally { setSaving(false); } };
  return <><Text style={styles.title}>Pre-trip Inspection</Text><Card><Text style={styles.muted}>Complete before beginning this load.</Text>{items.map(([key, label]) => <Pressable key={key} style={styles.check} onPress={() => setChecks((current) => ({ ...current, [key]: !current[key] }))}><Text style={styles.checkMark}>{checks[key] ? '✓' : '○'}</Text><Text style={styles.body}>{label}</Text></Pressable>)}<TextInput value={comments} onChangeText={setComments} multiline placeholder="Comments or fault details" style={styles.fullInput} />{inspectionUri && <Image source={{ uri: inspectionUri }} style={styles.uploadPreview} accessibilityLabel="Inspection photo" />}<Pressable style={styles.outline} onPress={addInspectionPhoto}><Text style={styles.outlineText}>Take inspection photo</Text></Pressable><Pressable style={fault ? styles.danger : styles.outline} onPress={() => setFault(!fault)}><Text style={fault ? styles.dangerText : styles.outlineText}>{fault ? 'Fault will be reported' : 'Report a fault'}</Text></Pressable><Pressable style={styles.primary} onPress={submit} disabled={saving}><Text style={styles.primaryText}>{saving ? 'Submitting…' : 'Submit inspection'}</Text></Pressable></Card></>;
}

function Tracking({ role, profile, share, setShare, locationLabel, setLocationLabel, locationCoords, setLocationCoords }: { role: Role; profile: Profile | null; share: boolean; setShare: (enabled: boolean) => void; locationLabel: string; setLocationLabel: (label: string) => void; locationCoords: { latitude: number; longitude: number }; setLocationCoords: (coords: { latitude: number; longitude: number }) => void }) {
  useEffect(() => { if (!profile) return; if (profile.role === 'driver') getTrackingSettings(profile.id).then((setting) => setShare(setting.enabled)).catch(() => undefined); else loadLatestLocations().then((items: any[]) => { if (items[0]) { setLocationCoords({ latitude: items[0].latitude, longitude: items[0].longitude }); setLocationLabel(`Driver • updated ${new Date(items[0].recorded_at).toLocaleTimeString()}`); } }).catch(() => undefined); }, [profile?.id]);
  const refreshLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location permission needed', 'Allow location access so dispatch can see the active load location.');
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocationCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    setLocationLabel(`Driver • ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
    if (profile && share && profile.role === 'driver') await saveLocation(profile.id, position.coords.latitude, position.coords.longitude);
  };
  const toggle = async () => { const next = !share; if (profile?.role === 'admin') { try { const locations: any[] = await loadLatestLocations(); const targetDriverId = locations[0]?.driver_id; if (!targetDriverId) return Alert.alert('No driver selected', 'A driver must send a location before tracking can be changed here.'); await setTrackingEnabled(targetDriverId, next, profile.id); } catch (e) { return Alert.alert('Tracking not updated', e instanceof Error ? e.message : 'Please try again.'); } } setShare(next); };
  return <><Text style={styles.title}>{role === 'Driver' ? 'Live Tracking' : 'Driver Map'}</Text><Card><MapView style={styles.map} region={{ ...locationCoords, latitudeDelta: 0.16, longitudeDelta: 0.16 }}><Marker coordinate={locationCoords} title="Prime Trucking USA driver" description={locationLabel} pinColor={RED} /></MapView><View style={styles.row}><View><Text style={styles.cardTitle}>{share ? 'Tracking is active' : 'Tracking paused'}</Text><Text style={styles.muted}>Refresh sends your current location to dispatch.</Text></View><Pill tone={share ? 'green' : 'red'}>{share ? 'Live' : 'Off'}</Pill></View></Card>{share && role === 'Driver' && <Pressable style={styles.outline} onPress={refreshLocation}><Text style={styles.outlineText}>Send current location</Text></Pressable>}{role === 'Admin' && <Pressable style={share ? styles.danger : styles.primary} onPress={toggle}><Text style={share ? styles.dangerText : styles.primaryText}>{share ? 'Turn off driver tracking' : 'Turn on driver tracking'}</Text></Pressable>}<Text style={styles.notice}>Background location must be enabled in the production build. This screen writes each driver update securely to Supabase when tracking is active.</Text></>;
}

function Settings({ role, share, setShare }: { role: Role; share: boolean; setShare: (enabled: boolean) => void }) { if (role !== 'Admin') return <Text style={styles.title}>Settings available to admins only.</Text>; return <><Text style={styles.title}>Admin Controls</Text><Card><Text style={styles.cardTitle}>Demo employee access</Text>{(['Admin', 'Dispatcher', 'Driver'] as Role[]).map((item) => <View key={item} style={styles.line}><View><Text style={styles.smallBold}>{item}</Text><Text style={styles.muted}>{demo[item].email}</Text></View><Pill>{item}</Pill></View>)}</Card><Card><Text style={styles.cardTitle}>Tracking control</Text><Text style={styles.muted}>Driver tracking is currently {share ? 'enabled' : 'disabled'}.</Text><Pressable style={share ? styles.danger : styles.primary} onPress={() => setShare(!share)}><Text style={share ? styles.dangerText : styles.primaryText}>{share ? 'Disable tracking' : 'Enable tracking'}</Text></Pressable></Card></>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MIST }, login: { flex: 1, padding: 24, justifyContent: 'center' }, flag: { color: RED, fontSize: 12, fontWeight: '900', letterSpacing: 2 }, brand: { color: NAVY, fontSize: 34, fontWeight: '900', marginTop: 6 }, subtitle: { color: '#5E6C84', fontSize: 16, marginBottom: 28 }, header: { backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E6EAF0', paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerBrand: { color: RED, fontWeight: '900', letterSpacing: 2, fontSize: 20 }, headerSub: { color: NAVY, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, profile: { backgroundColor: NAVY, color: 'white', width: 34, height: 34, textAlign: 'center', lineHeight: 34, borderRadius: 17, fontWeight: '800' }, content: { padding: 18, gap: 14, paddingBottom: 22 }, eyebrow: { color: RED, letterSpacing: 1.5, fontSize: 11, fontWeight: '900' }, title: { fontSize: 28, color: INK, fontWeight: '900', marginBottom: 2 }, card: { backgroundColor: 'white', borderRadius: 16, padding: 16, gap: 9, shadowColor: '#1F2933', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }, cardTitle: { color: INK, fontSize: 15, fontWeight: '800' }, big: { color: NAVY, fontSize: 21, fontWeight: '900' }, amount: { color: NAVY, fontSize: 30, fontWeight: '900' }, muted: { color: '#667085', fontSize: 13, lineHeight: 19 }, body: { color: INK, fontSize: 14, lineHeight: 21 }, smallBold: { color: INK, fontWeight: '800', fontSize: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 4 }, divider: { height: 1, backgroundColor: '#E8EDF3', marginVertical: 5 }, pill: { overflow: 'hidden', color: '#145DA0', backgroundColor: '#E5F1FB', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '800' }, greenPill: { color: '#087443', backgroundColor: '#E2F7EC' }, redPill: { color: '#9F1724', backgroundColor: '#FDE8EA' }, primary: { backgroundColor: RED, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 3 }, primaryText: { color: 'white', fontWeight: '800' }, outline: { borderWidth: 1, borderColor: NAVY, padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 5 }, outlineText: { color: NAVY, fontWeight: '800' }, danger: { backgroundColor: '#FDE8EA', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 }, dangerText: { color: '#9F1724', fontWeight: '800' }, roleButton: { borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 10, padding: 12, gap: 2 }, roleSelected: { backgroundColor: NAVY, borderColor: NAVY }, roleText: { color: INK, fontWeight: '800' }, roleEmail: { color: '#667085', fontSize: 12 }, roleTextSelected: { color: 'white' }, label: { color: '#344054', fontSize: 13, fontWeight: '700' }, legal: { color: '#667085', fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 }, link: { color: RED, fontWeight: '800', marginTop: 5 }, grid: { flexDirection: 'row', gap: 12 }, action: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 16, minHeight: 112, justifyContent: 'space-between' }, actionIcon: { color: RED, fontSize: 25, fontWeight: '900' }, actionText: { color: NAVY, fontWeight: '800', fontSize: 13 }, bubble: { padding: 11, borderRadius: 12, color: INK, fontSize: 13, lineHeight: 18 }, driverBubble: { backgroundColor: '#E8F0FA', alignSelf: 'flex-end' }, dispatchBubble: { backgroundColor: '#F2F4F7', alignSelf: 'flex-start' }, compose: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }, input: { flex: 1, borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, color: INK }, send: { backgroundColor: RED, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }, notice: { color: '#667085', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 }, fullInput: { borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, padding: 11, fontSize: 16, color: INK }, uploadPreview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#E8EDF3' }, check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, checkMark: { color: '#087443', fontSize: 18, fontWeight: '900' }, map: { height: 230, borderRadius: 12, overflow: 'hidden' }, nav: { flexDirection: 'row', backgroundColor: 'white', borderTopWidth: 1, borderColor: '#E6EAF0', paddingVertical: 10 }, navItem: { flex: 1, alignItems: 'center' }, navText: { color: '#667085', fontSize: 11, fontWeight: '700' }, navActive: { color: RED, fontWeight: '900' }
});
