import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const hasFirebaseConfig = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId);
const app = hasFirebaseConfig
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;
export const auth = app ? getAuth(app) : null;

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.appdata');

let isSigningIn = false;

export const initAuth = (onAuthChange: (user: User | null) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, (user) => {
    if (!isSigningIn) onAuthChange(user);
  });
};

export const googleSignIn = async (forceSelectAccount = false) => {
  if (!auth) {
    throw new Error('Firebase Auth is not configured. Please use BYOK mode with your Google OAuth Client ID.');
  }
  try {
    isSigningIn = true;
    if (forceSelectAccount) {
      provider.setCustomParameters({ prompt: 'consent select_account' });
    } else {
      provider.setCustomParameters({ prompt: 'consent' });
    }
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token');
    }
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  if (auth) {
    await auth.signOut();
  }
};
