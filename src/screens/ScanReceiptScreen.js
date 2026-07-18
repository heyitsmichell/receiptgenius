import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius } from '../theme/theme';
import LoadingOverlay from '../components/LoadingOverlay';
import ReceiptReviewModal from '../components/ReceiptReviewModal';
import { scanReceiptImage } from '../services/geminiService';
import { pushToGoogleSheets } from '../services/sheetsService';
import {
  saveReceipt,
  getSettings,
  getGoogleUserSession,
  getExportHistory,
  saveExportHistory,
} from '../services/storageService';
import { appendReceiptToGoogleSheet } from '../services/googleOAuthSheetsService';

export default function ScanReceiptScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [reviewVisible, setReviewVisible] = useState(false);
  const [parsedReceipt, setParsedReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Web Camera live feed state
  const [webCameraActive, setWebCameraActive] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let stream = null;
    if (webCameraActive && Platform.OS === 'web') {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then((s) => {
            stream = s;
            if (videoRef.current) {
              videoRef.current.srcObject = s;
            }
          })
          .catch((err) => {
            console.warn('Webcam permission or access error:', err);
            Alert.alert(
              'Camera Access Error',
              'Could not access webcam. Please check browser permissions or use "Upload from Gallery".'
            );
            setWebCameraActive(false);
          });
      } else {
        Alert.alert('Not Supported', 'Live webcam capture is not supported by your current browser.');
        setWebCameraActive(false);
      }
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [webCameraActive]);

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
    }
    setWebCameraActive(false);
  };

  const captureWebcamPhoto = () => {
    if (!videoRef.current || Platform.OS !== 'web') return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Url = canvas.toDataURL('image/jpeg', 0.85);
    const base64Data = base64Url.split(',')[1];

    stopWebcam();
    if (base64Data) {
      processImage(base64Data);
    }
  };

  // Handle Photo Capture from Camera
  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      setWebCameraActive(true);
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Needed',
        'Camera permission is required to scan receipts.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]?.base64) {
      processImage(result.assets[0].base64);
    }
  };

  // Handle Gallery Upload
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Needed',
        'Gallery permission is required to select receipts.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]?.base64) {
      processImage(result.assets[0].base64);
    }
  };

  // Process image via Gemini API OCR
  const processImage = async (base64Image) => {
    setLoading(true);
    setErrorMessage('');
    setLoadingStage('Analyzing receipt with Gemini AI...');

    const settings = await getSettings();
    const scanResult = await scanReceiptImage(base64Image, settings.geminiApiKey);

    setLoading(false);

    if (scanResult.success) {
      setParsedReceipt(scanResult.data);
      if (scanResult.lowConfidence) {
        setErrorMessage(scanResult.error);
      }
      setReviewVisible(true);
    } else {
      setParsedReceipt(scanResult.data);
      setErrorMessage(scanResult.error);
      setReviewVisible(true);
    }
  };

  // Confirm and Push to linked Google Sheet (OAuth REST API or Webhook)
  const handleConfirmReceipt = async (confirmedReceipt) => {
    setReviewVisible(false);
    setLoading(true);
    setLoadingStage('Syncing receipt to Google Sheets...');

    const googleSession = await getGoogleUserSession();
    let syncSuccess = false;
    let targetSheetName = 'Google Sheets';

    if (
      googleSession &&
      googleSession.signedIn &&
      googleSession.accessToken &&
      googleSession.spreadsheetId
    ) {
      try {
        await appendReceiptToGoogleSheet(
          googleSession.accessToken,
          googleSession.spreadsheetId,
          confirmedReceipt
        );
        syncSuccess = true;
        targetSheetName = googleSession.spreadsheetTitle || 'ReceiptGenius Expenses 2026';

        // Add to export history log
        const history = await getExportHistory();
        const nowStr = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const newEntry = {
          id: String(Date.now()),
          type: 'Auto-Export New Receipt',
          details: `1 receipt (${confirmedReceipt.merchant}) auto-exported to ${targetSheetName}`,
          time: `Today\n${nowStr}`,
          status: 'success',
        };
        const nextHistory = [newEntry, ...history];
        await saveExportHistory(nextHistory);
      } catch (err) {
        console.warn('OAuth live append failed, checking fallback webhook:', err);
      }
    }

    // Fallback to webhook if OAuth didn't execute
    if (!syncSuccess) {
      const settings = await getSettings();
      if (settings && settings.webhookUrl) {
        const syncResult = await pushToGoogleSheets(
          confirmedReceipt,
          settings.webhookUrl
        );
        syncSuccess = syncResult.success;
      }
    }

    const receiptToSave = {
      ...confirmedReceipt,
      syncedToSheets: syncSuccess,
      syncStatus: syncSuccess ? 'synced' : 'pending',
    };

    await saveReceipt(receiptToSave);
    setLoading(false);

    Alert.alert(
      syncSuccess ? 'Synced Successfully! 🎉' : 'Saved Locally',
      syncSuccess
        ? `Your receipt (${confirmedReceipt.merchant}) was automatically exported to "${targetSheetName}" and saved locally.`
        : 'Saved to your offline queue. You can sync later from your Sheets Sync tab.',
      [{ text: 'OK', onPress: () => navigation.navigate('Dashboard') }]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>AI Receipt Scanner</Text>
          <Text style={styles.headerSubtitle}>
            Position receipt within frame or select from gallery
          </Text>
        </View>

        {/* Responsive Scanner Viewfinder Frame */}
        <View style={styles.viewfinderContainer}>
          <View style={styles.viewfinderBox}>
            {/* 4 Corner Accents */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            {webCameraActive && Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}>
                {React.createElement('video', {
                  ref: videoRef,
                  autoPlay: true,
                  playsInline: true,
                  style: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  },
                })}
              </View>
            ) : (
              <View style={styles.viewfinderInner}>
                <Text style={styles.viewfinderText}>
                  GEMINI VISION SCAN READY
                </Text>
                <Text style={styles.viewfinderSubtext}>
                  Powered by Google Multimodal AI
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Dual Mode Capture Action Buttons */}
        <View style={styles.buttonStack}>
          {webCameraActive && Platform.OS === 'web' ? (
            <>
              <TouchableOpacity
                style={[styles.primaryCaptureButton, { backgroundColor: '#00FFA3' }]}
                onPress={captureWebcamPhoto}
              >
                <Text style={[styles.primaryCaptureButtonText, { color: '#0D1117', fontSize: 18 }]}>
                  📸 Snap & Scan Receipt
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryUploadButton, { borderColor: colors.error }]}
                onPress={stopWebcam}
              >
                <Text style={[styles.secondaryUploadButtonText, { color: colors.error }]}>
                  ✕ Close Camera
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.primaryCaptureButton}
                onPress={takePhoto}
              >
                <Text style={styles.primaryCaptureButtonText}>
                  Take Photo with Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryUploadButton}
                onPress={pickImage}
              >
                <Text style={styles.secondaryUploadButtonText}>
                  Upload from Gallery
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.manualEntryLink}
            onPress={() => {
              setErrorMessage('Manual Entry Mode Activated');
              setParsedReceipt({
                id: 'REC-' + Date.now(),
                merchant: '',
                date: new Date().toISOString().split('T')[0],
                category: 'Food & Dining',
                subtotal: 0,
                tax: 0,
                totalAmount: 0,
              });
              setReviewVisible(true);
            }}
          >
            <Text style={styles.manualEntryText}>
              Or enter receipt manually →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Multi-stage Loading Overlay */}
        <LoadingOverlay visible={loading} stage={loadingStage} />

        {/* Review & Resilience Manual Fallback Modal */}
        <ReceiptReviewModal
          visible={reviewVisible}
          receiptData={parsedReceipt}
          errorMessage={errorMessage}
          onConfirm={handleConfirmReceipt}
          onCancel={() => setReviewVisible(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  viewfinderContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  viewfinderBox: {
    width: '100%',
    maxWidth: 420,
    flex: 1,
    minHeight: 320,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.lg,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.primary,
  },
  topLeft: {
    top: 16,
    left: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 16,
    right: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 16,
    left: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 16,
    right: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  viewfinderInner: {
    alignItems: 'center',
  },
  viewfinderText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  viewfinderSubtext: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 4,
  },
  buttonStack: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  primaryCaptureButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryCaptureButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryUploadButton: {
    backgroundColor: colors.surfaceHigh,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  secondaryUploadButtonText: {
    color: colors.onSurface,
    fontWeight: '600',
    fontSize: 15,
  },
  manualEntryLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  manualEntryText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
