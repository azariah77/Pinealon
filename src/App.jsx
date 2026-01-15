import { useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  linkWithCredential,
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  fetchSignInMethodsForEmail,
  sendEmailVerification,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import MainApp from "./pages/MainApp";

// Orbitron font
const link = document.createElement("link");
link.href =
  "https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap";
link.rel = "stylesheet";
document.head.appendChild(link);

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAWJLzA4Zg-itau3I_Sc76YIgFNbj-uxCI",
  authDomain: "pinealon.firebaseapp.com",
  projectId: "pinealon",
  storageBucket: "pinealon.appspot.com",
  messagingSenderId: "494066441237",
  appId: "1:494066441237:web:d3d4ccb4858ebdc72e821c",
  measurementId: "G-R1QXMTEWJ8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export default function App() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true); // 🔥 NEW: auth init loading
  const [error, setError] = useState("");
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);

  // Account linking states
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [linkingEmail, setLinkingEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        console.log("Logged in:", u.email);
        setError("");
        setEmailVerificationSent(false);
      }
      setLoadingAuth(false); // 🔥 auth check finished
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    setEmailVerificationSent(false);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!pass.trim()) {
      setError("Password is required");
      return;
    }

    if (isSignup) {
      if (pass !== confirmPass) {
        setError("Passwords do not match");
        return;
      }
      if (pass.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      setLoading(true);
      try {
        console.log("Creating account for:", email);
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);

        await sendEmailVerification(userCred.user);
        setEmailVerificationSent(true);
        console.log("Verification email sent to:", userCred.user.email);
        setError("Account created! Please check your email inbox (and spam folder) to verify your account. You'll need to verify before you can log in.");

        await setDoc(doc(db, "users", userCred.user.uid), {
          uid: userCred.user.uid,
          email: userCred.user.email,
          createdAt: serverTimestamp(),
          providers: ["password"],
          lastLogin: serverTimestamp()
        });

        console.log("Account created successfully");
      } catch (e) {
        console.error("Signup error:", e);
        if (e.code === "auth/email-already-in-use") {
          setError("This email is already registered. Please sign in instead.");
          setIsSignup(false);
        } else if (e.code === "auth/invalid-email") {
          setError("Invalid email address");
        } else if (e.code === "auth/weak-password") {
          setError("Password is too weak. Must be at least 6 characters.");
        } else {
          setError("Signup failed: " + e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        console.log("Signing in with:", email);
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);

        if (!userCredential.user.emailVerified) {
          setError("Please verify your email address before logging in. A verification link has been sent to your inbox. You can request a new one after attempting to sign in again if needed.");
          await signOut(auth);
          setLoading(false);
          return;
        }

        await setDoc(
          doc(db, "users", userCredential.user.uid),
          {
            lastLogin: serverTimestamp(),
            providers: arrayUnion("password")
          },
          { merge: true }
        );

        console.log("Sign in successful");
        setError("");
      } catch (e) {
        console.error("Sign in error:", e);
        if (e.code === "auth/user-not-found") {
          setError("No account found with this email. Please sign up first.");
        } else if (e.code === "auth/wrong-password") {
          setError("Incorrect password. Please try again.");
        } else if (e.code === "auth/invalid-email") {
          setError("Invalid email address");
        } else if (e.code === "auth/invalid-credential") {
          setError("Invalid email or password. Please check your credentials.");
        } else if (e.code === "auth/too-many-requests") {
          setError("Too many failed attempts. Please try again later.");
        } else {
          setError("Sign in failed: " + e.message);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAccountLinking = async (e) => {
    e?.preventDefault();
    if (!linkPassword.trim()) {
      setError("Password is required to link accounts");
      return;
    }

    setLoading(true);
    try {
      console.log("Linking accounts for:", linkingEmail);

      const emailUserCred = await signInWithEmailAndPassword(auth, linkingEmail, linkPassword);
      console.log("Email/password sign-in successful");

      if (pendingGoogleCredential) {
        await linkWithCredential(emailUserCred.user, pendingGoogleCredential);
        console.log("Google credential linked successfully!");

        await setDoc(
          doc(db, "users", emailUserCred.user.uid),
          {
            providers: arrayUnion("google.com"),
            lastLogin: serverTimestamp()
          },
          { merge: true }
        );

        console.log("Firestore updated with both providers");
      }

      setShowLinkPrompt(false);
      setPendingGoogleCredential(null);
      setLinkingEmail("");
      setLinkPassword("");
      setError("");

    } catch (linkError) {
      console.error("Linking error:", linkError);
      if (linkError.code === 'auth/wrong-password') {
        setError("Incorrect password. Please try again.");
      } else if (linkError.code === 'auth/invalid-credential') {
        setError("Invalid password. Please check your credentials.");
      } else if (linkError.code === 'auth/credential-already-in-use') {
        setError("This Google account is already linked to another user.");
      } else {
        setError("Failed to link accounts: " + linkError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelLinking = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.log("Sign out error:", e);
    }
    setShowLinkPrompt(false);
    setPendingGoogleCredential(null);
    setLinkingEmail("");
    setLinkPassword("");
    setError("");
  };

  const checkEmailExists = async (email) => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      return methods;
    } catch (error) {
      console.log("Could not check email methods:", error);
      return [];
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError("");

    try {
      console.log("Starting Google sign-in...");

      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const googleEmail = user.email;

      console.log("Google sign-in completed for:", googleEmail);

      const isNewUser = result.additionalUserInfo?.isNewUser || false;

      if (isNewUser) {
        console.log("Creating new Google user");
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          providers: ["google.com"],
          lastLogin: serverTimestamp()
        });
      } else {
        console.log("Updating existing user");
        await setDoc(
          doc(db, "users", user.uid),
          {
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: serverTimestamp(),
            providers: arrayUnion("google.com")
          },
          { merge: true }
        );
      }

      setError("");

    } catch (error) {
      console.error("Google sign-in error:", error);

      if (error.code === "auth/account-exists-with-different-credential") {
        const googleEmail = error.customData?.email;
        const pendingCred = GoogleAuthProvider.credentialFromError(error);

        if (googleEmail && pendingCred) {
          const signInMethods = await fetchSignInMethodsForEmail(auth, googleEmail);

          if (signInMethods.includes("password")) {
            setLinkingEmail(googleEmail);
            setPendingGoogleCredential(pendingCred);
            setShowLinkPrompt(true);
            setError("");
          } else {
            setError(`An account already exists with the email ${googleEmail} but with a different sign-in method.`);
          }
        } else {
          setError("Account exists with different credential, but email could not be retrieved.");
        }
      } else if (error.code === "auth/popup-closed-by-user") {
        setError("Google sign-in was cancelled");
      } else if (error.code === "auth/popup-blocked") {
        setError("Popup blocked. Please allow popups for this site.");
      } else if (error.code === "auth/cancelled-popup-request") {
        console.log("User cancelled");
        setError("");
      } else {
        setError("Google sign-in failed: " + error.message);
      }

      try {
        if (auth.currentUser) {
          await signOut(auth);
        }
      } catch (signOutError) {
        console.log("Sign out error:", signOutError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    if (email.trim()) {
      const methods = await checkEmailExists(email);
      if (methods.includes("password")) {
        setError(`This email (${email}) already has an account with email/password. Please sign in with email/password first, then you can link Google. Or, if it's a new account, clear the email field to sign up with Google.`);
        return;
      }
    }

    handleGoogle();
  };

  // 🔥 NEW: Loading animation screen
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#202023]">
        <motion.h1
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 1, 0], scale: [0.8, 1, 0.8] }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="text-5xl font-bold text-[#4263eb] drop-shadow-[0_0_20px_#4263eb80]"
          style={{ fontFamily: "Orbitron, sans-serif" }}
        >
          PINEALON
        </motion.h1>
      </div>
    );
  }

  // If logged in → show MainApp
  if (user && !showLinkPrompt) {
    return <MainApp auth={auth} signOut={signOut} />;
  }

  // Email verification sent screen
  if (emailVerificationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#151515] to-[#202023]">
        <div className="w-full max-w-sm space-y-5 p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl text-white text-center">
          <AlertCircle size={48} className="text-yellow-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-yellow-200">Email Verification Sent!</h1>
          <p className="text-gray-300">
            A verification link has been sent to <span className="font-semibold">{email}</span>.
            Please check your inbox (and spam folder) and click the link to verify your account.
          </p>
          <p className="text-gray-400 text-sm">
            You will need to verify your email before you can log in with your email and password.
          </p>
          <button
            onClick={() => {
              setEmailVerificationSent(false);
              setIsSignup(false);
              setError("");
            }}
            className="mt-6 py-2 px-4 rounded-md bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Show account linking prompt
  if (showLinkPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#151515] to-[#202023]">
        <div className="w-full max-w-sm space-y-5 p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl text-white">
          <motion.h1
            initial={{ letterSpacing: "0.5em", opacity: 0 }}
            animate={{ letterSpacing: "0em", opacity: 1 }}
            transition={{ duration: 1.1 }}
            style={{ fontFamily: "Orbitron, sans-serif" }}
            className="text-center text-3xl font-bold text-[#4263eb] drop-shadow-[0_0_6px_#4263eb60]"
          >
            PINEALON
          </motion.h1>

          <div className="bg-blue-500/20 border border-blue-500/50 rounded-md p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-200 mb-2">Link Your Accounts</h3>
                <p className="text-blue-200/80 mb-3">
                  This email ({linkingEmail}) already has an account with email/password.
                  Enter your password to link it with Google sign-in.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-md p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleAccountLinking} className="space-y-4">
            <div className="flex items-center bg-[#2c2c2e] rounded-md px-3 py-2 gap-2">
              <Mail size={18} className="text-gray-400 shrink-0" />
              <input
                type="email"
                value={linkingEmail}
                className="bg-transparent w-full text-sm text-gray-300 focus:outline-none"
                disabled
              />
            </div>

            <div className="flex items-center bg-[#2c2c2e] rounded-md px-3 py-2 gap-2">
              <Lock size={18} className="text-gray-400 shrink-0" />
              <input
                type="password"
                placeholder="Enter your password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                className="bg-transparent w-full text-sm placeholder-gray-400 focus:outline-none"
                disabled={loading}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-md bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
              >
                {loading ? "Linking..." : "Link Accounts"}
              </button>

              <button
                type="button"
                onClick={cancelLinking}
                disabled={loading}
                className="w-full py-2 rounded-md border border-gray-500 hover:border-gray-400 disabled:border-gray-700 disabled:cursor-not-allowed text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Show normal login/signup
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#151515] to-[#202023]">
      <div className="w-full max-w-sm space-y-5 p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl text-white">
        <motion.h1
          initial={{ letterSpacing: "0.5em", opacity: 0 }}
          animate={{ letterSpacing: "0em", opacity: 1 }}
          transition={{ duration: 1.1 }}
          style={{ fontFamily: "Orbitron, sans-serif" }}
          className="text-center text-3xl font-bold text-[#4263eb] drop-shadow-[0_0_6px_#4263eb60]"
        >
          PINEALON
        </motion.h1>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-md p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center bg-[#2c2c2e] rounded-md px-3 py-2 gap-2">
            <Mail size={18} className="text-gray-400 shrink-0" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-transparent w-full text-sm placeholder-gray-400 focus:outline-none"
              disabled={loading}
              required
            />
          </div>

          <div className="flex items-center bg-[#2c2c2e] rounded-md px-3 py-2 gap-2">
            <Lock size={18} className="text-gray-400 shrink-0" />
            <input
              type="password"
              placeholder="Password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="bg-transparent w-full text-sm placeholder-gray-400 focus:outline-none"
              disabled={loading}
              required
            />
          </div>

          {isSignup && (
            <div className="flex items-center bg-[#2c2c2e] rounded-md px-3 py-2 gap-2">
              <Lock size={18} className="text-gray-400 shrink-0" />
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="bg-transparent w-full text-sm placeholder-gray-400 focus:outline-none"
                disabled={loading}
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
          >
            {loading ? "Processing..." : isSignup ? "Sign Up" : "Log In"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center px-2">
          By {isSignup ? "signing up" : "logging in"} you agree to&nbsp;
          <a href="/terms" className="underline text-blue-400 hover:text-blue-300">
            Terms of Use
          </a>{" "}
          &nbsp;and&nbsp;
          <a href="/privacy" className="underline text-blue-400 hover:text-blue-300">
            Privacy Policy
          </a>.
        </p>

        <div className="flex justify-between text-xs text-gray-400">
          {isSignup ? (
            <button
              type="button"
              onClick={() => {
                setIsSignup(false);
                setError("");
                setEmailVerificationSent(false);
              }}
              className="hover:underline disabled:opacity-50"
              disabled={loading}
            >
              Already have an account?
            </button>
          ) : (
            <>
              <button
                type="button"
                className="hover:underline disabled:opacity-50"
                disabled={loading}
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignup(true);
                  setError("");
                  setEmailVerificationSent(false);
                }}
                className="hover:underline disabled:opacity-50"
                disabled={loading}
              >
                Sign up
              </button>
            </>
          )}
        </div>

        {!isSignup && (
          <>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <div className="h-px bg-gray-600 w-full" />
              <span>OR</span>
              <div className="h-px bg-gray-600 w-full" />
            </div>

            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2 border border-gray-500 hover:border-gray-400 disabled:border-gray-700 disabled:opacity-50 rounded-md text-sm transition-colors"
            >
              <img
                src="https://www.svgrepo.com/show/475656/google-color.svg"
                alt="google"
                className="h-5 w-5"
              />
              {loading ? "Processing..." : "Log in with Google"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}