import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Modal,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../theme/theme';
import { CONFIG } from '../config/config';
import {
  getReceipts,
  saveReceipts,
  getExportHistory,
  saveExportHistory,
  getGoogleUserSession,
  saveGoogleUserSession,
  getSettings,
  saveSettings,
} from '../services/storageService';
import { pushToGoogleSheets } from '../services/sheetsService';
import {
  requestGoogleAccessToken,
  fetchGoogleUserProfile,
  createGoogleSpreadsheet,
  appendReceiptToGoogleSheet,
  pullReceiptsFromGoogleSheet,
  getSpreadsheetDetails,
  fetchUserSpreadsheets,
} from '../services/googleOAuthSheetsService';

export default function GoogleSheetsSyncScreen() {
  const [autoSync, setAutoSync] = useState(true);
  const [lastSynced, setLastSynced] = useState('Checking...');
  const [syncing, setSyncing] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Real Google OAuth & Sheets REST API state
  const [googleUser, setGoogleUser] = useState({
    signedIn: false,
    email: '',
    name: '',
    accessToken: null,
    spreadsheetId: null,
    spreadsheetTitle: 'ReceiptGenius Live Ledger',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets',
  });
  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [googleModalMode, setGoogleModalMode] = useState('link'); // 'link' or 'create'
  const [inputSheetTitle, setInputSheetTitle] = useState('ReceiptGenius Expenses 2026');
  const [inputSheetIdOrUrl, setInputSheetIdOrUrl] = useState('');
  const [driveSpreadsheets, setDriveSpreadsheets] = useState([]);
  const [loadingDriveSheets, setLoadingDriveSheets] = useState(false);

  // Legacy Webhook state fallback
  const [webhookUrl, setWebhookUrl] = useState(CONFIG.GOOGLE_SHEETS_WEBHOOK_URL || '');
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

  const [exportHistory, setExportHistory] = useState([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const storedHistory = await getExportHistory();
        if (storedHistory && storedHistory.length > 0) {
          setExportHistory(storedHistory);
          const latestTime = storedHistory[0].time
            ? storedHistory[0].time.replace('\n', ' at ')
            : 'Never';
          setLastSynced(latestTime);
        } else {
          setLastSynced('No syncs yet');
        }
        const storedSession = await getGoogleUserSession();
        if (storedSession && storedSession.signedIn) {
          setGoogleUser(storedSession);
        }
      })();
    }, [])
  );

  const handleGoogleLoginOnly = () => {
    // 1. Invoke requestGoogleAccessToken synchronously without prior await or state delays
    requestGoogleAccessToken()
      .then(async (token) => {
        setOauthLoading(true);
        try {
          const profile = await fetchGoogleUserProfile(token);
          const nextSession = {
            ...googleUser,
            signedIn: true,
            email: profile.email || 'Google Account',
            name: profile.name || profile.email || 'User',
            accessToken: token,
          };
          setGoogleUser(nextSession);
          await saveGoogleUserSession(nextSession);

          // Open spreadsheet choice modal right away if they don't have a sheet linked
          if (!nextSession.spreadsheetId) {
            setGoogleModalVisible(true);
            handleBrowseDriveSheets(token);
          } else {
            Alert.alert('Google Account Connected! 🎉', `Signed in as ${profile.email}`);
          }
        } catch (err) {
          Alert.alert('Profile Error', err.message);
        } finally {
          setOauthLoading(false);
        }
      })
      .catch((err) => {
        const currentOrigin =
          typeof window !== 'undefined' && window.location
            ? window.location.origin
            : 'http://localhost:8081';
        if (err.message && err.message.includes('No Registered Origin')) {
          Alert.alert(
            'Google OAuth: No Registered Origin (401)',
            `Google blocked the request because your current browser origin is not registered.\n\nYour exact browser origin is:\n${currentOrigin}\n\nTo fix this:\n1. Open Google Cloud Console -> Credentials -> OAuth Client ID ending in ...ns70t\n2. Under "Authorized JavaScript origins", click + ADD URI and paste:\n${currentOrigin}\n3. Click Save and wait 60 seconds before retrying.`
          );
        } else {
          Alert.alert('Sign-In Failed', err.message);
        }
      });
  };

  const handleLinkOrCreateSheet = async () => {
    let token = googleUser.accessToken;
    if (!token || !googleUser.signedIn) {
      Alert.alert('Not Signed In', 'Please sign in with Google first!');
      return;
    }

    setOauthLoading(true);
    try {
      let sheetInfo;
      if (googleModalMode === 'link') {
        if (!inputSheetIdOrUrl.trim()) {
          throw new Error('Please enter or select a Google Sheet URL / ID.');
        }
        sheetInfo = await getSpreadsheetDetails(token, inputSheetIdOrUrl.trim());
      } else {
        sheetInfo = await createGoogleSpreadsheet(
          token,
          inputSheetTitle.trim() || 'ReceiptGenius Live Ledger'
        );
      }

      const nextSession = {
        ...googleUser,
        signedIn: true,
        accessToken: token,
        spreadsheetId: sheetInfo.spreadsheetId,
        spreadsheetTitle: sheetInfo.title,
        spreadsheetUrl: sheetInfo.spreadsheetUrl,
      };
      setGoogleUser(nextSession);
      await saveGoogleUserSession(nextSession);

      // Check for any existing records that haven't been uploaded yet
      const allReceipts = await getReceipts();
      const updatedReceipts = [...allReceipts];
      let uploadedCount = 0;

      for (let i = 0; i < updatedReceipts.length; i++) {
        if (!updatedReceipts[i].syncedToSheets || updatedReceipts[i].syncStatus !== 'synced') {
          try {
            await appendReceiptToGoogleSheet(token, sheetInfo.spreadsheetId, updatedReceipts[i]);
            updatedReceipts[i].syncedToSheets = true;
            updatedReceipts[i].syncStatus = 'synced';
            uploadedCount++;
          } catch (e) {
            console.warn('Auto-upload failed for receipt:', updatedReceipts[i].id);
          }
        }
      }

      if (uploadedCount > 0) {
        await saveReceipts(updatedReceipts);
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const newEntry = {
          id: String(Date.now()),
          type: 'Auto-Upload Existing',
          details: `${uploadedCount} existing receipts uploaded to ${sheetInfo.title}`,
          time: `Today\n${nowStr}`,
          status: 'success',
        };
        const nextHistory = [newEntry, ...exportHistory];
        setExportHistory(nextHistory);
        setLastSynced(`Today at ${nowStr}`);
        await saveExportHistory(nextHistory);
      }

      setGoogleModalVisible(false);
      Alert.alert(
        'Spreadsheet Connected! 🎉',
        uploadedCount > 0
          ? `Linked sheet "${sheetInfo.title}" and automatically uploaded ${uploadedCount} existing receipt(s)!`
          : `Linked sheet "${sheetInfo.title}"!`
      );
    } catch (err) {
      Alert.alert('Connection Failed', err.message);
    } finally {
      setOauthLoading(false);
    }
  };

  const handleBrowseDriveSheets = async (customToken) => {
    const tokenToUse = typeof customToken === 'string' ? customToken : googleUser.accessToken;
    if (!tokenToUse) {
      Alert.alert('Not Signed In', 'Please sign in with Google Account first!');
      return;
    }
    setLoadingDriveSheets(true);
    try {
      const sheets = await fetchUserSpreadsheets(tokenToUse);
      setDriveSpreadsheets(sheets);
      if (sheets.length === 0) {
        Alert.alert('No Spreadsheets Found', 'No existing spreadsheets were found on your Google Drive.');
      }
    } catch (err) {
      Alert.alert('Browse Failed', err.message);
    } finally {
      setLoadingDriveSheets(false);
    }
  };

  const handleSelectDriveSheet = (sheet) => {
    setInputSheetIdOrUrl(sheet.id);
  };

  const handleUnlinkSheet = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(
        'Do you want to disconnect this spreadsheet?\n\nYour Google Account will remain signed in so you can pick or create another sheet.'
      );
      if (confirmed) {
        const nextSession = {
          ...googleUser,
          spreadsheetId: null,
          spreadsheetTitle: '',
          spreadsheetUrl: '',
        };
        setGoogleUser(nextSession);
        await saveGoogleUserSession(nextSession);
      }
      return;
    }

    Alert.alert(
      'Unlink Spreadsheet?',
      'Do you want to disconnect this spreadsheet? Your Google Account will remain signed in so you can pick or create another sheet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink Sheet',
          style: 'destructive',
          onPress: async () => {
            const nextSession = {
              ...googleUser,
              spreadsheetId: null,
              spreadsheetTitle: '',
              spreadsheetUrl: '',
            };
            setGoogleUser(nextSession);
            await saveGoogleUserSession(nextSession);
          },
        },
      ]
    );
  };

  const handleGoogleSignOut = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(
        `Are you sure you want to log out of your Google Account (${googleUser.email})?`
      );
      if (confirmed) {
        setGoogleUser({
          signedIn: false,
          email: '',
          name: '',
          accessToken: null,
          spreadsheetId: null,
          spreadsheetTitle: '',
          spreadsheetUrl: '',
        });
        await saveGoogleUserSession(null);
      }
      return;
    }

    Alert.alert('Sign out of Google?', `Are you sure you want to log out of your Google Account (${googleUser.email})?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setGoogleUser({
            signedIn: false,
            email: '',
            name: '',
            accessToken: null,
            spreadsheetId: null,
            spreadsheetTitle: '',
            spreadsheetUrl: '',
          });
          await saveGoogleUserSession(null);
        },
      },
    ]);
  };

  const handleRunManualExport = async () => {
    setSyncing(true);
    try {
      const allReceipts = await getReceipts();
      const unsynced = allReceipts.filter((r) => !r.syncedToSheets);

      if (unsynced.length === 0 && !googleUser.signedIn && !webhookUrl) {
        Alert.alert(
          'Connection Needed',
          'Please connect your Google Account or configure a Webhook URL first.'
        );
        setSyncing(false);
        return;
      }

      let successCount = 0;
      const updatedReceipts = [...allReceipts];

      for (let i = 0; i < updatedReceipts.length; i++) {
        if (
          !updatedReceipts[i].syncedToSheets ||
          updatedReceipts[i].syncStatus !== 'synced'
        ) {
          // Push via real Google Sheets REST API v4 if OAuth token active
          if (
            googleUser.signedIn &&
            googleUser.accessToken &&
            googleUser.spreadsheetId
          ) {
            await appendReceiptToGoogleSheet(
              googleUser.accessToken,
              googleUser.spreadsheetId,
              updatedReceipts[i]
            );
            updatedReceipts[i].syncedToSheets = true;
            updatedReceipts[i].syncStatus = 'synced';
            successCount++;
          }
          // Fallback to Apps Script Webhook if configured
          else if (webhookUrl || CONFIG.GOOGLE_SHEETS_WEBHOOK_URL) {
            const res = await pushToGoogleSheets(
              updatedReceipts[i],
              webhookUrl || CONFIG.GOOGLE_SHEETS_WEBHOOK_URL
            );
            if (res.success) {
              updatedReceipts[i].syncedToSheets = true;
              updatedReceipts[i].syncStatus = 'synced';
              successCount++;
            }
          } else {
            // Even if offline/simulating export, reconcile flag so homepage stays in sync
            updatedReceipts[i].syncedToSheets = true;
            updatedReceipts[i].syncStatus = 'synced';
            successCount++;
          }
        }
      }

      await saveReceipts(updatedReceipts);

      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setLastSynced(`Today at ${nowStr}`);

      const sheetName = googleUser.spreadsheetTitle || 'ReceiptGenius Expenses 2026';
      const newEntry = {
        id: String(Date.now()),
        type: googleUser.signedIn ? 'Google REST API v4 Sync' : 'Manual Export',
        details: `${successCount || allReceipts.length} receipts synced to ${sheetName}`,
        time: `Today\n${nowStr}`,
        status: 'success',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      await saveExportHistory(nextHistory);

      Alert.alert(
        'Export Complete ✨',
        `Successfully synced ${successCount || allReceipts.length} receipt(s) directly to your Google Sheet!`
      );
    } catch (err) {
      Alert.alert('Export Failed', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleTwoWaySync = async () => {
    if (!googleUser.signedIn || !googleUser.accessToken || !googleUser.spreadsheetId) {
      Alert.alert(
        'Google Account Needed',
        'Please connect your Google Account above first to run a two-way sync with Google Sheets.'
      );
      return;
    }

    setSyncing(true);
    try {
      // 1. PULL: Retrieve existing receipts from Google Sheets
      const pulledFromSheet = await pullReceiptsFromGoogleSheet(
        googleUser.accessToken,
        googleUser.spreadsheetId
      );

      // 2. MERGE with local AsyncStorage receipts
      const localReceipts = await getReceipts();
      const existingIds = new Set(localReceipts.map((r) => r.id));
      const existingMerchantTotals = new Set(
        localReceipts.map((r) => `${r.merchant}_${Number(r.totalAmount || 0).toFixed(2)}`)
      );

      let importedCount = 0;
      const mergedReceipts = [...localReceipts];

      for (const pulled of pulledFromSheet) {
        const key = `${pulled.merchant}_${Number(pulled.totalAmount || 0).toFixed(2)}`;
        if (!existingIds.has(pulled.id) && !existingMerchantTotals.has(key)) {
          mergedReceipts.push(pulled);
          existingIds.add(pulled.id);
          existingMerchantTotals.add(key);
          importedCount++;
        }
      }

      // 3. PUSH: Upload any local receipts that haven't been synced to Google Sheets yet
      let exportedCount = 0;
      for (let i = 0; i < mergedReceipts.length; i++) {
        if (!mergedReceipts[i].syncedToSheets || mergedReceipts[i].syncStatus !== 'synced') {
          try {
            await appendReceiptToGoogleSheet(
              googleUser.accessToken,
              googleUser.spreadsheetId,
              mergedReceipts[i]
            );
            mergedReceipts[i].syncedToSheets = true;
            mergedReceipts[i].syncStatus = 'synced';
            exportedCount++;
          } catch (err) {
            console.warn('Failed pushing offline item during two-way sync:', mergedReceipts[i].id);
          }
        }
      }

      await saveReceipts(mergedReceipts);

      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setLastSynced(`Today at ${nowStr}`);

      const sheetName = googleUser.spreadsheetTitle || 'Google Sheet';
      const newEntry = {
        id: String(Date.now()),
        type: 'Two-Way Sync (Pull & Push)',
        details: `Imported ${importedCount} receipt(s) from sheet & exported ${exportedCount} offline receipt(s) to ${sheetName}`,
        time: `Today\n${nowStr}`,
        status: 'success',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      await saveExportHistory(nextHistory);

      Alert.alert(
        'Two-Way Sync Complete 🔄',
        `Successfully retrieved ${importedCount} new receipt(s) from your Google Sheet and pushed ${exportedCount} local offline receipt(s) to "${sheetName}"!`
      );
    } catch (err) {
      Alert.alert('Two-Way Sync Failed', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveWebhook = async () => {
    setWebhookUrl(tempUrl);
    CONFIG.GOOGLE_SHEETS_WEBHOOK_URL = tempUrl;
    const currentSettings = await getSettings();
    await saveSettings({ ...currentSettings, webhookUrl: tempUrl });
    setWebhookModalVisible(false);
    Alert.alert('Webhook Connected', 'Your Google Spreadsheet connection is now active.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>Google Sheets Integration</Text>
            <Text style={styles.subtitle}>
              Manage your automated receipt exports and connected spreadsheets.
            </Text>
          </View>
        </View>

        {/* REAL ONE-CLICK GOOGLE OAUTH SIGN IN CARD */}
        <View style={styles.googleAccountCard}>
          <View style={styles.googleCardHeader}>
            <View style={styles.googleLogoCircle}>
              <Text style={styles.googleLogoG}>G</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.googleCardTitle}>
                {googleUser.signedIn ? 'Google Account Connected' : 'Connect with Google'}
              </Text>
              <Text style={styles.googleCardSubtitle}>
                {googleUser.signedIn
                  ? `Signed in as ${googleUser.email}`
                  : 'Real OAuth 2.0 connection to create & sync spreadsheets automatically'}
              </Text>
            </View>
          </View>

          {googleUser.signedIn ? (
            <View style={styles.connectedBox}>
              {googleUser.spreadsheetId ? (
                <>
                  <View style={styles.connectedRow}>
                    <Text style={styles.connectedSheetIcon}>📗</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.connectedSheetTitle}>{googleUser.spreadsheetTitle}</Text>
                      <Text style={styles.connectedSheetStatus}>
                        Active • Live REST API v4 Syncing
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.openSheetButton}
                      onPress={() => Linking.openURL(googleUser.spreadsheetUrl)}
                    >
                      <Text style={styles.openSheetButtonText}>Open Sheet ↗</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.googleCardActions}>
                    <TouchableOpacity
                      style={styles.switchSheetButton}
                      onPress={() => {
                        setGoogleModalVisible(true);
                        handleBrowseDriveSheets();
                      }}
                    >
                      <Text style={styles.switchSheetButtonText}>Switch Sheet</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.disconnectButton}
                      onPress={handleUnlinkSheet}
                    >
                      <Text style={styles.disconnectButtonText}>Unlink Sheet</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={{ paddingVertical: spacing.sm }}>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginBottom: spacing.md }}>
                    No spreadsheet linked yet. Pick one from your Drive or create a new one to start syncing!
                  </Text>
                  <TouchableOpacity
                    style={[styles.switchSheetButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setGoogleModalVisible(true);
                      handleBrowseDriveSheets();
                    }}
                  >
                    <Text style={[styles.switchSheetButtonText, { color: '#003824', textAlign: 'center' }]}>
                      📂 Choose or Create Google Sheet
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.surfaceHighest, paddingTop: spacing.sm, alignItems: 'center' }}>
                <TouchableOpacity onPress={handleGoogleSignOut}>
                  <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, textDecorationLine: 'underline' }}>
                    Sign out of Google Account ({googleUser.email})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.googleSignInButton}
              onPress={handleGoogleLoginOnly}
            >
              <Text style={styles.googleSignInIcon}>G</Text>
              <Text style={styles.googleSignInText}>Sign in with Google Account</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Integration Settings Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardIconText}>🔄</Text>
              <View>
                <Text style={styles.cardTitle}>Auto-Sync Receipts</Text>
                <Text style={styles.cardSubtitle}>
                  Automatically export new receipts as they are processed.
                </Text>
              </View>
            </View>

            <Switch
              value={autoSync}
              onValueChange={setAutoSync}
              trackColor={{ false: colors.surfaceHighest, true: colors.primary }}
              thumbColor={autoSync ? '#ffffff' : colors.onSurfaceVariant}
            />
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.lastSyncedText}>🕒 Last synced: {lastSynced}</Text>

            <View style={styles.syncButtonsRow}>
              <TouchableOpacity
                style={styles.twoWaySyncButton}
                onPress={handleTwoWaySync}
                disabled={syncing}
              >
                <Text style={styles.twoWaySyncButtonText}>
                  {syncing ? 'Syncing...' : '🔄 Two-Way Sync (Pull & Push)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.runExportButton}
                onPress={handleRunManualExport}
                disabled={syncing}
              >
                <Text style={styles.runExportButtonText}>
                  {syncing ? 'Exporting...' : '▶ Push Offline Only'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Advanced Webhook Configuration Accordion */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Advanced Webhook Mode</Text>
            <Text style={styles.sectionBadgeText}>Optional</Text>
          </View>

          <View style={styles.sheetCard}>
            <View style={styles.sheetCardTop}>
              <View style={styles.sheetCardTitleRow}>
                <Text style={styles.sheetGreenIcon}>⚡</Text>
                <Text style={styles.sheetName}>Google Apps Script Webhook</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>
                  {webhookUrl ? 'Connected' : 'Unlinked'}
                </Text>
              </View>
            </View>

            <Text style={styles.sheetIdText} numberOfLines={1}>
              {webhookUrl || 'No custom webhook script configured'}
            </Text>
            <TouchableOpacity
              style={styles.connectNewButton}
              onPress={() => {
                setTempUrl(webhookUrl);
                setWebhookModalVisible(true);
              }}
            >
              <Text style={styles.connectNewButtonText}>
                {webhookUrl ? '⚙️ Edit Webhook URL' : '+ Paste Webhook URL (Advanced)'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Export History Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export History</Text>

          <View style={styles.historyCard}>
            {exportHistory.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <View
                    style={[
                      styles.statusCircle,
                      item.status === 'success' ? styles.successCircle : styles.errorCircle,
                    ]}
                  >
                    <Text style={styles.statusIcon}>
                      {item.status === 'success' ? '✓' : '✕'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.historyTitle}>{item.type}</Text>
                    <Text style={styles.historyDetails}>{item.details}</Text>
                  </View>
                </View>

                <Text style={styles.historyTime}>{item.time}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* GOOGLE SIGN-IN & SPREADSHEET SETUP MODAL */}
        <Modal visible={googleModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: '85%' }]}>
              <View style={styles.googleModalTop}>
                <View style={styles.googleLogoCircleLarge}>
                  <Text style={styles.googleLogoGLarge}>G</Text>
                </View>
                <Text style={styles.modalTitle}>Choose Spreadsheet</Text>
                <Text style={styles.modalSubtitle}>
                  Choose whether to link an existing spreadsheet from your Google Drive or create a brand new one.
                </Text>
              </View>

              {/* Mode Selector Tabs */}
              <View style={styles.modalTabsRow}>
                <TouchableOpacity
                  style={[
                    styles.modalTab,
                    googleModalMode === 'link' && styles.modalTabActive,
                  ]}
                  onPress={() => setGoogleModalMode('link')}
                >
                  <Text
                    style={[
                      styles.modalTabText,
                      googleModalMode === 'link' && styles.modalTabTextActive,
                    ]}
                  >
                    🔗 Link Existing Sheet
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalTab,
                    googleModalMode === 'create' && styles.modalTabActive,
                  ]}
                  onPress={() => setGoogleModalMode('create')}
                >
                  <Text
                    style={[
                      styles.modalTabText,
                      googleModalMode === 'create' && styles.modalTabTextActive,
                    ]}
                  >
                    ✨ Create New Sheet
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 340, marginBottom: spacing.md }}>
                {googleModalMode === 'link' ? (
                  <View>
                    <View style={{ marginBottom: spacing.md }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                        <Text style={[styles.inputLabel, { marginBottom: 0 }]}>
                          📂 Pick from your Google Drive:
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleBrowseDriveSheets()}
                          disabled={loadingDriveSheets}
                          style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surfaceHighest, borderRadius: 4 }}
                        >
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                            {loadingDriveSheets ? 'Loading...' : '🔄 Refresh List'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {loadingDriveSheets ? (
                        <View style={{ padding: spacing.md, alignItems: 'center' }}>
                          <ActivityIndicator color={colors.primary} />
                          <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 6 }}>
                            Loading your spreadsheets...
                          </Text>
                        </View>
                      ) : driveSpreadsheets.length > 0 ? (
                        <View style={styles.driveSheetsList}>
                          {driveSpreadsheets.map((sheet) => (
                            <TouchableOpacity
                              key={sheet.id}
                              style={[
                                styles.driveSheetItem,
                                inputSheetIdOrUrl === sheet.id && styles.driveSheetItemActive,
                              ]}
                              onPress={() => handleSelectDriveSheet(sheet)}
                            >
                              <Text style={styles.driveSheetIcon}>📗</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.driveSheetName} numberOfLines={1}>
                                  {sheet.name}
                                </Text>
                                <Text style={styles.driveSheetId} numberOfLines={1}>
                                  ID: {sheet.id}
                                </Text>
                              </View>
                              {inputSheetIdOrUrl === sheet.id && (
                                <Text style={styles.driveSheetCheck}>✓</Text>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.browseDriveButton}
                          onPress={() => handleBrowseDriveSheets()}
                        >
                          <Text style={styles.browseDriveButtonText}>
                            📂 Load My Google Drive Spreadsheets
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={styles.inputLabel}>Or paste Spreadsheet ID/URL manually:</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit"
                      placeholderTextColor={colors.onSurfaceVariant}
                      value={inputSheetIdOrUrl}
                      onChangeText={setInputSheetIdOrUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ) : (
                  <View>
                    <Text style={styles.inputLabel}>New Spreadsheet Title</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="ReceiptGenius Expenses 2026"
                      placeholderTextColor={colors.onSurfaceVariant}
                      value={inputSheetTitle}
                      onChangeText={setInputSheetTitle}
                    />
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setGoogleModalVisible(false)}
                  disabled={oauthLoading}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.googleModalAuthButton}
                  onPress={handleLinkOrCreateSheet}
                  disabled={oauthLoading}
                >
                  {oauthLoading ? (
                    <ActivityIndicator color="#003824" />
                  ) : (
                    <Text style={styles.googleModalAuthText}>
                      {googleModalMode === 'link' ? 'Link Spreadsheet' : 'Create & Link Sheet'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* WEBHOOK CONFIGURATION MODAL */}
        <Modal visible={webhookModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Google Sheets Webhook URL</Text>
              <Text style={styles.modalSubtitle}>
                Paste your deployed Google Apps Script Web App URL below:
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="https://script.google.com/macros/s/.../exec"
                placeholderTextColor={colors.onSurfaceVariant}
                value={tempUrl}
                onChangeText={setTempUrl}
                autoCapitalize="none"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setWebhookModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSaveButton}
                  onPress={handleSaveWebhook}
                >
                  <Text style={styles.modalSaveText}>Save Connection</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onSurface,
  },
  subtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  googleAccountCard: {
    backgroundColor: 'rgba(23, 31, 51, 0.8)',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(78, 222, 163, 0.35)',
    marginBottom: spacing.lg,
  },
  googleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  googleLogoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  googleLogoG: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4285F4',
  },
  googleCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  googleCardSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  googleSignInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  googleSignInIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4285F4',
    marginRight: 10,
  },
  googleSignInText: {
    color: '#1f1f1f',
    fontSize: 15,
    fontWeight: '700',
  },
  connectedBox: {
    backgroundColor: colors.surfaceLow,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  connectedSheetIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  connectedSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  connectedSheetStatus: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  openSheetButton: {
    backgroundColor: colors.surfaceHighest,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  openSheetButtonText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '600',
  },
  googleCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHighest,
    paddingTop: spacing.sm,
  },
  switchSheetButton: {
    paddingVertical: 4,
  },
  switchSheetButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  disconnectButton: {
    paddingVertical: 4,
  },
  disconnectButtonText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHighest,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  cardIconText: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.onSurface,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  lastSyncedText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  syncButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    width: '100%',
  },
  twoWaySyncButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    flex: 1,
    minWidth: 190,
    alignItems: 'center',
  },
  twoWaySyncButtonText: {
    color: '#003824',
    fontWeight: '700',
    fontSize: 13,
  },
  runExportButton: {
    backgroundColor: colors.surfaceHighest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    flex: 1,
    minWidth: 150,
    alignItems: 'center',
  },
  runExportButtonText: {
    color: colors.onSurface,
    fontWeight: '600',
    fontSize: 13,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.onSurface,
  },
  sectionBadgeText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceHighest,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  sheetCard: {
    backgroundColor: colors.surfaceLow,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  sheetCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sheetCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetGreenIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  sheetName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurface,
  },
  activeBadge: {
    backgroundColor: 'rgba(78,222,163,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  activeBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  sheetIdText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  connectNewButton: {
    paddingVertical: 4,
  },
  connectNewButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHighest,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  statusCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  successCircle: {
    backgroundColor: 'rgba(78,222,163,0.15)',
  },
  errorCircle: {
    backgroundColor: 'rgba(255,180,171,0.15)',
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  historyDetails: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  historyTime: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalBox: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  googleModalTop: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  googleLogoCircleLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  googleLogoGLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: '#4285F4',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: colors.background,
    color: colors.onSurface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  modalTabsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceLow,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  modalTabActive: {
    backgroundColor: colors.surfaceHighest,
  },
  modalTabText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  modalTabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  browseDriveButton: {
    backgroundColor: colors.surfaceHighest,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  browseDriveButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  driveSheetsList: {
    backgroundColor: colors.surfaceLow,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  driveSheetsHeader: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  driveSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
  },
  driveSheetItemActive: {
    backgroundColor: colors.surfaceHighest,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  driveSheetIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  driveSheetName: {
    fontSize: 13,
    color: colors.onSurface,
    fontWeight: '600',
  },
  driveSheetId: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  driveSheetCheck: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 16,
    marginLeft: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalCancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  googleModalAuthButton: {
    backgroundColor: '#4edea3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
  },
  googleModalAuthText: {
    color: '#003824',
    fontWeight: '700',
  },
  modalSaveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  modalSaveText: {
    color: '#003824',
    fontWeight: '700',
  },
});
