# 📱 CipherLink Mobile

End-to-end encrypted messaging for iOS and Android.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16+ 
- **npm** or **yarn**
- **React Native CLI**
- **Android Studio** (for Android)
- **Xcode** (for iOS, macOS only)

### 1. Install Dependencies

```bash
cd secure-comm/mobile-app
npm install
```

### 2. Install iOS Dependencies (macOS only)

```bash
cd ios
pod install
cd ..
```

### 3. Start Metro Bundler

```bash
npm start
# or
npx react-native start
```

### 4. Run the App

**Android:**
```bash
npm run android
# or
npx react-native run-android
```

**iOS (macOS only):**
```bash
npm run ios
# or
npx react-native run-ios
```

---

## 🔧 Backend Connection

Make sure the backend is running before using the mobile app:

```bash
cd secure-comm/backend
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Update API URL (if needed)

Edit `secure-comm/mobile-app/src/services/api.ts`:

```typescript
const API_BASE_URL = __DEV__
  ? 'http://YOUR_COMPUTER_IP:8000/api'  // Use your computer's IP
  : 'https://api.cipherlink.app/api';
```

> **Find your IP:**
> - Windows: `ipconfig` → IPv4 Address
> - macOS/Linux: `ifconfig` or `ip addr`

---

## 📋 Detailed Setup

### Android Setup

1. **Install Android Studio**
   - Download from [developer.android.com/studio](https://developer.android.com/studio)
   - Install Android SDK
   - Create a virtual device (AVD) or connect physical device

2. **Enable USB Debugging** (physical device)
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable USB Debugging

3. **Set Environment Variables**
   ```bash
   # Windows
   set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
   
   # macOS/Linux
   export ANDROID_HOME=$HOME/Library/Android/sdk
   ```

### iOS Setup (macOS only)

1. **Install Xcode**
   - Download from Mac App Store
   - Open Xcode → Preferences → Locations → Install Command Line Tools

2. **Install CocoaPods**
   ```bash
   sudo gem install cocoapods
   ```

3. **Run on Simulator or Device**
   ```bash
   # Simulator
   npm run ios
   
   # Specific device
   npx react-native run-ios --device="Your Device Name"
   ```

---

## 📱 Features

- 🔐 **End-to-end encryption** (X25519 + Ed25519)
- 🎨 **Glassmorphism UI** with 3D animations
- 💬 **Real-time messaging** via WebSockets
- 📇 **Contact management**
- 🔒 **Secure Vault** for encrypted storage
- 📱 **Cross-platform** (iOS & Android)

---

## 🛠️ Development

### Available Scripts

```bash
npm start          # Start Metro bundler
npm run android    # Run on Android
npm run ios        # Run on iOS (macOS only)
npm test           # Run tests
npm run lint       # Run ESLint
```

### Project Structure

```
mobile-app/
├── src/
│   ├── components/
│   │   └── motion/        # 3D animations & glassmorphism
│   ├── navigation/        # React Navigation setup
│   ├── screens/
│   │   ├── auth/          # Login, Register, KeyGen
│   │   ├── main/          # Chats, Contacts, Vault, Settings
│   │   └── onboarding/    # Onboarding flow
│   ├── services/          # API services
│   ├── store/             # Zustand state management
│   ├── theme/             # Colors & theme
│   └── utils/             # Crypto utilities
├── android/               # Android native files
├── ios/                   # iOS native files
└── package.json
```

---

## 🐛 Troubleshooting

### Metro Bundler Issues

```bash
# Clear cache
npx react-native start --reset-cache

# Watchman issues (macOS/Linux)
watchman watch-del-all
```

### Android Build Issues

```bash
# Clean build
cd android
./gradlew clean
cd ..
npm run android
```

### iOS Build Issues (macOS)

```bash
# Clean build
cd ios
xcodebuild clean
rm -rf Pods Podfile.lock
pod install
cd ..
npm run ios
```

### App Can't Connect to Backend

1. Ensure backend is running: `http://localhost:8000`
2. Use your computer's **IP address** instead of `localhost`
3. Check firewall settings
4. Ensure phone and computer are on same WiFi

---

## 🔒 Security

- Private keys stored in **iOS Keychain** / **Android Keystore**
- End-to-end encryption using **Signal Protocol**
- No plaintext data on server

---

**Need help?** Check the main [README.md](../README.md) for full documentation.
