import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
  setDriverDutyStatus,
  setTrackingEnabled,
  claimEmployeeInvite,
  createEmployeeInvite,
  completePasswordRecovery,
  requestPasswordReset,
  loadActiveDispatchers,
  loadActiveDrivers,
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

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

/**
 * Turns a caught error into a message safe to show an employee. Recognized
 * network/session/permission patterns get a plain-English explanation;
 * anything else - including raw Postgres/Supabase error text, which can
 * describe internal table/policy names - falls back to the caller's own
 * generic message instead of ever surfacing that raw text in the UI.
 */
function friendlyError(error: unknown, fallback: string): string {
  const text = (error instanceof Error ? error.message : '').toLowerCase();
  if (!text) return fallback;
  if (text.includes('failed to fetch') || text.includes('network request failed') || text.includes('networkerror')) return 'Check your internet connection and try again.';
  if (text.includes('jwt') || text.includes('refresh token') || (text.includes('session') && text.includes('expired'))) return 'Your session has expired. Please sign in again.';
  if (text.includes('invalid login credentials')) return 'That email or password is incorrect.';
  if (text.includes('row-level security') || text.includes('permission denied')) return 'You don’t have permission to do that.';
  if (text.includes('duplicate key') || text.includes('already exists')) return 'That already exists.';
  return fallback;
}

function Pill({ children, tone = 'blue' }: { children: string; tone?: 'blue' | 'green' | 'red' }) {
  return <Text style={[styles.pill, tone === 'green' && styles.greenPill, tone === 'red' && styles.redPill]}>{children}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function PasswordField({ value, onChangeText, placeholder, onSubmitEditing, newPassword }: { value: string; onChangeText: (value: string) => void; placeholder: string; onSubmitEditing?: () => void; newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.passwordFieldRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        style={styles.passwordFieldInput}
        onSubmitEditing={onSubmitEditing}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={newPassword ? 'newPassword' : 'password'}
        autoComplete={newPassword ? 'password-new' : 'password'}
        accessibilityLabel={newPassword ? 'New password' : 'Password'}
      />
      <Pressable onPress={() => setVisible((current) => !current)} style={styles.passwordToggle} hitSlop={8} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        <Text style={styles.passwordToggleText}>{visible ? 'HIDE' : 'SHOW'}</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [role, setRole] = useState<Role>('Driver');
  const [signedIn, setSignedIn] = useState(false);
  const [authenticatedProfile, setAuthenticatedProfile] = useState<Profile | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [claimingInvite, setClaimingInvite] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState('');
  const [recoveryRefreshToken, setRecoveryRefreshToken] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [savingRecoveryPassword, setSavingRecoveryPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // Two separately owned fields, mirroring tracking_settings: `trackingAllowed` is the
  // administrator's override (read-only here; changed only from the Admin Tracking screen),
  // and `onDuty` is this driver's own choice, changeable from the Home screen. Both are
  // lifted to this level so they persist across screen switches instead of resetting.
  const [trackingAllowed, setTrackingAllowed] = useState(true);
  const [onDuty, setOnDuty] = useState(true);
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
    : { name: 'Employee', email: '' };

  const openLink = (url?: string | null) => {
    if (!url) return;
    const token = url.match(/[?&]token=([^&]+)/)?.[1];
    if (token) {
      setRecoveryMode(false);
      setForgotMode(false);
      setInviteToken(decodeURIComponent(token));
      setInviteMode(true);
      return;
    }
    const fragment = url.split('#')[1] ?? '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken && params.get('type') === 'recovery') {
      setInviteMode(false);
      setForgotMode(false);
      setRecoveryAccessToken(accessToken);
      setRecoveryRefreshToken(refreshToken);
      setRecoveryMode(true);
    }
  };

  useEffect(() => {
    Linking.getInitialURL().then(openLink).catch(() => undefined);
    const listener = Linking.addEventListener('url', ({ url }) => openLink(url));
    return () => listener.remove();
  }, []);

  // Fetch once per sign-in so on-duty status survives switching screens instead
  // of resetting, and so the driver sees an admin's tracking pause immediately.
  useEffect(() => {
    if (!authenticatedProfile || authenticatedProfile.role !== 'driver') return;
    getTrackingSettings(authenticatedProfile.id).then((setting: any) => {
      setTrackingAllowed(setting.enabled);
      setOnDuty(setting.on_duty ?? true);
    }).catch(() => undefined);
  }, [authenticatedProfile?.id]);

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
      Alert.alert('Sign-in failed', friendlyError(error, 'Please check your login details and try again.'));
    } finally {
      setSigningIn(false);
    }
  };

  const claimInvite = async () => {
    if (!inviteToken || !invitePassword) return Alert.alert('Complete account setup', 'Open your invite link and choose a password of at least 12 characters.');
    if (invitePassword.length < 12) return Alert.alert('Choose a stronger password', 'Your password must be at least 12 characters.');
    setClaimingInvite(true);
    try {
      const result = await claimEmployeeInvite(inviteToken.trim(), invitePassword);
      setLoginEmail(result.email);
      setLoginPassword('');
      setInvitePassword('');
      setInviteToken('');
      setInviteMode(false);
      Alert.alert('Account ready', 'Your account has been set up. Sign in with your work email and the password you just created.');
    } catch (error) {
      Alert.alert('Invite unavailable', friendlyError(error, 'This invite may have expired or already been used.'));
    } finally {
      setClaimingInvite(false);
    }
  };

  const saveRecoveryPassword = async () => {
    if (recoveryPassword.length < 12) return Alert.alert('Choose a stronger password', 'Your password must be at least 12 characters.');
    setSavingRecoveryPassword(true);
    try {
      await completePasswordRecovery(recoveryAccessToken, recoveryRefreshToken, recoveryPassword);
      setRecoveryPassword('');
      setRecoveryMode(false);
      Alert.alert('Password updated', 'Your password is ready. Sign in with your work email.');
    } catch (error) {
      Alert.alert('Password update failed', friendlyError(error, 'Request a new password link and try again.'));
    } finally {
      setSavingRecoveryPassword(false);
    }
  };

  const requestReset = async () => {
    if (!isSupabaseConfigured) return Alert.alert('Preview build', 'This local preview is not configured with public Supabase build variables yet.');
    if (!forgotEmail.trim()) return Alert.alert('Enter your email', 'Enter the work email on your account to receive a reset link.');
    setSendingReset(true);
    try {
      await requestPasswordReset(forgotEmail.trim());
      Alert.alert('Check your email', 'If an account exists for that address, a password reset link is on its way. The link expires shortly, so use it soon.');
      setForgotMode(false);
    } catch (error) {
      Alert.alert('Reset link not sent', friendlyError(error, 'Please try again.'));
    } finally {
      setSendingReset(false);
    }
  };

  const leaveApp = async () => {
    if (authenticatedProfile) {
      try { await signOut(); } catch { /* local UI can still return to sign-in if the network is unavailable */ }
    }
    setAuthenticatedProfile(null);
    setSignedIn(false);
    setTrackingAllowed(true);
    setOnDuty(true);
  };

  if (!signedIn) {
    return (
      <SafeAreaView style={[styles.loginSafe, isLandscape && styles.loginSafeLandscape]}>
        <StatusBar style="light" />
        <KeyboardAvoidingView style={styles.loginShell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.loginScroll, isLandscape && styles.loginScrollLandscape]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.loginHero, isLandscape && styles.loginHeroLandscape]}>
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

            <View style={[styles.loginPanel, isLandscape && styles.loginPanelLandscape]}>
              <View style={styles.panelHandle} />
              <Text style={styles.signInKicker}>{recoveryMode ? 'SECURE PASSWORD RESET' : inviteMode ? 'INVITED EMPLOYEE SETUP' : forgotMode ? 'PASSWORD RESET' : 'EMPLOYEE ACCESS'}</Text>
              <Text style={styles.signInTitle}>{recoveryMode ? 'Choose a new password' : inviteMode ? 'Create your account' : forgotMode ? 'Reset your password' : 'Welcome back'}</Text>
              <Text style={styles.signInHelp}>{recoveryMode ? 'Set a new password for your Prime Trucking USA employee account.' : inviteMode ? 'This one-time link is valid for eight hours. Your role has already been assigned by Prime Trucking USA.' : forgotMode ? 'Enter your work email. We will send a secure, one-time link to reset your password.' : 'Sign in with the account issued by Prime Trucking USA.'}</Text>
              {recoveryMode ? <>
                <View style={styles.fieldGroup}><Text style={styles.loginLabel}>NEW PASSWORD</Text><PasswordField value={recoveryPassword} onChangeText={setRecoveryPassword} placeholder="At least 12 characters" onSubmitEditing={saveRecoveryPassword} newPassword /></View>
                <Pressable style={[styles.loginPrimary, savingRecoveryPassword && styles.buttonDisabled]} onPress={saveRecoveryPassword} disabled={savingRecoveryPassword} accessibilityRole="button"><Text style={styles.loginPrimaryText}>{savingRecoveryPassword ? 'UPDATING PASSWORD…' : 'SAVE NEW PASSWORD'}</Text><Text style={styles.loginArrow}>→</Text></Pressable>
              </> : inviteMode ? <>
                <View style={styles.fieldGroup}><Text style={styles.loginLabel}>INVITE TOKEN</Text><TextInput value={inviteToken} onChangeText={setInviteToken} autoCapitalize="none" autoCorrect={false} placeholder="Paste the token from your invite link" placeholderTextColor="#98A2B3" style={styles.loginInput} accessibilityLabel="Invite token" /></View>
                <View style={styles.fieldGroup}><Text style={styles.loginLabel}>CREATE PASSWORD</Text><PasswordField value={invitePassword} onChangeText={setInvitePassword} placeholder="At least 12 characters" onSubmitEditing={claimInvite} newPassword /></View>
                <Pressable style={[styles.loginPrimary, claimingInvite && styles.buttonDisabled]} onPress={claimInvite} disabled={claimingInvite} accessibilityRole="button"><Text style={styles.loginPrimaryText}>{claimingInvite ? 'CREATING ACCOUNT…' : 'CREATE SECURE ACCOUNT'}</Text><Text style={styles.loginArrow}>→</Text></Pressable>
                <Pressable style={styles.previewToggle} onPress={() => setInviteMode(false)}><Text style={styles.previewToggleText}>Already have an account? Sign in</Text></Pressable>
              </> : forgotMode ? <>
                <View style={styles.fieldGroup}><Text style={styles.loginLabel}>WORK EMAIL</Text><TextInput value={forgotEmail} onChangeText={setForgotEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@primetruckingusa.com" placeholderTextColor="#98A2B3" style={styles.loginInput} onSubmitEditing={requestReset} accessibilityLabel="Work email" /></View>
                <Pressable style={[styles.loginPrimary, sendingReset && styles.buttonDisabled]} onPress={requestReset} disabled={sendingReset} accessibilityRole="button"><Text style={styles.loginPrimaryText}>{sendingReset ? 'SENDING LINK…' : 'SEND RESET LINK'}</Text><Text style={styles.loginArrow}>→</Text></Pressable>
                <Pressable style={styles.previewToggle} onPress={() => setForgotMode(false)}><Text style={styles.previewToggleText}>Back to sign in</Text></Pressable>
              </> : <>
                <View style={styles.fieldGroup}><Text style={styles.loginLabel}>WORK EMAIL</Text><TextInput value={loginEmail} onChangeText={setLoginEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@primetruckingusa.com" placeholderTextColor="#98A2B3" style={styles.loginInput} accessibilityLabel="Work email" /></View>
                <View style={styles.fieldGroup}><View style={styles.fieldLabelRow}><Text style={styles.loginLabel}>PASSWORD</Text><Pressable onPress={() => { setForgotEmail(loginEmail); setForgotMode(true); }}><Text style={styles.forgot}>Forgot password?</Text></Pressable></View><PasswordField value={loginPassword} onChangeText={setLoginPassword} placeholder="Enter your password" onSubmitEditing={productionSignIn} /></View>
                <Pressable style={[styles.loginPrimary, signingIn && styles.buttonDisabled]} onPress={productionSignIn} disabled={signingIn} accessibilityRole="button"><Text style={styles.loginPrimaryText}>{signingIn ? 'SIGNING IN…' : 'SIGN IN TO PORTAL'}</Text><Text style={styles.loginArrow}>→</Text></Pressable>
              </>}
              <View style={styles.securityRow}><Text style={styles.securityDot}>●</Text><Text style={styles.securityText}>Secure, role-based employee access</Text></View>
              {!inviteMode && !recoveryMode && !forgotMode && <Pressable style={styles.previewToggle} onPress={() => setInviteMode(true)}><Text style={styles.previewToggleText}>Have an employee invite? Set up your account</Text><Text style={styles.previewToggleArrow}>→</Text></Pressable>}
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
    <SafeAreaView style={[styles.safe, isLandscape && styles.safeLandscape]}>
      <StatusBar style="dark" />
      <View style={[styles.header, isLandscape && styles.headerLandscape]}>
        <View><Text style={styles.headerBrand}>PRIME</Text><Text style={styles.headerSub}>TRUCKING USA</Text></View>
        <Pressable onPress={() => setProfileMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Account menu"><Text style={styles.profile}>{person.name.slice(0, 1)}</Text></Pressable>
      </View>
      {profileMenuOpen && <>
        <Pressable style={styles.profileMenuBackdrop} onPress={() => setProfileMenuOpen(false)} accessibilityLabel="Close account menu" />
        <View style={styles.profileMenu}>
          <View style={styles.profileMenuHeader}>
            <Text style={styles.profileMenuName}>{person.name}</Text>
            {!!person.email && <Text style={styles.profileMenuEmail}>{person.email}</Text>}
            <Text style={styles.profileMenuRole}>{role.toUpperCase()}</Text>
          </View>
          <View style={styles.profileMenuDivider} />
          <Pressable style={styles.profileMenuSignOut} onPress={() => { setProfileMenuOpen(false); leaveApp(); }} accessibilityRole="button"><Text style={styles.profileMenuSignOutText}>Sign out</Text></Pressable>
        </View>
      </>}
      <ScrollView contentContainerStyle={[styles.content, isLandscape && styles.contentLandscape]}>
        {screen === 'home' && <Home role={role} profile={authenticatedProfile} setScreen={setScreen} net={net} onDuty={onDuty} setOnDuty={setOnDuty} trackingAllowed={trackingAllowed} />}
        {screen === 'messages' && <Messages role={role} profile={authenticatedProfile} messages={messages} message={message} setMessage={setMessage} sendMessage={sendMessage} />}
        {screen === 'loads' && <Loads role={role} profile={authenticatedProfile} />}
        {screen === 'receipts' && <Receipts profile={authenticatedProfile} fuel={fuel} setFuel={setFuel} receiptUri={receiptUri} setReceiptUri={setReceiptUri} />}
        {screen === 'earnings' && <Earnings profile={authenticatedProfile} net={net} fuel={fuel} percentage={percentage} setPercentage={setPercentage} takeHome={takeHome} />}
        {screen === 'inspections' && <Inspections profile={authenticatedProfile} inspectionUri={inspectionUri} setInspectionUri={setInspectionUri} />}
        {screen === 'tracking' && <Tracking role={role} profile={authenticatedProfile} trackingAllowed={trackingAllowed} onDuty={onDuty} locationLabel={locationLabel} setLocationLabel={setLocationLabel} locationCoords={locationCoords} setLocationCoords={setLocationCoords} />}
        {screen === 'settings' && <Settings role={role} />}
      </ScrollView>
      <View style={[styles.nav, isLandscape && styles.navLandscape]}>{nav.map((item) => <Pressable key={item.key} style={styles.navItem} onPress={() => setScreen(item.key)}><Text style={[styles.navText, screen === item.key && styles.navActive]}>{item.title}</Text></Pressable>)}</View>
    </SafeAreaView>
  );
}

function Home({ role, profile, setScreen, net, onDuty, setOnDuty, trackingAllowed }: { role: Role; profile: Profile | null; setScreen: (screen: Screen) => void; net: number; onDuty: boolean; setOnDuty: (value: boolean) => void; trackingAllowed: boolean }) {
  const [pendingReceipts, setPendingReceipts] = useState<any[]>([]);
  const [savingDuty, setSavingDuty] = useState(false);
  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    loadReceipts().then((items: any[]) => setPendingReceipts(items.filter((item) => item.review_status === 'pending'))).catch(() => undefined);
  }, [profile?.id]);
  const toggleDuty = async () => {
    if (!profile || !trackingAllowed) return;
    const next = !onDuty;
    setOnDuty(next);
    setSavingDuty(true);
    try { await setDriverDutyStatus(profile.id, next); }
    catch (e) { setOnDuty(!next); Alert.alert('Duty status not saved', friendlyError(e, 'Please try again.')); }
    finally { setSavingDuty(false); }
  };
  const sharing = trackingAllowed && onDuty;
  return <>
    {role === 'Driver' ? <>
      <View style={styles.driverStatusHeader}>
        <View><Text style={styles.driverStatusKicker}>TUESDAY • AUG 25</Text><Text style={styles.driverStatusTitle}>{onDuty ? 'You’re on duty' : 'You’re off duty'}</Text><Text style={styles.driverStatusDetail}>{!trackingAllowed ? 'Your administrator has paused location sharing for your account.' : onDuty ? 'Dispatch can see your location while on duty.' : 'Location sharing is paused.'}</Text></View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: onDuty, disabled: !trackingAllowed || savingDuty }} disabled={!trackingAllowed || savingDuty} onPress={toggleDuty} style={[styles.dutyToggle, onDuty && trackingAllowed && styles.dutyToggleOn, !trackingAllowed && styles.dutyToggleDisabled]}><View style={[styles.dutyKnob, onDuty && trackingAllowed && styles.dutyKnobOn]} /></Pressable>
      </View>
      <View style={styles.quickActions}>
        <Pressable style={styles.quickActionPrimary} onPress={() => setScreen('messages')} accessibilityRole="button" accessibilityLabel="Message dispatcher, 1 new message"><Text style={styles.quickActionIcon} accessible={false}>✉</Text><View><Text style={styles.quickActionTitle}>Message Dispatcher</Text><Text style={styles.quickActionMeta}>1 new message</Text></View></Pressable>
        <Pressable style={styles.quickAction} onPress={() => setScreen('receipts')} accessibilityRole="button" accessibilityLabel="Fuel receipts"><Text style={styles.quickActionIconBlue} accessible={false}>▣</Text><Text style={styles.quickActionText}>Receipt</Text></Pressable>
        <Pressable style={styles.quickAction} onPress={() => setScreen('inspections')} accessibilityRole="button" accessibilityLabel="Pre-trip inspection"><Text style={styles.quickActionIconBlue} accessible={false}>✓</Text><Text style={styles.quickActionText}>Pre-trip</Text></Pressable>
      </View>
    </> : <>
      <Text style={styles.eyebrow}>{role === 'Admin' ? 'LIVE OPERATIONS' : 'DISPATCH CENTER'}</Text><Text style={styles.title}>{role === 'Admin' ? 'Admin dashboard' : 'Dispatcher dashboard'}</Text>
    </>}
    {role !== 'Driver' && <Card><View style={styles.row}><View><Text style={styles.cardTitle}>Payment week</Text><Text style={styles.big}>Paid Friday, Aug 28</Text><Text style={styles.muted}>Aug 17 - Aug 23 work week</Text></View><Pill tone="green">On track</Pill></View></Card>}
    {role === 'Driver' ? <>
      <Card><View style={styles.row}><View><Text style={styles.cardEyebrow}>THIS WEEK’S TAKE HOME</Text><Text style={styles.amount}>{money(net * 0.25)}</Text><Text style={styles.muted}>At your 25% selection • paid Friday</Text></View><View style={styles.takeHomeMark}><Text style={styles.takeHomeMarkText}>$</Text></View></View><View style={styles.earningsMiniRow}><Text style={styles.earningsMiniLabel}>Delivered rates</Text><Text style={styles.earningsMiniValue}>{money(2900)}</Text><Text style={styles.earningsMiniLabel}>Approved fuel</Text><Text style={styles.earningsMiniNegative}>-{money(84.02)}</Text></View><Pressable onPress={() => setScreen('earnings')} style={styles.textButton}><Text style={styles.textButtonText}>View earnings breakdown  →</Text></Pressable></Card>
      <Card><View style={styles.row}><Text style={styles.cardEyebrow}>ACTIVE LOAD</Text><Pill tone="green">Rate confirmed</Pill></View><View style={styles.routeRow}><View style={styles.routeLine}><View style={styles.routeDotStart} /><View style={styles.routeDash} /><View style={styles.routeDotEnd} /></View><View style={styles.routeDetails}><Text style={styles.routeLabel}>PICKUP</Text><Text style={styles.routePlace}>Thermwell Products</Text><Text style={styles.routeAddress}>Mahwah, NJ</Text><Text style={styles.routeLabel}>DELIVERY</Text><Text style={styles.routePlace}>Menard</Text><Text style={styles.routeAddress}>Shelby, IA</Text></View></View><View style={styles.loadFooter}><View><Text style={styles.loadRate}>{money(2900)}</Text><Text style={styles.muted}>Confirmed rate</Text></View><Pressable style={styles.loadAction} onPress={() => setScreen('loads')}><Text style={styles.loadActionText}>View load</Text></Pressable></View></Card>
      <Card><View style={styles.row}><View><Text style={styles.cardTitle}>Dispatcher</Text><Text style={styles.messagePreview}>“Please confirm you received Load #4598933-1.”</Text></View><Pressable style={styles.messageButton} onPress={() => setScreen('messages')}><Text style={styles.messageButtonText}>Reply</Text></Pressable></View></Card>
      <Pressable style={styles.locationStrip} onPress={() => setScreen('tracking')} accessibilityRole="button" accessibilityLabel="Open live tracking"><Text style={styles.locationPin} accessible={false}>●</Text><View style={{ flex: 1 }}><Text style={styles.locationTitle}>{sharing ? 'Location sharing is on' : 'Location sharing is paused'}</Text><Text style={styles.locationDetail}>{!trackingAllowed ? 'Paused by your administrator • View map' : onDuty ? 'Last updated just now • View map' : 'Turn on duty to share your current location'}</Text></View><Text style={styles.locationArrow}>›</Text></Pressable>
      <View style={styles.payTimeline}><View style={styles.payTimelineLine}><View style={styles.payTimelineActive} /></View><Text style={styles.payTimelineText}>Work week ends Sunday • Payment releases Friday</Text></View>
    </> : <>
      <View style={styles.grid}><Card><Text style={styles.cardTitle}>Drivers active</Text><Text style={styles.amount}>1</Text><Text style={styles.muted}>Driver is on duty</Text></Card><Card><Text style={styles.cardTitle}>Open load</Text><Text style={styles.amount}>1</Text><Text style={styles.muted}>Rate: $2,900.00</Text></Card></View>
      {role === 'Admin' && (pendingReceipts.length > 0
        ? <Card><Text style={styles.cardTitle}>Attention needed</Text><Text style={styles.smallBold}>{pendingReceipts.length} fuel receipt{pendingReceipts.length === 1 ? '' : 's'} waiting for review</Text><Text style={styles.muted}>Latest: {money(pendingReceipts[0].amount_cents / 100)} submitted {new Date(pendingReceipts[0].created_at).toLocaleDateString()}.</Text><Pressable onPress={() => setScreen('receipts')}><Text style={styles.link}>Review receipts →</Text></Pressable></Card>
        : <Card><Text style={styles.cardTitle}>Attention needed</Text><Text style={styles.muted}>No fuel receipts are waiting for review.</Text></Card>)}
      {/* Receipts are private to the driver and Admin only (see 009_invite_only_identity_and_data_boundaries.sql).
          Dispatchers can no longer see or approve them, so no receipt card is shown here for that role. */}
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
  useEffect(() => { if (!profile || !selectedPartner) return; let active = true; getOrCreateDirectThread(selectedPartner.id).then(async (id) => { if (!active) return; setThreadId(id); setLiveMessages(await loadThreadMessages(id)); }).catch((e) => Alert.alert('Messages unavailable', friendlyError(e, 'Please try again.'))); return () => { active = false; }; }, [profile?.id, selectedPartner?.id]);
  useEffect(() => { if (!threadId) return; const channel = subscribeToThread(threadId, (next) => setLiveMessages((current) => current.some((item) => item.id === next.id) ? current : [...current, next])); return () => { channel.unsubscribe(); }; }, [threadId]);
  const sendLive = async () => { if (!profile || !threadId || !message.trim()) return; setBusy(true); try { await sendThreadMessage(threadId, profile.id, message); setMessage(''); } catch (e) { Alert.alert('Message not sent', friendlyError(e, 'Please try again.')); } finally { setBusy(false); } };
  const shown = profile ? liveMessages : messages.map((body, index) => ({ id: String(index), sender_id: body.startsWith('Driver') ? 'driver' : 'dispatch', body, thread_id: '', created_at: '' }));
  const listRef = useRef<FlatList>(null);
  useEffect(() => { if (shown.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })); }, [shown.length, threadId]);
  return <>
    <Text style={styles.eyebrow}>OPERATIONS CHAT</Text><Text style={styles.title}>Messages</Text>
    <Card>
      <View style={styles.row}><View><Text style={styles.cardTitle}>{selectedPartner?.full_name || (role === 'Driver' ? 'Dispatcher' : 'Driver')}</Text><Text style={styles.muted}>Direct operational chat • available now</Text></View><Pill tone="green">Online</Pill></View>
      {profile && partners.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{partners.map((partner) => <Pressable key={partner.id} onPress={() => setSelectedPartner(partner)}><Pill tone={selectedPartner?.id === partner.id ? 'green' : 'blue'}>{partner.full_name || partner.role}</Pill></Pressable>)}</ScrollView>}
    </Card>
    <View style={styles.chatPanel}>
      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(item) => item.id}
        style={styles.chatList}
        contentContainerStyle={styles.chatListContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.muted}>No messages yet. Say hello below.</Text>}
        renderItem={({ item }) => {
          const mine = item.sender_id === profile?.id || item.sender_id === 'driver';
          return <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapEnd : styles.bubbleWrapStart]}>
            <Text style={[styles.bubble, mine ? styles.driverBubble : styles.dispatchBubble]}>{item.body}</Text>
            {!!item.created_at && <Text style={styles.bubbleTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>}
          </View>;
        }}
      />
      <View style={styles.compose}><TextInput value={message} onChangeText={setMessage} placeholder="Message dispatcher…" style={styles.input} accessibilityLabel="Message text" /><Pressable onPress={profile ? sendLive : sendMessage} disabled={busy} style={styles.send} accessibilityRole="button" accessibilityLabel="Send message"><Text style={styles.primaryText}>{busy ? '…' : 'Send'}</Text></Pressable></View>
    </View>
    <Text style={styles.notice}>Drivers can message their dispatcher and admins. Admins can review operational conversations.</Text>
    <Pressable style={styles.outline} onPress={() => Alert.alert('Calls', 'Secure Stream voice and video calling is connected at the server layer. The native call screen is the next build step.')}><Text style={styles.outlineText}>Start voice or video call</Text></Pressable>
  </>;
}

function Loads({ role, profile }: { role: Role; profile: Profile | null }) {
  const [loads, setLoads] = useState<any[]>([]);
  const [loadingLoads, setLoadingLoads] = useState(!!profile);
  const refreshLoads = () => loadMyLoads().then(setLoads).catch((e) => Alert.alert('Loads unavailable', friendlyError(e, 'Please try again.'))).finally(() => setLoadingLoads(false));
  useEffect(() => { if (profile) refreshLoads(); }, [profile?.id]);
  const activeLoads = profile ? loads : [{ id: 'demo', load_number: '4598933-1', rate_cents: 290000, pickup_name: 'Thermwell Products', pickup_address: 'Mahwah, NJ', delivery_name: 'Menard', delivery_address: 'Shelby, IA', status: 'assigned', rate_confirmations: [] }];
  const attachRateConfirmation = async (loadId: string) => { if (!profile) return Alert.alert('Preview only', 'Sign in to send a rate confirmation.'); const selected = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false }); if (selected.canceled) return; const file = selected.assets[0]; try { await uploadRateConfirmation({ loadId, uploadedBy: profile.id, uri: file.uri, filename: file.name || 'rate-confirmation.pdf', mimeType: file.mimeType }); await refreshLoads(); Alert.alert('Sent', 'The rate confirmation is now available securely to the assigned driver.'); } catch (e) { Alert.alert('Document not sent', friendlyError(e, 'Please try again.')); } };
  return <><Text style={styles.title}>{role === 'Driver' ? 'My Load' : 'Load Management'}</Text>{profile && loadingLoads ? <Card><Text style={styles.muted}>Loading your loads…</Text></Card> : <>{activeLoads.length === 0 && <Card><Text style={styles.muted}>No assigned loads yet.</Text></Card>}{activeLoads.map((load) => <Card key={load.id}><View style={styles.row}><Text style={styles.smallBold}>Load #{load.load_number}</Text><Pill tone="green">{load.status}</Pill></View><Text style={styles.amount}>{money(load.rate_cents / 100)}</Text><Text style={styles.muted}>Rate confirmation total</Text><View style={styles.divider} /><Text style={styles.cardTitle}>Pickup</Text><Text style={styles.body}>{load.pickup_name || '—'} • {load.pickup_address || '—'}</Text><Text style={styles.cardTitle}>Delivery</Text><Text style={styles.body}>{load.delivery_name || '—'}</Text>{load.rate_confirmations?.[0] && <Pressable style={styles.outline} onPress={async () => { try { await Linking.openURL(await getRateConfirmationUrl(load.rate_confirmations[0].storage_path)); } catch (e) { Alert.alert('Document unavailable', friendlyError(e, 'Please try again.')); } }}><Text style={styles.outlineText}>View rate confirmation</Text></Pressable>}{profile && (profile.role === 'dispatcher' || profile.role === 'admin') && <Pressable style={styles.primary} onPress={() => attachRateConfirmation(load.id)}><Text style={styles.primaryText}>Send rate confirmation PDF</Text></Pressable>}</Card>)}</>}</>;
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
  const submit = async () => { const value = Number(amount); if (!Number.isFinite(value) || value <= 0) return Alert.alert('Check the amount', 'Enter a valid fuel amount.'); if (!receiptUri) return Alert.alert('Add the receipt photo', 'Choose a receipt image before saving.'); if (!profile) { setFuel(value); return Alert.alert('Saved locally', 'Connect Supabase to save this receipt for dispatcher review.'); } setSaving(true); try { await saveReceipt({ driverId: profile.id, amountCents: Math.round(value * 100), receiptType: 'fuel', imageUri: receiptUri }); setFuel(value); setReceiptUri(null); refresh(); Alert.alert('Submitted', 'Your fuel receipt is in private storage and awaiting review.'); } catch (e) { Alert.alert('Receipt not saved', friendlyError(e, 'Please try again.')); } finally { setSaving(false); } };
  return <><Text style={styles.eyebrow}>EXPENSES</Text><Text style={styles.title}>Fuel receipts</Text><Text style={styles.screenLead}>Only approved fuel receipts are deducted from your weekly pay.</Text>{latest && <Card><View style={styles.row}><View><Text style={styles.cardEyebrow}>LATEST RECEIPT</Text><Text style={styles.amount}>{money(latest.amount_cents / 100)}</Text></View><Pill tone={latest.review_status === 'approved' ? 'green' : latest.review_status === 'rejected' ? 'red' : 'blue'}>{latest.review_status}</Pill></View><Text style={styles.muted}>{latest.receipt_type} receipt • submitted for review</Text>{profile && profile.role === 'admin' && latest.review_status === 'pending' && <View style={styles.approvalActions}><Pressable style={styles.approveButton} onPress={async () => { await reviewReceipt(latest.id, 'approved', profile.id); refresh(); }}><Text style={styles.approveButtonText}>Approve receipt</Text></Pressable><Pressable style={styles.rejectButton} onPress={async () => { await reviewReceipt(latest.id, 'rejected', profile.id); refresh(); }}><Text style={styles.rejectButtonText}>Reject</Text></Pressable></View>}</Card>}<Card><Text style={styles.cardEyebrow}>NEW RECEIPT</Text><Text style={styles.cardTitle}>Add fuel purchase</Text><Text style={styles.receiptHelp}>Take a clear photo showing the total and merchant. You can review it before sending.</Text><Text style={styles.label}>FUEL AMOUNT</Text><View style={styles.currencyInput}><Text style={styles.currencyMark} accessible={false}>$</Text><TextInput value={amount} keyboardType="decimal-pad" onChangeText={setAmount} style={styles.currencyField} accessibilityLabel="Fuel amount in dollars" /></View>{receiptUri ? <Image source={{ uri: receiptUri }} style={styles.uploadPreview} accessibilityLabel="Selected fuel receipt" /> : <Pressable style={styles.receiptDropzone} onPress={chooseReceipt} accessibilityRole="button" accessibilityLabel="Add receipt photo, choose from photo library"><Text style={styles.receiptCamera} accessible={false}>▣</Text><Text style={styles.receiptDropzoneTitle}>Add receipt photo</Text><Text style={styles.receiptDropzoneDetail}>Choose from photo library</Text></Pressable>}<Pressable style={styles.outline} onPress={chooseReceipt}><Text style={styles.outlineText}>{receiptUri ? 'Replace photo' : 'Choose photo'}</Text></Pressable><Pressable style={styles.primary} onPress={submit} disabled={saving}><Text style={styles.primaryText}>{saving ? 'SAVING…' : 'SUBMIT FOR REVIEW'}</Text></Pressable></Card></>;
}

function Earnings({ profile, net, fuel, percentage, setPercentage, takeHome }: { profile: Profile | null; net: number; fuel: number; percentage: string; setPercentage: (value: string) => void; takeHome: number }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(!!profile);
  useEffect(() => { if (profile) loadWeeklyEarnings().then(setWeeks).catch((e) => Alert.alert('Earnings unavailable', friendlyError(e, 'Please try again.'))).finally(() => setLoadingWeeks(false)); }, [profile?.id]);
  const week = profile ? weeks[0] : { payment_date: '2026-08-28', week_start: '2026-08-17', rate_cents: 290000, fuel_cents: Math.round(fuel * 100), net_cents: Math.round(net * 100) };
  const liveNet = week ? week.net_cents / 100 : 0;
  const liveTakeHome = liveNet * ((Number(percentage) || 0) / 100);
  return <><Text style={styles.eyebrow}>PAY & EARNINGS</Text><Text style={styles.title}>Weekly take home</Text>{profile && loadingWeeks && <Card><Text style={styles.muted}>Loading your earnings…</Text></Card>}{!loadingWeeks && !week && <Card><Text style={styles.muted}>No completed work week is available yet.</Text></Card>}{week && <><View style={styles.paymentBanner}><Text style={styles.paymentBannerLabel}>NEXT PAYMENT</Text><Text style={styles.paymentBannerDate}>{`Friday, ${new Date(`${week.payment_date}T12:00:00`).toLocaleDateString()}`}</Text><Text style={styles.paymentBannerDetail}>You are paid one week behind.</Text></View><Card><Text style={styles.cardEyebrow}>STEP 1</Text><Text style={styles.cardTitle}>Delivered rate confirmations</Text><View style={styles.earningsFlowRow}><Text style={styles.earningsFlowValue}>{money(week.rate_cents / 100)}</Text><Text style={styles.earningsFlowSymbol}>↓</Text></View></Card><Card><Text style={styles.cardEyebrow}>STEP 2</Text><Text style={styles.cardTitle}>Approved fuel only</Text><Text style={styles.muted}>Pending or rejected receipts are not included.</Text><View style={styles.earningsFlowRow}><Text style={styles.earningsCost}>-{money(week.fuel_cents / 100)}</Text><Text style={styles.earningsFlowSymbol}>↓</Text></View><View style={styles.netResult}><Text style={styles.netResultLabel}>AMOUNT AFTER FUEL</Text><Text style={styles.netResultValue}>{money(liveNet)}</Text></View></Card></>}<Card><Text style={styles.cardEyebrow}>STEP 3</Text><Text style={styles.cardTitle}>Your percentage</Text><Text style={styles.muted}>Change this anytime to estimate your take home.</Text><View style={styles.percentageControl}><TextInput value={percentage} keyboardType="decimal-pad" onChangeText={setPercentage} style={styles.percentageInput} accessibilityLabel="Take-home percentage" /><Text style={styles.percentageSuffix} accessible={false}>%</Text></View><Text style={styles.takeHomeResult}>{money(profile ? liveTakeHome : takeHome)}</Text><Text style={styles.muted}>Your estimated take home. Fuel is the only deduction.</Text></Card></>;
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
  const submit = async () => { if (!profile) return Alert.alert('Preview only', 'Connect Supabase to submit an inspection.'); setSaving(true); try { await submitInspection({ driverId: profile.id, inspectionType: 'pre_trip', checklist: checks, comments, faultReported: fault, photoUris: inspectionUri ? [inspectionUri] : [] }); setInspectionUri(null); setComments(''); setFault(false); Alert.alert('Inspection submitted', fault ? 'Your fault report is visible to dispatch and admin.' : 'Dispatch can now review your pre-trip inspection.'); } catch (e) { Alert.alert('Inspection not saved', friendlyError(e, 'Please try again.')); } finally { setSaving(false); } };
  const completed = Object.values(checks).filter(Boolean).length;
  return <><Text style={styles.eyebrow}>VEHICLE SAFETY</Text><Text style={styles.title}>Pre-trip check</Text><Card><View style={styles.row}><View><Text style={styles.cardTitle}>{completed} of {items.length} checks complete</Text><Text style={styles.muted}>Complete before beginning your load.</Text></View><Pill tone={completed === items.length ? 'green' : 'blue'}>{completed === items.length ? 'Ready' : 'In progress'}</Pill></View><View style={styles.inspectionProgress}><View style={[styles.inspectionProgressFill, { width: `${(completed / items.length) * 100}%` }]} /></View>{items.map(([key, label]) => <Pressable key={key} style={[styles.check, checks[key] && styles.checkComplete]} onPress={() => setChecks((current) => ({ ...current, [key]: !current[key] }))} accessibilityRole="checkbox" accessibilityState={{ checked: checks[key] }} accessibilityLabel={label}><Text style={styles.checkMark} accessible={false}>{checks[key] ? '✓' : '○'}</Text><Text style={styles.body}>{label}</Text></Pressable>)}<TextInput value={comments} onChangeText={setComments} multiline placeholder="Comments or fault details" style={styles.fullInput} accessibilityLabel="Comments or fault details" />{inspectionUri && <Image source={{ uri: inspectionUri }} style={styles.uploadPreview} accessibilityLabel="Inspection photo" />}<Pressable style={styles.outline} onPress={addInspectionPhoto} accessibilityRole="button"><Text style={styles.outlineText}>Take inspection photo</Text></Pressable><Pressable style={fault ? styles.danger : styles.outline} onPress={() => setFault(!fault)} accessibilityRole="switch" accessibilityState={{ checked: fault }}><Text style={fault ? styles.dangerText : styles.outlineText}>{fault ? 'Fault will be reported' : 'Report a fault'}</Text></Pressable><Pressable style={styles.primary} onPress={submit} disabled={saving}><Text style={styles.primaryText}>{saving ? 'SUBMITTING…' : 'SUBMIT INSPECTION'}</Text></Pressable></Card></>;
}

function Tracking({ role, profile, trackingAllowed, onDuty, locationLabel, setLocationLabel, locationCoords, setLocationCoords }: { role: Role; profile: Profile | null; trackingAllowed: boolean; onDuty: boolean; locationLabel: string; setLocationLabel: (label: string) => void; locationCoords: { latitude: number; longitude: number }; setLocationCoords: (coords: { latitude: number; longitude: number }) => void }) {
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverTrackingEnabled, setDriverTrackingEnabled] = useState(true);
  const [updatingTracking, setUpdatingTracking] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    loadActiveDrivers().then((people) => { setDrivers(people); setSelectedDriverId((current) => current ?? people[0]?.id ?? null); }).catch(() => undefined);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile || profile.role === 'driver') return;
    let active = true;
    loadLatestLocations().then((items: any[]) => {
      if (!active) return;
      const target = profile.role === 'admin' && selectedDriverId ? items.find((item) => item.driver_id === selectedDriverId) : items[0];
      if (target) { setLocationCoords({ latitude: target.latitude, longitude: target.longitude }); setLocationLabel(`Driver • updated ${new Date(target.recorded_at).toLocaleTimeString()}`); }
      else setLocationLabel('Driver • no location received yet');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [profile?.id, selectedDriverId]);

  useEffect(() => {
    if (!profile || profile.role !== 'admin' || !selectedDriverId) return;
    getTrackingSettings(selectedDriverId).then((setting) => setDriverTrackingEnabled(setting.enabled)).catch(() => undefined);
  }, [selectedDriverId]);

  const refreshLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location permission needed', 'Allow location access so dispatch can see the active load location.');
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocationCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    setLocationLabel(`Driver • ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
    if (profile && trackingAllowed && onDuty && profile.role === 'driver') await saveLocation(profile.id, position.coords.latitude, position.coords.longitude);
  };

  const confirmToggle = () => {
    if (!profile || !selectedDriverId) return;
    const next = !driverTrackingEnabled;
    const driverName = drivers.find((item) => item.id === selectedDriverId)?.full_name || 'This driver';
    Alert.alert(
      next ? 'Turn tracking on?' : 'Turn tracking off?',
      next ? `${driverName} will be asked to share their location again while on duty.` : `${driverName}’s location sharing stops immediately. This change is recorded in the audit log.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: next ? 'Turn on' : 'Turn off', style: next ? 'default' : 'destructive', onPress: async () => {
          setUpdatingTracking(true);
          try { await setTrackingEnabled(selectedDriverId, next, profile.id); setDriverTrackingEnabled(next); }
          catch (e) { Alert.alert('Tracking not updated', friendlyError(e, 'Please try again.')); }
          finally { setUpdatingTracking(false); }
        } },
      ],
    );
  };

  const trackingIsOn = role === 'Admin' ? driverTrackingEnabled : trackingAllowed && onDuty;

  return <>
    <Text style={styles.eyebrow}>{role === 'Driver' ? 'YOUR LOCATION' : 'FLEET VISIBILITY'}</Text>
    <Text style={styles.title}>{role === 'Driver' ? 'Live tracking' : 'Driver map'}</Text>
    {role === 'Admin' && (drivers.length > 0
      ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{drivers.map((driver) => <Pressable key={driver.id} onPress={() => setSelectedDriverId(driver.id)}><Pill tone={selectedDriverId === driver.id ? 'green' : 'blue'}>{driver.full_name || driver.email}</Pill></Pressable>)}</ScrollView>
      : <Card><Text style={styles.muted}>No active drivers yet.</Text></Card>)}
    <Card>
      <MapView style={styles.map} region={{ ...locationCoords, latitudeDelta: 0.16, longitudeDelta: 0.16 }}><Marker coordinate={locationCoords} title="Prime Trucking USA driver" description={locationLabel} pinColor={RED} /></MapView>
      <View style={styles.row}><View><Text style={styles.cardTitle}>{trackingIsOn ? 'Tracking is active' : 'Tracking paused'}</Text><Text style={styles.muted}>{role === 'Driver' ? (!trackingAllowed ? 'Your administrator has paused tracking for your account.' : 'Your dispatcher can see your location while you are on duty.') : locationLabel}</Text></View><Pill tone={trackingIsOn ? 'green' : 'red'}>{trackingIsOn ? 'Live' : 'Off'}</Pill></View>
    </Card>
    {trackingIsOn && role === 'Driver' && <Pressable style={styles.primary} onPress={refreshLocation}><Text style={styles.primaryText}>REFRESH CURRENT LOCATION</Text></Pressable>}
    {role === 'Admin' && selectedDriverId && <Pressable style={[trackingIsOn ? styles.danger : styles.primary, updatingTracking && styles.buttonDisabled]} onPress={confirmToggle} disabled={updatingTracking}><Text style={trackingIsOn ? styles.dangerText : styles.primaryText}>{updatingTracking ? 'UPDATING…' : trackingIsOn ? 'Turn off driver tracking' : 'Turn on driver tracking'}</Text></Pressable>}
    <Text style={styles.notice}>Location is shown clearly and transparently. Admins can pause tracking when required, and every change is recorded.</Text>
  </>;
}

function Settings({ role }: { role: Role }) {
  if (role !== 'Admin') return <Text style={styles.title}>Settings available to admins only.</Text>;
  return <><Text style={styles.title}>Admin Controls</Text><InviteManager /><Card><Text style={styles.cardTitle}>Driver tracking</Text><Text style={styles.muted}>Turn tracking on or off for a specific driver from the Track tab, where every change is confirmed before it happens and recorded in the audit log.</Text></Card></>;
}

function InviteManager() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'driver' | 'dispatcher'>('driver');
  const [dispatchers, setDispatchers] = useState<Profile[]>([]);
  const [dispatcherId, setDispatcherId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadActiveDispatchers().then(setDispatchers).catch(() => undefined); }, []);
  const createInvite = async () => {
    if (!fullName.trim() || !email.trim() || (inviteRole === 'driver' && !dispatcherId)) return Alert.alert('Missing information', 'Enter the employee name and email. Drivers must have an assigned dispatcher.');
    setCreating(true);
    try {
      const invite = await createEmployeeInvite({ email: email.trim(), fullName: fullName.trim(), role: inviteRole, dispatcherId: inviteRole === 'driver' ? dispatcherId : undefined });
      setFullName(''); setEmail(''); setDispatcherId('');
      if (invite.emailed) Alert.alert('Invite sent', `The ${inviteRole} invitation was emailed and expires in eight hours.`);
      else {
        Alert.alert('Invite created', 'Email delivery is not configured yet. Share the one-time link securely now.');
        await Share.share({ message: invite.inviteUrl });
      }
    } catch (error) {
      Alert.alert('Invite not created', friendlyError(error, 'Please try again.'));
    } finally { setCreating(false); }
  };

  return <Card>
    <Text style={styles.cardTitle}>Issue employee invitation</Text>
    <Text style={styles.muted}>Only Drivers and Dispatchers can self-register. Every link works once and expires after 8 hours.</Text>
    <Text style={styles.label}>FULL NAME</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="Employee name" placeholderTextColor="#98A2B3" style={styles.loginInput} accessibilityLabel="Employee full name" />
    <Text style={styles.label}>WORK EMAIL</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="employee@email.com" placeholderTextColor="#98A2B3" style={styles.loginInput} accessibilityLabel="Employee work email" />
    <Text style={styles.label}>ROLE</Text><View style={styles.inviteRoleRow}>{(['driver', 'dispatcher'] as const).map((item) => <Pressable key={item} onPress={() => setInviteRole(item)} style={[styles.inviteRoleButton, inviteRole === item && styles.inviteRoleSelected]} accessibilityRole="radio" accessibilityState={{ selected: inviteRole === item }}><Text style={[styles.inviteRoleText, inviteRole === item && styles.inviteRoleTextSelected]}>{item.toUpperCase()}</Text></Pressable>)}</View>
    {inviteRole === 'driver' && <><Text style={styles.label}>ASSIGNED DISPATCHER</Text>{dispatchers.length ? <View style={styles.inviteDispatcherList}>{dispatchers.map((dispatcher) => <Pressable key={dispatcher.id} onPress={() => setDispatcherId(dispatcher.id)} style={[styles.inviteDispatcher, dispatcherId === dispatcher.id && styles.inviteDispatcherSelected]} accessibilityRole="radio" accessibilityState={{ selected: dispatcherId === dispatcher.id }}><Text style={[styles.inviteDispatcherName, dispatcherId === dispatcher.id && styles.inviteRoleTextSelected]}>{dispatcher.full_name || dispatcher.email}</Text></Pressable>)}</View> : <Text style={styles.muted}>No active dispatcher is available. Invite a dispatcher first.</Text>}</>}
    <Pressable style={[styles.primary, creating && styles.buttonDisabled]} onPress={createInvite} disabled={creating}><Text style={styles.primaryText}>{creating ? 'CREATING INVITE…' : 'CREATE 8-HOUR INVITE'}</Text></Pressable>
  </Card>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MIST },
  loginSafe: { flex: 1, backgroundColor: NAVY },
  loginSafeLandscape: { backgroundColor: NAVY },
  loginShell: { flex: 1 },
  loginScroll: { flexGrow: 1, backgroundColor: NAVY },
  loginScrollLandscape: { flexDirection: 'row', minHeight: '100%' },
  loginHero: { minHeight: 334, paddingHorizontal: layout.screenPadding, paddingTop: space.lg, paddingBottom: space.xl, overflow: 'hidden', backgroundColor: NAVY },
  loginHeroLandscape: { flex: 0.95, minHeight: undefined, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 18 },
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
  loginPanelLandscape: { flex: 1.05, minHeight: undefined, marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: radius.xl, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 20 },
  panelHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D9E1EC', alignSelf: 'center', marginBottom: 20 },
  signInKicker: { color: RED, fontSize: 11, fontWeight: '900', letterSpacing: 1.55 },
  signInTitle: { color: INK, fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 5 },
  signInHelp: { color: '#667085', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 20 },
  fieldGroup: { marginBottom: 15 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  loginLabel: { color: NAVY, fontSize: 10, fontWeight: '900', letterSpacing: 1.05, marginBottom: 7 },
  forgot: { color: RED, fontSize: 12, fontWeight: '800' },
  loginInput: { height: 50, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#DCE4EF', borderRadius: 9, paddingHorizontal: 14, color: INK, fontSize: 15 },
  passwordFieldRow: { height: 50, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#DCE4EF', borderRadius: 9, flexDirection: 'row', alignItems: 'center' },
  passwordFieldInput: { flex: 1, height: '100%', paddingHorizontal: 14, color: INK, fontSize: 15 },
  passwordToggle: { minWidth: touchTarget.minimum, height: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 2 },
  passwordToggleText: { color: NAVY, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
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
  inviteRoleRow: { flexDirection: 'row', gap: 8 },
  inviteRoleButton: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#DCE4EF', borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  inviteRoleSelected: { backgroundColor: NAVY, borderColor: NAVY },
  inviteRoleText: { color: NAVY, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  inviteRoleTextSelected: { color: color.neutral[0] },
  inviteDispatcherList: { gap: 6 },
  inviteDispatcher: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: color.neutral[50], borderWidth: 1, borderColor: color.neutral[200] },
  inviteDispatcherSelected: { backgroundColor: NAVY, borderColor: NAVY },
  inviteDispatcherName: { color: NAVY, fontSize: 13, fontWeight: '800' },
  loginLegal: { color: '#98A2B3', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 22, paddingHorizontal: 8 },
  header: { backgroundColor: color.neutral[0], borderBottomWidth: 1, borderColor: '#E6EAF0', paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerLandscape: { paddingVertical: 8, paddingHorizontal: 24 }, headerBrand: { color: RED, fontWeight: '900', letterSpacing: 2, fontSize: 20 }, headerSub: { color: NAVY, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, profile: { backgroundColor: NAVY, color: 'white', width: 34, height: 34, textAlign: 'center', lineHeight: 34, borderRadius: 17, fontWeight: '800' }, profileMenuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }, profileMenu: { position: 'absolute', top: 60, right: 14, minWidth: 210, backgroundColor: color.neutral[0], borderRadius: radius.md, paddingVertical: 8, zIndex: 21, ...shadow.elevated }, profileMenuHeader: { paddingHorizontal: 16, paddingVertical: 8 }, profileMenuName: { color: INK, fontSize: 14, fontWeight: '900' }, profileMenuEmail: { color: color.neutral[500], fontSize: 12, marginTop: 2 }, profileMenuRole: { color: RED, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 6 }, profileMenuDivider: { height: 1, backgroundColor: color.neutral[200], marginVertical: 2 }, profileMenuSignOut: { minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: 16 }, profileMenuSignOutText: { color: color.status.danger, fontSize: 14, fontWeight: '900' }, content: { padding: layout.screenPadding, gap: 14, paddingBottom: 22 }, contentLandscape: { width: '100%', maxWidth: 920, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 16 }, safeLandscape: { backgroundColor: MIST }, eyebrow: { color: RED, letterSpacing: 1.5, fontSize: 11, fontWeight: '900' }, title: { ...type.title, color: INK, marginBottom: 2 }, card: { backgroundColor: color.neutral[0], borderRadius: radius.lg, padding: layout.cardPadding, gap: 9, ...shadow.card }, cardTitle: { color: INK, fontSize: 15, fontWeight: '800' }, big: { color: NAVY, fontSize: 21, fontWeight: '900' }, amount: { ...type.money, color: NAVY }, muted: { color: '#667085', fontSize: 13, lineHeight: 19 }, body: { color: INK, fontSize: 14, lineHeight: 21 }, smallBold: { color: INK, fontWeight: '800', fontSize: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 4 }, divider: { height: 1, backgroundColor: '#E8EDF3', marginVertical: 5 }, pill: { overflow: 'hidden', color: '#145DA0', backgroundColor: '#E5F1FB', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '800' }, greenPill: { color: '#087443', backgroundColor: '#E2F7EC' }, redPill: { color: '#9F1724', backgroundColor: '#FDE8EA' }, primary: { backgroundColor: RED, minHeight: touchTarget.minimum, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, primaryText: { color: 'white', fontWeight: '800' }, outline: { borderWidth: 1, borderColor: NAVY, minHeight: touchTarget.minimum, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, outlineText: { color: NAVY, fontWeight: '800' }, danger: { backgroundColor: '#FDE8EA', minHeight: touchTarget.minimum, padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, dangerText: { color: '#9F1724', fontWeight: '800' }, label: { color: '#344054', fontSize: 13, fontWeight: '700' }, legal: { color: '#667085', fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 }, link: { color: RED, fontWeight: '800', marginTop: 5 }, grid: { flexDirection: 'row', gap: 12 }, action: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 16, minHeight: 112, justifyContent: 'space-between' }, actionIcon: { color: RED, fontSize: 25, fontWeight: '900' }, actionText: { color: NAVY, fontWeight: '800', fontSize: 13 }, bubble: { padding: 11, borderRadius: 12, color: INK, fontSize: 13, lineHeight: 18 }, driverBubble: { backgroundColor: '#E8F0FA', alignSelf: 'flex-end' }, dispatchBubble: { backgroundColor: '#F2F4F7', alignSelf: 'flex-start' }, chatPanel: { backgroundColor: color.neutral[0], borderRadius: radius.lg, padding: layout.cardPadding, height: 380, ...shadow.card }, chatList: { flex: 1 }, chatListContent: { gap: 8, flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 4 }, bubbleWrap: { maxWidth: '82%' }, bubbleWrapStart: { alignSelf: 'flex-start', alignItems: 'flex-start' }, bubbleWrapEnd: { alignSelf: 'flex-end', alignItems: 'flex-end' }, bubbleTime: { color: color.neutral[400], fontSize: 10, marginTop: 2, marginHorizontal: 2 }, compose: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }, input: { flex: 1, borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, color: INK }, send: { backgroundColor: RED, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }, notice: { color: '#667085', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 }, fullInput: { borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 9, padding: 11, fontSize: 16, color: INK }, uploadPreview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#E8EDF3' }, check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, checkMark: { color: '#087443', fontSize: 18, fontWeight: '900' }, map: { height: 230, borderRadius: 12, overflow: 'hidden' }, nav: { flexDirection: 'row', backgroundColor: 'white', borderTopWidth: 1, borderColor: '#E6EAF0', paddingVertical: 10 }, navLandscape: { paddingVertical: 7, paddingHorizontal: 24 }, navItem: { flex: 1, alignItems: 'center' }, navText: { color: '#667085', fontSize: 11, fontWeight: '700' }, navActive: { color: RED, fontWeight: '900' },
  driverStatusHeader: { backgroundColor: NAVY, borderRadius: radius.lg, padding: layout.cardPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 118 }, driverStatusKicker: { color: '#D5E1F2', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, driverStatusTitle: { color: color.neutral[0], fontSize: 25, fontWeight: '900', marginTop: 4 }, driverStatusDetail: { color: '#D5E1F2', fontSize: 12, marginTop: 4, maxWidth: 240 }, dutyToggle: { width: 60, height: 34, borderRadius: 17, backgroundColor: color.neutral[500], padding: 4, justifyContent: 'center' }, dutyToggleOn: { backgroundColor: color.status.success }, dutyToggleDisabled: { opacity: 0.5 }, dutyKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.neutral[0] }, dutyKnobOn: { alignSelf: 'flex-end' }, quickActions: { flexDirection: 'row', gap: 8 }, quickActionPrimary: { backgroundColor: RED, borderRadius: radius.md, padding: 12, minHeight: 76, flex: 1.9, flexDirection: 'row', alignItems: 'center', gap: 9 }, quickAction: { backgroundColor: color.neutral[0], borderRadius: radius.md, padding: 9, minHeight: 76, flex: 1, justifyContent: 'space-between', ...shadow.card }, quickActionIcon: { color: color.neutral[0], fontSize: 22, fontWeight: '900' }, quickActionIconBlue: { color: color.brand.blue, fontSize: 20, fontWeight: '900' }, quickActionTitle: { color: color.neutral[0], fontSize: 12, fontWeight: '900' }, quickActionMeta: { color: '#FAD4D8', fontSize: 10, fontWeight: '700', marginTop: 3 }, quickActionText: { color: NAVY, fontSize: 11, fontWeight: '900' }, cardEyebrow: { color: color.neutral[500], fontSize: 10, letterSpacing: 1.1, fontWeight: '900' }, takeHomeMark: { width: 42, height: 42, backgroundColor: color.status.successSoft, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, takeHomeMarkText: { color: color.status.success, fontSize: 22, fontWeight: '900' }, earningsMiniRow: { backgroundColor: color.neutral[50], borderRadius: radius.sm, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 }, earningsMiniLabel: { color: color.neutral[500], fontSize: 11, flexBasis: '62%' }, earningsMiniValue: { color: INK, fontSize: 11, fontWeight: '800', flexBasis: '36%', textAlign: 'right' }, earningsMiniNegative: { color: color.status.danger, fontSize: 11, fontWeight: '800', flexBasis: '36%', textAlign: 'right' }, textButton: { minHeight: touchTarget.minimum, justifyContent: 'center' }, textButtonText: { color: color.brand.blue, fontSize: 13, fontWeight: '900' }, routeRow: { flexDirection: 'row', gap: 12, marginTop: 2 }, routeLine: { alignItems: 'center', width: 16, paddingTop: 7 }, routeDotStart: { height: 10, width: 10, backgroundColor: color.brand.blue, borderRadius: 5 }, routeDash: { width: 2, flex: 1, minHeight: 50, backgroundColor: color.neutral[300], marginVertical: 4 }, routeDotEnd: { height: 10, width: 10, backgroundColor: RED, borderRadius: 5 }, routeDetails: { flex: 1, gap: 1 }, routeLabel: { color: color.neutral[500], fontSize: 10, letterSpacing: 0.9, fontWeight: '900' }, routePlace: { color: INK, fontSize: 14, fontWeight: '900' }, routeAddress: { color: color.neutral[500], fontSize: 12, marginBottom: 10 }, loadFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: color.neutral[200], paddingTop: 11, marginTop: 2 }, loadRate: { color: color.status.success, fontSize: 22, fontWeight: '900' }, loadAction: { backgroundColor: color.brand.blueSoft, minHeight: touchTarget.minimum, borderRadius: radius.sm, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, loadActionText: { color: color.brand.blue, fontSize: 12, fontWeight: '900' }, messagePreview: { color: color.neutral[600], fontSize: 12, marginTop: 5, maxWidth: 230, lineHeight: 18 }, messageButton: { minHeight: touchTarget.minimum, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, messageButtonText: { color: color.brand.blue, fontSize: 13, fontWeight: '900' }, locationStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, minHeight: 66, backgroundColor: color.brand.blueSoft, borderRadius: radius.md }, locationPin: { color: color.brand.blue, fontSize: 20 }, locationTitle: { color: NAVY, fontSize: 13, fontWeight: '900' }, locationDetail: { color: color.neutral[600], fontSize: 11, marginTop: 3 }, locationArrow: { color: color.brand.blue, fontSize: 28, fontWeight: '400' }, payTimeline: { paddingHorizontal: 2, paddingTop: 3 }, payTimelineLine: { height: 4, borderRadius: 2, backgroundColor: color.neutral[200], overflow: 'hidden' }, payTimelineActive: { height: 4, width: '48%', backgroundColor: color.status.success }, payTimelineText: { color: color.neutral[500], fontSize: 11, marginTop: 8, textAlign: 'center' },
  screenLead: { color: color.neutral[500], fontSize: 14, lineHeight: 20, marginTop: -6, marginBottom: 2 }, approvalActions: { flexDirection: 'row', gap: 8, marginTop: 4 }, approveButton: { flex: 1, minHeight: touchTarget.minimum, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm, backgroundColor: color.status.success }, approveButtonText: { color: color.neutral[0], fontWeight: '900', fontSize: 12 }, rejectButton: { minHeight: touchTarget.minimum, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm, backgroundColor: color.status.dangerSoft, paddingHorizontal: 16 }, rejectButtonText: { color: color.status.danger, fontWeight: '900', fontSize: 12 }, receiptHelp: { color: color.neutral[500], fontSize: 13, lineHeight: 19, marginBottom: 5 }, currencyInput: { minHeight: touchTarget.comfortable, borderWidth: 1, borderColor: color.neutral[300], borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: color.neutral[50] }, currencyMark: { color: color.neutral[500], fontSize: 18, marginLeft: 14, fontWeight: '700' }, currencyField: { flex: 1, fontSize: 17, color: INK, paddingHorizontal: 8, paddingVertical: 11 }, receiptDropzone: { minHeight: 120, borderWidth: 1.5, borderColor: color.brand.blue, borderStyle: 'dashed', borderRadius: radius.md, backgroundColor: color.brand.blueSoft, alignItems: 'center', justifyContent: 'center' }, receiptCamera: { color: color.brand.blue, fontSize: 24, fontWeight: '900' }, receiptDropzoneTitle: { color: NAVY, fontSize: 14, fontWeight: '900', marginTop: 5 }, receiptDropzoneDetail: { color: color.neutral[600], fontSize: 12, marginTop: 2 }, paymentBanner: { backgroundColor: NAVY, borderRadius: radius.lg, padding: layout.cardPadding, gap: 4 }, paymentBannerLabel: { color: '#D5E1F2', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, paymentBannerDate: { color: color.neutral[0], fontSize: 20, fontWeight: '900' }, paymentBannerDetail: { color: '#D5E1F2', fontSize: 12 }, earningsFlowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }, earningsFlowValue: { color: color.status.success, fontSize: 26, fontWeight: '900' }, earningsCost: { color: color.status.danger, fontSize: 26, fontWeight: '900' }, earningsFlowSymbol: { color: color.neutral[400], fontSize: 23, fontWeight: '600' }, netResult: { backgroundColor: color.status.successSoft, borderRadius: radius.sm, padding: 12, marginTop: 4 }, netResultLabel: { color: color.status.success, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, netResultValue: { color: color.status.success, fontSize: 25, fontWeight: '900', marginTop: 3 }, percentageControl: { minHeight: touchTarget.comfortable, borderWidth: 2, borderColor: color.brand.blue, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 3 }, percentageInput: { flex: 1, fontSize: 22, fontWeight: '900', color: NAVY, paddingVertical: 9 }, percentageSuffix: { color: color.brand.blue, fontSize: 20, fontWeight: '900' }, takeHomeResult: { color: color.status.success, fontSize: 34, fontWeight: '900', marginTop: 3 },
  inspectionProgress: { height: 6, borderRadius: 3, backgroundColor: color.neutral[200], overflow: 'hidden', marginVertical: 4 }, inspectionProgressFill: { height: 6, borderRadius: 3, backgroundColor: color.status.success }, checkComplete: { backgroundColor: color.status.successSoft, borderRadius: radius.sm, paddingHorizontal: 8 },
});
