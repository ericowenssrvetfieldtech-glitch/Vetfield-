import { useState } from "react";
import { useAuth } from "./AuthContext";

const NAVY = "#0F2444";
const GOLD = "#C8960C";
const GREEN = "#2E7D32";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email || !password) { setError("Please fill in all fields"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);

    if (mode === "login") {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await signUp(email, password);
      if (err) setError(err);
      else setSuccess("Account created! You can now use the app.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "36px 28px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 12px",
            background: `linear-gradient(135deg, ${GREEN}, #1B6B20)`,
            borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 20px ${GREEN}40`,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="18" r="3"/>
              <path d="M12 15V4"/>
              <path d="M12 4l5 3"/>
            </svg>
          </div>
          <h1 style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 26,
            color: "#fff", margin: 0, letterSpacing: 1,
          }}>VetField</h1>
          <p style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
            color: "#9CA3AF", margin: "4px 0 0",
          }}>SmartCart Golf Tracker</p>
        </div>

        {/* Tab switch */}
        <div style={{
          display: "flex", borderRadius: 8, overflow: "hidden",
          border: `1px solid ${NAVY}`, marginBottom: 20,
        }}>
          {(["login", "signup"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }}
              style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
                letterSpacing: 1, textTransform: "uppercase",
                background: mode === m ? NAVY : "transparent",
                color: mode === m ? GOLD : "#6B7280",
                transition: "all 0.15s",
              }}>
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#9CA3AF", marginBottom: 5, letterSpacing: 1 }}>EMAIL</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)",
                color: "#fff", fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#9CA3AF", marginBottom: 5, letterSpacing: 1 }}>PASSWORD</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)",
                color: "#fff", fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: "8px 12px", borderRadius: 6,
              background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
              color: "#F87171", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
            }}>{error}</div>
          )}

          {success && (
            <div style={{
              padding: "8px 12px", borderRadius: 6,
              background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.3)",
              color: "#4CAF50", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
            }}>{success}</div>
          )}

          <button type="submit" disabled={loading}
            style={{
              width: "100%", padding: "13px 20px", borderRadius: 10,
              border: "none", cursor: loading ? "wait" : "pointer",
              fontSize: 15, fontWeight: 700, letterSpacing: 2,
              fontFamily: "'Rajdhani', sans-serif",
              background: mode === "login"
                ? `linear-gradient(135deg, ${GREEN} 0%, #1B6B20 100%)`
                : `linear-gradient(135deg, ${GOLD} 0%, #9A7200 100%)`,
              color: "#fff", opacity: loading ? 0.7 : 1,
              boxShadow: mode === "login" ? `0 4px 16px ${GREEN}50` : `0 4px 16px ${GOLD}50`,
              transition: "transform 0.1s, opacity 0.2s", marginTop: 4,
            }}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}>
            {loading ? "PLEASE WAIT..." : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
        </form>

        <p style={{
          textAlign: "center", marginTop: 20, fontSize: 11,
          color: "#6B7280", fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setSuccess(null); }}
            style={{ background: "none", border: "none", color: GOLD, cursor: "pointer", fontSize: 11, fontFamily: "inherit", textDecoration: "underline" }}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
