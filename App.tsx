import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
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
import { color, layout, radius, shadow, space, touchTarget, type } from './src/design/tokens';

type Role = 'Driver' | 'Dispatcher' | 'Admin';
type Screen = 'home' | 'messages' | 'loads' | 'receipts' | 'earnings' | 'inspections' | 'tracking' | 'settings';

const RED = color.brand.red;
const NAVY = color.brand.navy;
const INK = color.neutral[900];
const MIST = color.neutral[100];

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
  const [showDemoAccess, setShowDemoAccess] = useState(false);
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
      <SafeAreaView style={styles.loginSafe}>
        <StatusBar style="light" />
        <KeyboardAvoidingView style={styles.loginShell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.loginHero}>
              <View style={styles.heroRule} />
              <View style={styles.logoLockup} accessibilityLabel="Prime Trucking USA">
                <Text style={styles.logoPrime}>PRIME</Text>
                <View style={styles.logoRedLine} />
                <Text style={styles.logoTrucking}>TRUCKING</Text>
                <Text style={styles.logoUsa}>USA</Text>
              </View>
              <View style={styles.trustChip}><Text style={styles.trustChipText}>🇺🇸  LICENSED · INSURED · FMCSA REGISTERED</Text></View>
              <Text style={styles.loginHeading}>Your operations,{`\n`}always in motion.</Text>
              <Text style={styles.loginLead}>Secure access for Prime drivers, dispatchers, and administrators.</Text>
              <View style={styles.heroChecks}>
                <Text style={styles.heroCheck}>●  24/7 Dispatch</Text>
                <Text style={styles.heroCheck}>●  Live Load Visibility</Text>
              </View>
            </View>

            <View style={styles.loginPanel}>
              <View style={styles.panelHandle} />
              <Text style={styles.signInKicker}>EMPLOYEE ACCESS</Text>
              <Text style={styles.signInTitle}>Welcome back</Text>
              <Text style={styles.signInHelp}>Sign in with the account issued by Prime Trucking USA.</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.loginLabel}>WORK EMAIL</Text>
                <TextInput value={loginEmail} onChangeText={setLoginEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@primetruckingusa.com" placeholderTextColor="#98A2B3" style={styles.loginInput} />
              </View>
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}><Text style={styles.loginLabel}>PASSWORD</Text><Pressable onPress={() => Alert.alert('Password help', 'Contact your administrator to reset your employee password.')}><Text style={styles.forgot}>Need help?</Text></Pressable></View>
                <TextInput value={loginPassword} onChangeText={setLoginPassword} secureTextEntry placeholder="Enter your password" placeholderTextColor="#98A2B3" style={styles.loginInput} onSubmitEditing={productionSignIn} />
              </View>
              <Pressable style={[styles.loginPrimary, signingIn && styles.buttonDisabled]} onPress={productionSignIn} disabled={signingIn} accessibilityRole="button"><Text style={styles.loginPrimaryText}>{signingIn ? 'SIGNING IN…' : 'SIGN IN TO PORTAL'}</Text><Text style={styles.loginArrow}>→</Text></Pressable>
              <View style={styles.securityRow}><Text style={styles.securityDot}>●</Text><Text style={styles.securityText}>Secure, role-based employee access</Text></View>

              <Pressable style={styles.previewToggle} onPress={() => setShowDemoAccess((current) => !current)}><Text style={styles.previewToggleText}>{showDemoAccess ? 'Hide testing access' : 'Testing the app? Open role preview'}</Text><Text style={styles.previewToggleArrow}>{showDemoAccess ? '⌃' : '⌄'}</Text></Pressable>
              {showDemoAccess && <View style={styles.previewArea}>
                <Text style={styles.previewTitle}>SELECT A DEMO ROLE</Text>
                {(Object.keys(demo) as Role[]).map((option) => (
                  <Pressable key={option} onPress={() => setRole(option)} style={[styles.roleButton, role === option && styles.roleSelected]}>
                    <View><Text style={[styles.roleText, role === option && styles.roleTextSelected]}>{option}</Text><Text style={[styles.roleEmail, role === option && styles.roleTextSelected]}>{demo[option].email}</Text></View><Text style={[styles.roleArrow, role === option && styles.roleTextSelected]}>→</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.previewOpen} onPress={() => setSignedIn(true)}><Text style={styles.previewOpenText}>OPEN {role.toUpperCase()} PREVIEW</Text></Pressable>
              </View>}
              <Text style={styles.loginLegal}>By signing in, you agree to use this portal only for authorized Prime Trucking USA operations.</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  const [onDuty, setOnDuty] = useState(true);
  return <>
    {role === 'Driver' ? <>
      <View style={styles.driverStatusHeader}>
        <View><Text style={styles.driverStatusKicker}>TUESDAY • AUG 25</Text><Text style={styles.driverStatusTitle}>{onDuty ? 'You’re on duty' : 'You’re off duty'}</Text><Text style={styles.driverStatusDetail}>{onDuty ? 'Dispatch can see your location while on duty.' : 'Location sharing is paused.'}</Text></View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: onDuty }} onPress={() => setOnDuty((current) => !current)} style={[styles.dutyToggle, onDuty && styles.dutyToggleOn]}><View style={[styles.dutyKnob, onDuty && styles.dutyKnobOn]} /></Pressable>
      </View>
      <View style={styles.quickActions}>
        <Pressable style={styles.quickActionPrimary} onPress={() => setScreen('messages')}><Text style={styles.quickActionIcon}>✉</Text><View><Text style={styles.quickActionTitle}>Message Dispatcher</Text><Text style={styles.quickActionMeta}>1 new message</Text></View></Pressable>
        <Pressable style={styles.quickAction} onPress={() => setScreen('receipts')}><Text style={styles.quickActionIconBlue}>▣</Text><Text style={styles.quickActionText}>Receipt</Text></Pressable>
        <Pressable style={styles.quickAction} onPress={() => setScreen('inspections')}><Text style={styles.quickActionIconBlue}>✓</Text><Text style={styles.quickActionText}>Pre-trip</Text></Pressable>
      </View>
    </> : <>
      <Text style={styles.eyebrow}>GOOD MORNING</Text><Text style={styles.title}>{role}</Text>
    </>}
    {role !== 'Driver' && <Card><View style={styles.row}><View><Text style={styles.cardTitle}>Payment week</Text><Text style={styles.big}>Paid Friday, Aug 28</Text><Text style={styles.muted}>Aug 17 - Aug 23 work week</Text></View><Pill tone="green">On track</Pill></View></Card>}
    {role === 'Driver' ? <>
      <Card><View style={styles.row}><View><Text style={styles.cardEyebrow}>THIS WEEK’S TAKE HOME</Text><Text style={styles.amount}>{money(net * 0.25)}</Text><Text style={styles.muted}>At your 25% selection • paid Friday</Text></View><View style={styles.takeHomeMark}><Text style={styles.takeHomeMarkText}>$</Text></View></View><View style={styles.earningsMiniRow}><Text style={styles.earningsMiniLabel}>Delivered rates</Text><Text style={styles.earningsMiniValue}>{money(2900)}</Text><Text style={styles.earningsMiniLabel}>Approved fuel</Text><Text style={styles.earningsMiniNegative}>-{money(84.02)}</Text></View><Pressable onPress={() => setScreen('earnings')} style={styles.textButton}><Text style={styles.textButtonText}>View earnings breakdown  →</Text></Pressable></Card>
      <Card><View style={styles.row}><Text style={styles.cardEyebrow}>ACTIVE LOAD</Text><Pill tone="green">Rate confirmed</Pill></View><View style={styles.routeRow}><View style={styles.routeLine}><View style={styles.routeDotStart} /><View style={styles.routeDash} /><View style={styles.routeDotEnd} /></View><View style={styles.routeDetails}><Text style={styles.routeLabel}>PICKUP</Text><Text style={styles.routePlace}>Thermwell Products</Text><Text style={styles.routeAddress}>Mahwah, NJ</Text><Text style={styles.routeLabel}>DELIVERY</Text><Text style={styles.routePlace}>Menard</Text><Text style={styles.routeAddress}>Shelby, IA</Text></View></View><View style={styles.loadFooter}><View><Text style={styles.loadRate}>{money(2900)}</Text><Text style={styles.muted}>Confirmed rate</Text></View><Pressable style={styles.loadAction} onPress={() => setScreen('loads')}><Text style={styles.loadActionText}>View load</Text></Pressable></View></Card>
      <Card><View style={styles.row}><View><Text style={styles.cardTitle}>Dispatcher</Text><Text style={styles.messagePreview}>“Please confirm you received Load #4598933-1.”</Text></View><Pressable style={styles.messageButton} onPress={() => setScreen('messages')}><Text style={styles.messageButtonText}>Reply</Text></Pressable></View></Card>
      <Pressable style={styles.locationStrip} onPress={() => setScreen('tracking')}><Text style={styles.locationPin}>●</Text><View style={{ flex: 1 }}><Text style={styles.locationTitle}>{onDuty ? 'Location sharing is on' : 'Location sharing is paused'}</Text><Text style={styles.locationDetail}>{onDuty ? 'Last updated just now • View map' : 'Turn on duty to share your current location'}</Text></View><Text style={styles.locationArrow}>›</Text></Pressable>
      <View style={styles.payTimeline}><View style={styles.payTimelineLine}><View style={styles.payTimelineActive} /></View><Text style={styles.payTimelineText}>Work week ends Sunday • Payment releases Friday</Text></View>
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
  safe: { flex: 1, backgroundColor: MIST },
  loginSafe: { flex: 1, backgroundColor: NAVY },
  loginShell: { flex: 1 },
  loginScroll: { flexGrow: 1, backgroundColor: NAVY },
  loginHero: { minHeight: 334, paddingHorizontal: layout.screenPadding, paddingTop: space.lg, paddingBottom: space.xl, overflow: 'hidden', backgroundColor: NAVY },
  heroRule: { position: 'absolute', right: -70, top: 56, height: 220, width: 220, borderWidth: 28, borderColor: '#213E6C', borderRadius: 130, opacity: 0.72 },
  logoLockup: { alignSelf: 'flex-start', backgroundColor: 'white', paddingHorizontal: 10, paddingTop: 5, paddingBottom: 7, minWidth: 112, borderRadius: 2, elevation: 4 },
  logoPrime: { color: '#123C79', fontWeight: '900', fontSize: 18, letterSpacing: 0.5, lineHeight: 19 },
  logoRedLine: { backgroundColor: RED, height: 3, width: '100%', marginVertical: 2 },
  logoTrucking: { color: RED, fontWeight: '900', fontSize: 13, letterSpacing: 0.7, lineHeight: 15 },
  logoUsa: { position: 'absolute', right: 6, bottom: -17, color: '#123C79', fontWeight: '900', fontSize: 13, fontStyle: 'italic' },
  trustChip: { alignSelf: 'flex-start', marginTop: 37, borderWidth: 1.5, borderColor: RED, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: 'rgba(16,42,67,0.46)' },
  trustChipText: { color: 'white', fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.2 },
  loginHeading: { color: 'white', fontSize: 33, lineHeight: 37, fontWeight: '900', letterSpacing: -0.8, marginTop: 14, maxWidth: 350 },
  loginLead: { color: '#D5E1F2', fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 320 },
  heroChecks: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginTop: 19 },
  heroCheck: { color: 'white', fontSize: 11, fontWeight: '800' },
  loginPanel: { backgroundColor: color.neutral[0], borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, marginTop: -20, paddingHorizontal: layout.screenPadding, paddingTop: 13, paddingBottom: 29, minHeight: 480 },
  panelHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D9E1EC', alignSelf: 'center', marginBottom: 20 },
  signInKicker: { color: RED, fontSize: 11, fontWeight: '900', letterSpacing: 1.55 },
  signInTitle: { color: INK, fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 5 },
  signInHelp: { color: '#667085', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 20 },
  fieldGroup: { marginBottom: 15 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  loginLabel: { color: NAVY, fontSize: 10, fontWeight: '900', letterSpacing: 1.05, marginBottom: 7 },
  forgot: { color: RED, fontSize: 12, fontWeight: '800' },
  loginInput: { height: 50, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#DCE4EF', borderRadius: 9, paddingHorizontal: 14, color: INK, fontSize: 15 },
  loginPrimary: { backgroundColor: RED, minHeight: touchTarget.comfortable, borderRadius: radius.sm, paddingHorizontal: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, shadowColor: RED, shadowOpacity: 0.24, shadowRadius: 10, elevation: 3 },
  buttonDisabled: { opacity: 0.7 },
  loginPrimaryText: { color: 'white', fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  loginArrow: { color: 'white', fontSize: 21, fontWeight: '700' },
  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13 },
  securityDot: { color: '#12B76A', fontSize: 9 },
  securityText: { color: '#667085', fontSize: 11, fontWeight: '600' },
  previewToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E8EDF3', marginTop: 24, paddingTop: 17, paddingBottom: 2 },
  previewToggleText: { color: NAVY, fontSize: 12, fontWeight: '800' },
  previewToggleArrow: { color: RED, fontSize: 18, fontWeight: '900' },
  previewArea: { gap: 8, marginTop: 14 },
  previewTitle: { color: '#667085', fontWeight: '900', fontSize: 10, letterSpacing: 1, marginBottom: 2 },
  roleButton: { borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleSelected: { backgroundColor: NAVY, borderColor: NAVY },
  roleText: { color: INK, fontWeight: '800', fontSize: 13 },
  roleEmail: { color: '#667085', fontSize: 11, marginTop: 2 },
  roleArrow: { color: RED, fontSize: 17, fontWeight: '800' },
  roleTextSelected: { color: 'white' },
  previewOpen: { backgroundColor: '#EAF0F8', padding: 13, borderRadius: 8, alignItems: 'center', marginTop: 2 },
  previewOpenText: { color: NAVY, fontSize: 11, fontWeight: '900', letterSpacing: 0.55 },
  loginLegal: { color: '#98A2B3', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 22, paddingHorizontal: 8 },
  header: { backgroundColor: color.neutral[0], borderBottomWidth: 1, borderColor: '#E6EAF0', paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerBrand: { color: RED, fontWeight: '900', letterSpacing: 2, fontSize: 20 }, headerSub: { color: NAVY, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, profile: { backgroundColor: NAVY, color: 'white', width: 34, height: 34, textAlign: 'center', lineHeight: 34, borderRadius: 17, fontWeight: '800' }, content: { padding: layout.screenPadding, gap: 14, paddingBottom: 22 }, eyebrow: { color: RED, letterSpacing: 1.5, fontSize: 11, fontWeight: '900' }, title: { ...type.title, color: INK, marginBottom: 2 }, card: { backgroundColor: color.neutral[0], borderRadius: radius.lg, padding: layout.cardPadding, gap: 9, ...shadow.card }, cardTitle: { color: INK, fontSize: 15, fontWeight: '800' }, big: { color: NAVY, fontSize: 21, fontWeight: '900' }, amount: { ...type.money, color: NAVY }, muted: { color: '#667085', fontSize: 13, lineHeight: 19 }, body: { color: INK, fontSize: 14, lineHeight: 21 }, smallBold: { color: INK, fontWeight: '800', fontSize: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 4 }, divider: { height: 1, backgroundColor: '#E8EDF3', marginVertical: 5 }, pill: { overflow: 'hidden', color: '#145DA0', backgroundColor: '#E5F1FB', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '800' }, greenPill: { color: '#087443', backgroundColor: '#E2F7EC' }, redPill: { color: '#9F1724', backgroundColor: '#FDE8EA' }, primary: { backgroundColor: RED, minHeight: touchTarget.minimum, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, primaryText: { color: 'white', fontWeight: '800' }, outline: { borderWidth: 1, borderColor: NAVY, minHeight: touchTarget.minimum, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, outlineText: { color: NAVY, fontWeight: '800' }, danger: { backgroundColor: '#FDE8EA', minHeight: touchTarget.minimum, padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, dangerText: { color: '#9F1724', fontWeight: '800' }, label: { color: '#344054', fontSize: 13, fontWeight: '700' }, legal: { color: '#667085', fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 }, link: { color: RED, fontWeight: '800', marginTop: 5 }, grid: { flexDirection: 'row', gap: 12 }, action: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 16, minHeight: 112, justifyContent: 'space-between' }, actionIcon: { color: RED, fontSize: 25, fontWeight: '900' }, actionText: { color: NAVY, fontWeight: '800', fontSize: 13 }, bubble: { padding: 11, borderRadius: 12, color: INK, fontSize: 13, lineHeight: 18 }, driverBubble: { backgroundColor: '#E8F0FA', alignSelf: 'flex-end' }, dispatchBubble: { backgroundColor: '#F2F4F7', alignSelf: 'flex-start' }, compose: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }, input: { flex: 1, borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, color: INK }, send: { backgroundColor: RED, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }, notice: { color: '#667085', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 }, fullInput: { borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, padding: 11, fontSize: 16, color: INK }, uploadPreview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#E8EDF3' }, check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, checkMark: { color: '#087443', fontSize: 18, fontWeight: '900' }, map: { height: 230, borderRadius: 12, overflow: 'hidden' }, nav: { flexDirection: 'row', backgroundColor: 'white', borderTopWidth: 1, borderColor: '#E6EAF0', paddingVertical: 10 }, navItem: { flex: 1, alignItems: 'center' }, navText: { color: '#667085', fontSize: 11, fontWeight: '700' }, navActive: { color: RED, fontWeight: '900' },
  driverStatusHeader: { backgroundColor: NAVY, borderRadius: radius.lg, padding: layout.cardPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 118 }, driverStatusKicker: { color: '#D5E1F2', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, driverStatusTitle: { color: color.neutral[0], fontSize: 25, fontWeight: '900', marginTop: 4 }, driverStatusDetail: { color: '#D5E1F2', fontSize: 12, marginTop: 4, maxWidth: 240 }, dutyToggle: { width: 60, height: 34, borderRadius: 17, backgroundColor: color.neutral[500], padding: 4, justifyContent: 'center' }, dutyToggleOn: { backgroundColor: color.status.success }, dutyKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.neutral[0] }, dutyKnobOn: { alignSelf: 'flex-end' }, quickActions: { flexDirection: 'row', gap: 8 }, quickActionPrimary: { backgroundColor: RED, borderRadius: radius.md, padding: 12, minHeight: 76, flex: 1.9, flexDirection: 'row', alignItems: 'center', gap: 9 }, quickAction: { backgroundColor: color.neutral[0], borderRadius: radius.md, padding: 9, minHeight: 76, flex: 1, justifyContent: 'space-between', ...shadow.card }, quickActionIcon: { color: color.neutral[0], fontSize: 22, fontWeight: '900' }, quickActionIconBlue: { color: color.brand.blue, fontSize: 20, fontWeight: '900' }, quickActionTitle: { color: color.neutral[0], fontSize: 12, fontWeight: '900' }, quickActionMeta: { color: '#FAD4D8', fontSize: 10, fontWeight: '700', marginTop: 3 }, quickActionText: { color: NAVY, fontSize: 11, fontWeight: '900' }, cardEyebrow: { color: color.neutral[500], fontSize: 10, letterSpacing: 1.1, fontWeight: '900' }, takeHomeMark: { width: 42, height: 42, backgroundColor: color.status.successSoft, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, takeHomeMarkText: { color: color.status.success, fontSize: 22, fontWeight: '900' }, earningsMiniRow: { backgroundColor: color.neutral[50], borderRadius: radius.sm, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 }, earningsMiniLabel: { color: color.neutral[500], fontSize: 11, flexBasis: '62%' }, earningsMiniValue: { color: INK, fontSize: 11, fontWeight: '800', flexBasis: '36%', textAlign: 'right' }, earningsMiniNegative: { color: color.status.danger, fontSize: 11, fontWeight: '800', flexBasis: '36%', textAlign: 'right' }, textButton: { minHeight: touchTarget.minimum, justifyContent: 'center' }, textButtonText: { color: color.brand.blue, fontSize: 13, fontWeight: '900' }, routeRow: { flexDirection: 'row', gap: 12, marginTop: 2 }, routeLine: { alignItems: 'center', width: 16, paddingTop: 7 }, routeDotStart: { height: 10, width: 10, backgroundColor: color.brand.blue, borderRadius: 5 }, routeDash: { width: 2, flex: 1, minHeight: 50, backgroundColor: color.neutral[300], marginVertical: 4 }, routeDotEnd: { height: 10, width: 10, backgroundColor: RED, borderRadius: 5 }, routeDetails: { flex: 1, gap: 1 }, routeLabel: { color: color.neutral[500], fontSize: 10, letterSpacing: 0.9, fontWeight: '900' }, routePlace: { color: INK, fontSize: 14, fontWeight: '900' }, routeAddress: { color: color.neutral[500], fontSize: 12, marginBottom: 10 }, loadFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: color.neutral[200], paddingTop: 11, marginTop: 2 }, loadRate: { color: color.status.success, fontSize: 22, fontWeight: '900' }, loadAction: { backgroundColor: color.brand.blueSoft, minHeight: touchTarget.minimum, borderRadius: radius.sm, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, loadActionText: { color: color.brand.blue, fontSize: 12, fontWeight: '900' }, messagePreview: { color: color.neutral[600], fontSize: 12, marginTop: 5, maxWidth: 230, lineHeight: 18 }, messageButton: { minHeight: touchTarget.minimum, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, messageButtonText: { color: color.brand.blue, fontSize: 13, fontWeight: '900' }, locationStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, minHeight: 66, backgroundColor: color.brand.blueSoft, borderRadius: radius.md }, locationPin: { color: color.brand.blue, fontSize: 20 }, locationTitle: { color: NAVY, fontSize: 13, fontWeight: '900' }, locationDetail: { color: color.neutral[600], fontSize: 11, marginTop: 3 }, locationArrow: { color: color.brand.blue, fontSize: 28, fontWeight: '400' }, payTimeline: { paddingHorizontal: 2, paddingTop: 3 }, payTimelineLine: { height: 4, borderRadius: 2, backgroundColor: color.neutral[200], overflow: 'hidden' }, payTimelineActive: { height: 4, width: '48%', backgroundColor: color.status.success }, payTimelineText: { color: color.neutral[500], fontSize: 11, marginTop: 8, textAlign: 'center' },
});
