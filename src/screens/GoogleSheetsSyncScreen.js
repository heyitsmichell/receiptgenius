import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
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
import { DATE_TIMEFRAMES, filterReceiptsByDate } from '../utils/dateFilters';
import CalendarPickerModal from '../components/CalendarPickerModal';

import {
  fetchGoogleUserProfile,
  createGoogleSpreadsheet,
  appendReceiptToGoogleSheet,
  pullReceiptsFromGoogleSheet,
  getSpreadsheetDetails,
  fetchUserSpreadsheets,
} from '../services/googleOAuthSheetsService';

export default function GoogleSheetsSyncScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
    webClientId: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
    iosClientId: CONFIG.GOOGLE_IOS_CLIENT_ID,
    androidClientId: CONFIG.GOOGLE_IOS_CLIENT_ID, // Android Client IDs are blocked from browser Auth by Google, so we use the iOS Client ID which supports Custom URI Schemes!
    redirectUri: Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8086')
      : undefined,
    extraParams: {
      prompt: 'consent',
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });

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


  const [hardResetModalVisible, setHardResetModalVisible] = useState(false);
  const [emailRevealed, setEmailRevealed] = useState(false);

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
        const settings = await getSettings();
        if (settings) {
          if (settings.autoSync !== undefined) {
            setAutoSync(settings.autoSync);
          }

        }
      })();
    }, [])
  );

  const handleToggleAutoSync = async (value) => {
    setAutoSync(value);
    const currentSettings = await getSettings();
    await saveSettings({ ...currentSettings, autoSync: value });
  };

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      handleOAuthSuccess(response.authentication.accessToken);
    } else if (response?.type === 'error' || (response && response.type !== 'success' && response.type !== 'dismiss')) {
      Alert.alert('Google Sign-In Error', response.error?.message || 'Authentication failed or was cancelled.');
      setOauthLoading(false);
    } else if (response?.type === 'dismiss') {
      setOauthLoading(false);
    }
  }, [response]);

  const handleOAuthSuccess = async (token) => {
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
  };

  const handleGoogleLoginOnly = async () => {
    try {
      await promptAsync();
    } catch (e) {
      console.warn('Login popup failed', e);
    }
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

      // RECONCILE: Pull the sheet to see what's actually there
      try {
        const pulledFromSheet = await pullReceiptsFromGoogleSheet(token, sheetInfo.spreadsheetId);
        const remoteIds = new Set(pulledFromSheet.map((r) => r.id));
        const remoteMerchantTotals = new Set(
          pulledFromSheet.map((r) => `${r.merchant}_${Number(r.totalAmount || 0).toFixed(2)}`)
        );

        for (let i = 0; i < updatedReceipts.length; i++) {
          if (updatedReceipts[i].syncedToSheets) {
            const rKey = `${updatedReceipts[i].merchant}_${Number(updatedReceipts[i].totalAmount || 0).toFixed(2)}`;
            if (!remoteIds.has(updatedReceipts[i].id) && !remoteMerchantTotals.has(rKey)) {
              updatedReceipts[i].syncedToSheets = false;
              updatedReceipts[i].syncStatus = 'pending';
            }
          }
        }
      } catch (e) {
        console.warn('Failed to reconcile remote state during link:', e);
      }

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



  const handleTwoWaySync = async () => {
    if (!googleUser.signedIn || !googleUser.accessToken || !googleUser.spreadsheetId) {
      Alert.alert(
        'Google Account Needed',
        'Please connect your Google Account above first to run a sync with Google Sheets.'
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

      // 2.5 RECONCILE: Identify local receipts that think they are synced but are missing from remote
      const remoteIds = new Set(pulledFromSheet.map((r) => r.id));
      const remoteMerchantTotals = new Set(
        pulledFromSheet.map((r) => `${r.merchant}_${Number(r.totalAmount || 0).toFixed(2)}`)
      );

      for (let i = 0; i < mergedReceipts.length; i++) {
        if (mergedReceipts[i].syncedToSheets) {
          const rKey = `${mergedReceipts[i].merchant}_${Number(mergedReceipts[i].totalAmount || 0).toFixed(2)}`;
          if (!remoteIds.has(mergedReceipts[i].id) && !remoteMerchantTotals.has(rKey)) {
            mergedReceipts[i].syncedToSheets = false;
            mergedReceipts[i].syncStatus = 'pending';
          }
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
            console.warn('Failed pushing offline item during full sync:', mergedReceipts[i].id);
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
        type: 'Google Sheets Full Sync',
        details: `Imported ${importedCount} receipt(s) from sheet & exported ${exportedCount} offline receipt(s) to ${sheetName}`,
        time: `Today\n${nowStr}`,
        status: 'success',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      await saveExportHistory(nextHistory);

      Alert.alert(
        'Sync Complete',
        `Successfully retrieved ${importedCount} new receipt(s) from your Google Sheet and pushed ${exportedCount} local offline receipt(s) to "${sheetName}"!`
      );
    } catch (err) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newEntry = {
        id: String(Date.now()),
        type: 'Google Sheets Sync Failed',
        details: err.message || 'Could not synchronize with Google Sheets',
        time: `Today\n${nowStr}`,
        status: 'error',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      saveExportHistory(nextHistory);
      Alert.alert('Sync Failed', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const [exportingLocal, setExportingLocal] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const [exportTimeframe, setExportTimeframe] = useState('All Time');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState('start');

  const handleExportLocal = async (format) => {
    try {
      setExportingLocal(true);
      const rawReceipts = await getReceipts();
      const allReceipts = filterReceiptsByDate(
        rawReceipts,
        exportTimeframe,
        customStart,
        customEnd
      );
      if (!allReceipts || allReceipts.length === 0) {
        Alert.alert('No Matching Receipts', `You have no scanned receipts matching the "${exportTimeframe}" date filter.`);
        return;
      }

      let content = '';
      let filename = '';
      let mimeType = '';

      let tfTag = '';
      if (exportTimeframe === 'Custom Range') {
        const s = customStart.replace(/[\/\.-]/g, '') || 'Start';
        const e = customEnd.replace(/[\/\.-]/g, '') || 'End';
        tfTag = `_${s}to${e}`;
      } else if (exportTimeframe !== 'All Time') {
        tfTag = `_${exportTimeframe.replace(/\s+/g, '')}`;
      }

      if (format === 'csv') {
        filename = `ReceiptGenius_Backup_${new Date().toISOString().slice(0, 10)}${tfTag}.csv`;
        mimeType = 'text/csv';
        const headers = ['ID', 'Date', 'Merchant', 'Category', 'Total (HKD)', 'Tax (HKD)', 'Original Currency', 'Payment Method', 'Notes'];
        const rows = allReceipts.map((r) => {
          const escape = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
          return [
            escape(r.id),
            escape(r.date),
            escape(r.merchant || r.merchantName || 'Unknown Merchant'),
            escape(r.category),
            escape(Number(r.totalAmount || 0).toFixed(2)),
            escape(Number(r.tax || 0).toFixed(2)),
            escape(r.originalCurrency || 'HKD'),
            escape(r.paymentMethod),
            escape(r.notes),
          ].join(',');
        });
        content = [headers.join(','), ...rows].join('\n');
      } else {
        filename = `ReceiptGenius_Backup_${new Date().toISOString().slice(0, 10)}${tfTag}.json`;
        mimeType = 'application/json';
        content = JSON.stringify({
          version: '1.0',
          exportedAt: new Date().toISOString(),
          timeframeFilter: exportTimeframe,
          receiptsCount: allReceipts.length,
          receipts: allReceipts,
        }, null, 2);
      }

      if (Platform.OS === 'web') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (Platform.OS === 'android') {
        try {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              filename,
              mimeType
            );
            await FileSystem.writeAsStringAsync(fileUri, content, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            Alert.alert('Backup Saved ✨', `Saved directly to your selected folder!`);
          } else {
            throw new Error('SAF_DENIED');
          }
        } catch (safErr) {
          const fileUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, content, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: mimeType,
              dialogTitle: `Export ${filename}`,
            });
          }
        }
      } else {
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: mimeType,
            dialogTitle: `Export ${filename}`,
            UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
          });
        } else {
          Alert.alert('Backup Saved ✨', `Saved backup file directly to device storage:\n${fileUri}`);
        }
      }

      const updatedReceipts = allReceipts.map((r) => ({
        ...r,
        syncedToSheets: true,
        syncStatus: 'synced',
      }));
      await saveReceipts(updatedReceipts);

      const now = new Date();
      const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newEntry = {
        id: String(Date.now()),
        type: format === 'csv' ? 'Device Backup (CSV)' : 'Device Backup (JSON)',
        details: `${allReceipts.length} receipts (${exportTimeframe}) exported to ${filename}`,
        time: `Today\n${nowStr}`,
        status: 'success',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      await saveExportHistory(nextHistory);
      setLastSynced(`Today at ${nowStr}`);

      Alert.alert(
        'Backup Exported ✨',
        `Successfully generated and exported ${filename} (${allReceipts.length} receipts) to your device!`
      );
    } catch (err) {
      if (err.message && err.message.includes('User did not share')) {
        return;
      }
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newEntry = {
        id: String(Date.now()),
        type: format === 'csv' ? 'Device Backup Failed (CSV)' : 'Device Backup Failed (JSON)',
        details: err.message || 'Could not generate or export offline backup file',
        time: `Today\n${nowStr}`,
        status: 'error',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      saveExportHistory(nextHistory);
      Alert.alert('Export Failed', err.message || 'Could not export backup file.');
    } finally {
      setExportingLocal(false);
    }
  };

  const handleImportBackup = async () => {
    try {
      setImportingLocal(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setImportingLocal(false);
        return;
      }

      const asset = result.assets[0];
      const filename = asset.name?.toLowerCase() || '';

      if (!filename.endsWith('.json') && !filename.endsWith('.csv')) {
        Alert.alert('Invalid File Type', 'Please select a valid ReceiptGenius .json or .csv backup file.');
        setImportingLocal(false);
        return;
      }

      let fileContent = '';

      if (Platform.OS === 'web' && asset.file) {
        fileContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (e) => reject(e);
          reader.readAsText(asset.file);
        });
      } else if (Platform.OS === 'web') {
        fileContent = await (await fetch(asset.uri)).text();
      } else {
        fileContent = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      let receiptsToImport = [];

      const isJsonFile = asset.name?.toLowerCase().endsWith('.json') || fileContent.trim().startsWith('{') || fileContent.trim().startsWith('[');

      if (isJsonFile) {
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed.receipts)) {
          receiptsToImport = parsed.receipts;
        } else if (Array.isArray(parsed)) {
          receiptsToImport = parsed;
        } else {
          throw new Error('Could not find receipts list inside the JSON backup.');
        }
      } else {
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length <= 1) {
          throw new Error('The CSV file is empty or missing data rows.');
        }
        for (let i = 1; i < lines.length; i++) {
          const rowStr = lines[i];
          const cols = [];
          let current = '';
          let inQuotes = false;
          for (let c = 0; c < rowStr.length; c++) {
            const char = rowStr[c];
            if (char === '"' && rowStr[c + 1] === '"') {
              current += '"';
              c++;
            } else if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              cols.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          cols.push(current.trim());

          if (cols.length >= 4) {
            const idVal = cols[0] || String(Date.now() + i);
            const dateVal = cols[1] || new Date().toISOString().slice(0, 10);
            const merchantVal = cols[2] || 'Unknown Merchant';
            const categoryVal = cols[3] || 'Other';
            const totalVal = parseFloat(cols[4]) || 0;
            const taxVal = parseFloat(cols[5]) || 0;
            const currencyVal = cols[6] || 'HKD';
            const methodVal = cols[7] || 'Cash';
            const notesVal = cols[8] || '';

            receiptsToImport.push({
              id: idVal,
              date: dateVal,
              merchantName: merchantVal,
              merchant: merchantVal,
              category: categoryVal,
              totalAmount: totalVal,
              tax: taxVal,
              originalCurrency: currencyVal,
              paymentMethod: methodVal,
              notes: notesVal,
              syncedToSheets: true,
              syncStatus: 'synced',
            });
          }
        }
      }

      if (receiptsToImport.length === 0) {
        Alert.alert('No Receipts Found', 'The selected file did not contain valid receipt records.');
        return;
      }

      const existingReceipts = await getReceipts();
      const existingIds = new Set((existingReceipts || []).map(r => String(r.id)));
      const newReceipts = [];
      let duplicateCount = 0;

      receiptsToImport.forEach(r => {
        const idStr = String(r.id || Date.now() + Math.random());
        if (existingIds.has(idStr)) {
          duplicateCount++;
        } else {
          newReceipts.push({ ...r, id: idStr });
          existingIds.add(idStr);
        }
      });

      const mergedReceipts = [...(existingReceipts || []), ...newReceipts];
      await saveReceipts(mergedReceipts);

      const now = new Date();
      const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newEntry = {
        id: String(Date.now()),
        type: isJsonFile ? 'Device Restore (JSON)' : 'Device Restore (CSV)',
        details: `${newReceipts.length} imported, ${duplicateCount} duplicates skipped from ${asset.name || 'backup file'}`,
        time: `Today\n${nowStr}`,
        status: 'success',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      await saveExportHistory(nextHistory);
      setLastSynced(`Today at ${nowStr}`);

      Alert.alert(
        'Import Successful ✨',
        `Restored ${newReceipts.length} new receipts from ${asset.name || 'backup'} (${duplicateCount} existing duplicates skipped).`
      );
    } catch (err) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newEntry = {
        id: String(Date.now()),
        type: 'Device Restore Failed',
        details: err.message || 'Could not import or parse backup data',
        time: `Today\n${nowStr}`,
        status: 'error',
      };
      const nextHistory = [newEntry, ...exportHistory];
      setExportHistory(nextHistory);
      saveExportHistory(nextHistory);
      Alert.alert('Import Failed', err.message || 'Could not import backup file.');
    } finally {
      setImportingLocal(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Settings</Text>
          </View>
          <TouchableOpacity
            style={styles.themeToggleBtn}
            onPress={toggleTheme}
          >
            <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={isDark ? '#fbbf24' : '#64748b'} />
          </TouchableOpacity>
        </View>

        {/* REAL ONE-CLICK GOOGLE OAUTH SIGN IN CARD */}
        <View style={[styles.googleAccountCard, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
          <View style={styles.googleCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.googleCardTitle, { color: colors.onSurface }]}>
                {googleUser.signedIn ? 'Cloud Save Connected' : 'Cloud Save'}
              </Text>
              {googleUser.signedIn && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Text style={[styles.googleCardSubtitle, { marginTop: 0 }]}>Signed in as </Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setEmailRevealed(!emailRevealed)}>
                    {emailRevealed ? (
                      <Text style={[styles.googleCardSubtitle, { marginTop: 0, color: colors.primary, fontWeight: '600' }]}>{googleUser.email}</Text>
                    ) : (
                      <View style={{ backgroundColor: colors.onSurfaceVariant, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 0 }}>
                        <Text style={[styles.googleCardSubtitle, { marginTop: 0, color: colors.onSurfaceVariant, opacity: 0 }]}>{googleUser.email}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {googleUser.signedIn ? (
            <View style={[styles.connectedBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest }]}>
              {googleUser.spreadsheetId ? (
                <>
                  <View style={styles.connectedRow}>
                    <Text style={styles.connectedSheetIcon}>📗</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.connectedSheetTitle, { color: colors.onSurface }]}>{googleUser.spreadsheetTitle}</Text>
                      <Text style={[styles.connectedSheetStatus, { color: colors.onSurfaceVariant }]}>
                        Active • Live REST API v4 Syncing
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.openSheetButton, { backgroundColor: colors.surfaceHighest }]}
                      onPress={() => Linking.openURL(googleUser.spreadsheetUrl)}
                    >
                      <Text style={[styles.openSheetButtonText, { color: colors.onSurface }]}>Open Sheet ↗</Text>
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
                    style={[styles.twoWaySyncButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setGoogleModalVisible(true);
                      handleBrowseDriveSheets();
                    }}
                  >
                    <Text style={styles.twoWaySyncButtonText}>
                      Choose or Create Google Sheet
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.surfaceHighest, paddingTop: spacing.md, alignItems: 'center' }}>
                <TouchableOpacity 
                  onPress={handleGoogleSignOut}
                  style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceHighest, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.outlineVariant }}
                >
                  <Text style={{ fontSize: 13, color: colors.onSurface, fontWeight: '600' }}>
                    Sign Out
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.googleSignInButton, { backgroundColor: colors.surfaceHigh, borderWidth: 1.5, borderColor: colors.outline }]}
              onPress={handleGoogleLoginOnly}
            >
              <Text style={styles.googleSignInIcon}>G</Text>
              <Text style={[styles.googleSignInText, { color: colors.onSurface }]}>Sign in with Google Account</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Integration Settings Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Auto-Sync Receipts</Text>
              </View>
            </View>

            <Switch
              value={autoSync}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: colors.surfaceHighest, true: colors.primary }}
              thumbColor={autoSync ? '#ffffff' : colors.onSurfaceVariant}
            />
          </View>

          <View style={styles.cardFooter}>
            <Text style={[styles.lastSyncedText, { color: colors.onSurfaceVariant }]}>Last synced: {lastSynced}</Text>

            <View style={styles.syncButtonsRow}>
              <TouchableOpacity
                style={[styles.twoWaySyncButton, { backgroundColor: colors.primary }]}
                onPress={handleTwoWaySync}
                disabled={syncing}
              >
                <Text style={styles.twoWaySyncButtonText}>
                  {syncing ? 'Syncing...' : 'Sync with Google Sheets'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Local Device Backup & File Export */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Device Local Backup</Text>
            <Text style={[styles.sectionBadgeText, { color: colors.onSurfaceVariant, backgroundColor: colors.surfaceHighest }]}>Offline Export</Text>
          </View>

          <View style={[styles.sheetCard, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
            <View style={styles.sheetCardTop}>
              <View style={styles.sheetCardTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetName, { color: colors.onSurface }]}>Export Directly to Device</Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>
              <View style={styles.filterToggleContainer}>
                <TouchableOpacity 
                  style={[styles.filterToggleBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest }]}
                  onPress={() => setFiltersExpanded(!filtersExpanded)}
                >
                  <Text style={[styles.filterToggleText, { color: colors.onSurface }]}>
                    Export Filter {(exportTimeframe !== 'All Time' || customStart !== '') ? ` (${exportTimeframe})` : ''}
                  </Text>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
                    {filtersExpanded ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
              </View>

              {filtersExpanded && (
                <View style={[styles.accordionContent, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
                  <Text style={[styles.accordionSectionTitle, { color: colors.onSurfaceVariant }]}>Timeframe</Text>
                  <View style={styles.wrapContainer}>
                    {DATE_TIMEFRAMES.map((tf) => {
                      const selected = tf === exportTimeframe;
                      return (
                        <TouchableOpacity
                          key={tf}
                          style={[
                            styles.wrapChip,
                            { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest },
                            selected && { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
                          ]}
                          onPress={() => setExportTimeframe(tf)}
                        >
                          <Text
                            style={[
                              styles.wrapChipText,
                              { color: colors.onSurfaceVariant },
                              selected && { color: colors.primary, fontWeight: '700' },
                            ]}
                          >
                            {tf === 'Custom Range' ? 'Custom Range' : tf}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {exportTimeframe === 'Custom Range' && (
                <View style={[styles.customDateRow, { marginTop: 10, paddingHorizontal: 0 }]}>
                  <View style={styles.customDateBox}>
                    <Text style={[styles.customDateLabel, { color: colors.onSurfaceVariant }]}>FROM (DD/MM/YY)</Text>
                    <TouchableOpacity
                      style={[styles.datePickerBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}
                      onPress={() => {
                        setCalendarTarget('start');
                        setCalendarVisible(true);
                      }}
                    >
                      <Text style={[styles.datePickerBtnText, { color: colors.onSurface }]}>
                        {customStart || 'Select Start Date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.customDateToText, { color: colors.onSurfaceVariant }]}>to</Text>
                  <View style={styles.customDateBox}>
                    <Text style={[styles.customDateLabel, { color: colors.onSurfaceVariant }]}>TO (DD/MM/YY)</Text>
                    <TouchableOpacity
                      style={[styles.datePickerBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}
                      onPress={() => {
                        setCalendarTarget('end');
                        setCalendarVisible(true);
                      }}
                    >
                      <Text style={[styles.datePickerBtnText, { color: colors.onSurface }]}>
                        {customEnd || 'Select End Date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {(customStart !== '' || customEnd !== '') && (
                    <TouchableOpacity
                      style={[styles.customDateClearBtn, { backgroundColor: colors.errorContainer, borderColor: colors.error }]}
                      onPress={() => {
                        setCustomStart('');
                        setCustomEnd('');
                      }}
                    >
                      <Text style={[styles.customDateClearText, { color: colors.error }]}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            <View style={styles.backupButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.backupExportButton,
                  {
                    backgroundColor: colors.surfaceHigh,
                    borderColor: colors.outlineVariant,
                    justifyContent: 'center',
                  }
                ]}
                onPress={() => handleExportLocal('json')}
                disabled={exportingLocal || syncing}
                activeOpacity={0.8}
              >
                <Text style={[styles.backupButtonTitle, { color: colors.onSurface, textAlign: 'center', marginBottom: 0 }]}>Export JSON Backup</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.backupExportButton,
                  {
                    backgroundColor: colors.surfaceHigh,
                    borderColor: colors.outlineVariant,
                    justifyContent: 'center',
                  }
                ]}
                onPress={() => handleExportLocal('csv')}
                disabled={exportingLocal || syncing}
                activeOpacity={0.8}
              >
                <Text style={[styles.backupButtonTitle, { color: colors.onSurface, textAlign: 'center', marginBottom: 0 }]}>Export CSV Table</Text>
              </TouchableOpacity>
            </View>

            {/* Import / Restore Backup Section right below Export buttons */}
            <View style={{ marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.surfaceHighest }}>
              <Text style={[styles.cardSubtitle, { color: colors.onSurface, fontWeight: '600', marginBottom: 4 }]}>
                Restore from Device Backup
              </Text>
              <Text style={[styles.cardDesc, { color: colors.onSurfaceVariant, marginBottom: spacing.md }]}>
                Import receipts from a previously saved ReceiptGenius JSON backup or external CSV file. Existing receipts will not be duplicated.
              </Text>

              <View style={[styles.backupButtonsRow, { flexDirection: 'column' }]}>
                <TouchableOpacity
                  style={[
                    styles.backupExportButton,
                    {
                      width: '100%',
                      backgroundColor: colors.surfaceHigh,
                      borderColor: colors.outlineVariant,
                      justifyContent: 'center',
                    }
                  ]}
                  onPress={() => handleImportBackup()}
                  disabled={exportingLocal || importingLocal || syncing}
                  activeOpacity={0.8}
                >
                  {importingLocal ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.backupButtonTitle, { color: colors.onSurface, textAlign: 'center', marginBottom: 0 }]}>Import Backup Data (JSON / CSV)</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Export History Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Export History</Text>

          <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
            {exportHistory.map((item) => (
              <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.surfaceHighest }]}>
                <View style={styles.historyLeft}>
                  <View
                    style={[
                      styles.statusCircle,
                      item.status === 'success' ? styles.successCircle : styles.errorCircle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusIcon,
                        {
                          color: item.status === 'success'
                            ? (isDark ? '#34D399' : '#16A34A')
                            : (isDark ? '#F87171' : '#DC2626')
                        }
                      ]}
                    >
                      {item.status === 'success' ? '✓' : '✕'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, overflow: 'hidden' }}>
                    <Text style={[styles.historyTitle, { color: colors.onSurface }]}>{item.type}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
                      <Text selectable={true} style={[styles.historyDetails, { color: colors.onSurfaceVariant, marginTop: 0 }]}>
                        {item.details}
                      </Text>
                    </ScrollView>
                  </View>
                </View>

                <Text style={[styles.historyTime, { color: colors.onSurfaceVariant, marginLeft: spacing.sm, flexShrink: 0 }]}>{item.time}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Hard Reset */}
        <View style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xxl }}>
          <TouchableOpacity onPress={() => setHardResetModalVisible(true)}>
            <Text style={{ color: colors.error, fontWeight: 'bold', fontSize: 15 }}>Hard Reset All Data</Text>
          </TouchableOpacity>
        </View>

        {/* HARD RESET CONFIRMATION MODAL */}
        <Modal visible={hardResetModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.error, borderWidth: 1 }]}>
              <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.modalTitle, { color: colors.error, marginTop: 4 }]}>Hard Reset</Text>
                <Text style={[styles.modalSubtitle, { color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 0 }]}>
                  Are you sure you want to completely wipe all your data? This cannot be undone.
                </Text>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setHardResetModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.googleModalAuthButton,
                    { 
                      backgroundColor: colors.errorContainer, 
                      borderColor: colors.error, 
                      borderWidth: 1 
                    }
                  ]}
                  onPress={async () => {
                    const { clearAllData } = require('../services/storageService');
                    await clearAllData();
                    setHardResetModalVisible(false);
                    if (Platform.OS === 'web') {
                      window.alert('All data has been reset.');
                      window.location.reload();
                    } else {
                      Alert.alert('Success', 'All data has been reset. Please close and reopen the app to apply changes.');
                    }
                  }}
                >
                  <Text style={[styles.googleModalAuthText, { color: colors.error }]}>Wipe Everything</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* GOOGLE SIGN-IN & SPREADSHEET SETUP MODAL */}
        <Modal visible={googleModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest, maxHeight: '85%' }]}>
              <View style={styles.googleModalTop}>
                <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Choose Spreadsheet</Text>
                <Text style={[styles.modalSubtitle, { color: colors.onSurfaceVariant }]}>
                  Choose whether to link an existing spreadsheet from your Google Drive or create a brand new one.
                </Text>
              </View>

              {/* Mode Selector Tabs */}
              <View style={[styles.modalTabsRow, { backgroundColor: colors.surfaceHigh }]}>
                <TouchableOpacity
                  style={[
                    styles.modalTab,
                    googleModalMode === 'link' && [styles.modalTabActive, { backgroundColor: colors.surfaceHighest }],
                  ]}
                  onPress={() => setGoogleModalMode('link')}
                >
                  <Text
                    style={[
                      styles.modalTabText,
                      { color: colors.onSurfaceVariant },
                      googleModalMode === 'link' && { color: colors.primary, fontWeight: '700' },
                    ]}
                  >
                    Link Existing Sheet
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalTab,
                    googleModalMode === 'create' && [styles.modalTabActive, { backgroundColor: colors.surfaceHighest }],
                  ]}
                  onPress={() => setGoogleModalMode('create')}
                >
                  <Text
                    style={[
                      styles.modalTabText,
                      { color: colors.onSurfaceVariant },
                      googleModalMode === 'create' && { color: colors.primary, fontWeight: '700' },
                    ]}
                  >
                    Create New Sheet
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 340, marginBottom: spacing.md }}>
                {googleModalMode === 'link' ? (
                  <View>
                    <View style={{ marginBottom: spacing.md }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                        <Text style={[styles.inputLabel, { marginBottom: 0 }]}>
                          Pick from your Google Drive:
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleBrowseDriveSheets()}
                          disabled={loadingDriveSheets}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceHighest, borderRadius: borderRadius.md }}
                        >
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                            {loadingDriveSheets ? 'Loading...' : 'Refresh List'}
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
                                { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest },
                                inputSheetIdOrUrl === sheet.id && styles.driveSheetItemActive,
                              ]}
                              onPress={() => handleSelectDriveSheet(sheet)}
                            >
                              <Text style={styles.driveSheetIcon}>📗</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.driveSheetName, { color: colors.onSurface }]} numberOfLines={1}>
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


      </ScrollView>

      <CalendarPickerModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        initialDate={calendarTarget === 'start' ? customStart : customEnd}
        title={calendarTarget === 'start' ? 'Select Start Date' : 'Select End Date'}
        onSelect={(dateStr) => {
          if (calendarTarget === 'start') {
            setCustomStart(dateStr);
          } else {
            setCustomEnd(dateStr);
          }
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
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
  themeToggleBtn: {
    backgroundColor: colors.surfaceHigh,
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
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
    borderRadius: borderRadius.xl,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    flex: 1,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoWaySyncButtonText: {
    color: '#003824',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  runExportButton: {
    backgroundColor: colors.surfaceHighest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    flex: 1,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runExportButtonText: {
    color: colors.onSurface,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  timeframeChip: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  timeframeChipSelected: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  timeframeChipText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  timeframeChipTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: 8,
  },
  customDateBox: {
    flex: 1,
  },
  customDateLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  datePickerBtn: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    justifyContent: 'center',
  },
  datePickerBtnText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  customDateToText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
    marginTop: 14,
  },
  customDateClearBtn: {
    marginTop: 14,
    backgroundColor: colors.errorContainer,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  customDateClearText: {
    color: '#ff6b6b',
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 0,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceHighest,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  sheetCard: {
    backgroundColor: colors.surfaceLow,
    borderRadius: borderRadius.xl,
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
    backgroundColor: colors.primaryContainer,
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
    marginTop: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: spacing.lg,
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
    backgroundColor: colors.primaryContainer,
  },
  errorCircle: {
    backgroundColor: colors.errorContainer,
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
  backupButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  backupExportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  backupCsvButton: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.outlineVariant,
  },
  backupJsonButton: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.outlineVariant,
  },
  backupExportIconText: {
    fontSize: 24,
  },
  backupButtonTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  backupButtonSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
  },
  filterToggleContainer: {
    marginBottom: spacing.sm,
  },
  filterToggleBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  accordionContent: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  accordionSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wrapChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  wrapChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  });
}
