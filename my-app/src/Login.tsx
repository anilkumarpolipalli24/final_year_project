import { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./Login.css";

const API = "http://localhost:5000";

interface Props {
  expiredMessage?: string;
  onLogin: (token: string, role: string, name: string, userId: string) => void;
}

type Step = "credentials" | "otp" | "forgot" | "reset";

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin",  icon: "🔐", desc: "IT Department"          },
  { value: "ADMIN",       label: "Admin",         icon: "👔", desc: "Principal / Registrar"  },
  { value: "HOD",         label: "HOD",           icon: "🎓", desc: "Head of Department"     },
  { value: "FACULTY",     label: "Faculty",        icon: "📚", desc: "Teaching Staff"         },
  { value: "STUDENT",     label: "Student",        icon: "🎒", desc: "Student"                },
];

export default function Login({ expiredMessage, onLogin }: Props) {
  const [step,        setStep]       = useState<Step>("credentials");
  const [email,       setEmail]      = useState("");
  const [password,    setPassword]   = useState("");
  const [otp,         setOtp]        = useState("");
  const [forgotEmail, setForgotEmail]= useState("");
  const [resetOtp,    setResetOtp]   = useState("");
  const [newPwd,      setNewPwd]     = useState("");
  const [error,       setError]      = useState("");
  const [info,        setInfo]       = useState("");
  const [loading,     setLoading]    = useState(false);
  const [showPwd,     setShowPwd]    = useState(false);
  const [devOtp,      setDevOtp]     = useState("");
  const [otpBoxes,    setOtpBoxes]   = useState(["","","","","",""]);

  // Role dropdown state
  const [selectedRole,  setSelectedRole]  = useState(ROLES[4]); // Default: Student
  const [roleDropOpen,  setRoleDropOpen]  = useState(false);
  const roleDropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleDropRef.current && !roleDropRef.current.contains(e.target as Node)) {
        setRoleDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clear = () => { setError(""); setInfo(""); };

  const handleOtpBox = (val: string, i: number) => {
    const d = val.replace(/\D/g, "").slice(0, 1);
    const next = [...otpBoxes]; next[i] = d;
    setOtpBoxes(next);
    setOtp(next.join(""));
    if (d && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  const handleOtpKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Backspace" && !otpBoxes[i] && i > 0)
      document.getElementById(`otp-${i - 1}`)?.focus();
    if (e.key === "Enter") handleOTPVerify();
  };

  const pasteOtp = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      const boxes = text.split("");
      setOtpBoxes(boxes); setOtp(text);
      document.getElementById("otp-5")?.focus();
      e.preventDefault();
    }
  };

  const handleCredentials = async () => {
    if (!email || !password) { setError("Email and password required"); return; }
    clear(); setLoading(true);
    try {
      const r = await axios.post(`${API}/auth/login`, { email, password });
      setInfo(r.data.message);
      if (r.data._devOtp) setDevOtp(r.data._devOtp);
      setStep("otp");
    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed");
    } finally { setLoading(false); }
  };

  const handleOTPVerify = async () => {
    const fullOtp = otpBoxes.join("").trim() || otp.trim();
    if (fullOtp.length < 6) { setError("Enter the 6-digit OTP"); return; }
    clear(); setLoading(true);
    try {
      const r = await axios.post(`${API}/auth/verify-otp`, { email, otp: fullOtp });
      onLogin(r.data.token, r.data.role, r.data.name, String(r.data.userId));
    } catch (err: any) {
      setError(err.response?.data?.message || "Invalid OTP");
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    clear(); setLoading(true);
    try {
      const r = await axios.post(`${API}/auth/login`, { email, password });
      setInfo("New OTP sent! Check your inbox.");
      if (r.data._devOtp) setDevOtp(r.data._devOtp);
      setOtpBoxes(["","","","","",""]); setOtp("");
    } catch { setError("Could not resend OTP"); }
    finally { setLoading(false); }
  };

  const handleForgot = async () => {
    if (!forgotEmail) { setError("Enter your email"); return; }
    clear(); setLoading(true);
    try {
      const r = await axios.post(`${API}/auth/forgot-password`, { email: forgotEmail });
      setInfo(r.data.message); setStep("reset");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed");
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!resetOtp || !newPwd) { setError("OTP and new password required"); return; }
    clear(); setLoading(true);
    try {
      const r = await axios.post(`${API}/auth/reset-password`, { email: forgotEmail, otp: resetOtp, newPassword: newPwd });
      setInfo(r.data.message + " Redirecting to login…");
      setTimeout(() => { setStep("credentials"); setInfo(""); setForgotEmail(""); }, 2200);
    } catch (err: any) {
      setError(err.response?.data?.message || "Reset failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">

      {/* ═══ LEFT PANEL ═══ */}
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">🔐</div>
          <div>
            <div className="login-brand-name">BlockAudit</div>
            <div className="login-brand-sub">Document Integrity System</div>
          </div>
        </div>

        <div className="login-taglines">
          <div className="login-tagline">Immutable.</div>
          <div className="login-tagline accent">Verified.</div>
          <div className="login-tagline">Trusted.</div>
        </div>

        <div className="college-name-badge">
          Aditya College of Engineering &amp; Technology
        </div>

        <p className="login-desc">
          Blockchain-backed document integrity platform for academic institutions.
          Every certificate, mark sheet and record is cryptographically signed and
          permanently recorded on a tamper-proof distributed ledger.
        </p>

        <div className="login-features">
          <div className="login-feature"><span>⛓</span>ECDSA Blockchain</div>
          <div className="login-feature"><span>🔒</span>SHA-256 Hashing</div>
          <div className="login-feature"><span>📧</span>OTP Login</div>
          <div className="login-feature"><span>🌐</span>P2P Network</div>
          <div className="login-feature"><span>📱</span>SMS Alerts</div>
          <div className="login-feature"><span>🛡</span>Tamper Detection</div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className="login-right">
        <div className="login-card">

          {expiredMessage && (
            <div className="login-expired">⚠ {expiredMessage}</div>
          )}

          {/* ── STEP 1: CREDENTIALS ── */}
          {step === "credentials" && (<>
            <div className="login-step-badge">STEP 1 OF 2</div>
            <h2 className="login-title">Sign In</h2>
            <p className="login-subtitle">Enter your credentials to receive a secure login OTP</p>

            {/* Role Dropdown */}
            <div className="role-label">YOUR ROLE</div>
            <div className="role-select-wrapper" ref={roleDropRef}>
              <div
                className={`role-select-trigger ${roleDropOpen ? "open" : ""}`}
                onClick={() => setRoleDropOpen(v => !v)}
              >
                <span className="role-icon-lg">{selectedRole.icon}</span>
                <div className="role-info">
                  <div className="role-nm">{selectedRole.label}</div>
                  <div className="role-desc">{selectedRole.desc}</div>
                </div>
                <span className="role-chevron">▼</span>
              </div>

              {roleDropOpen && (
                <div className="role-dropdown-list">
                  {ROLES.map(r => (
                    <div
                      key={r.value}
                      className={`role-option ${selectedRole.value === r.value ? "selected" : ""}`}
                      onClick={() => { setSelectedRole(r); setRoleDropOpen(false); }}
                    >
                      <span className="role-opt-icon">{r.icon}</span>
                      <div className="role-opt-body">
                        <div className="role-opt-name">{r.label}</div>
                        <div className="role-opt-sub">{r.desc}</div>
                      </div>
                      {selectedRole.value === r.value && (
                        <span className="role-check">✔</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="login-form-group">
              <label>EMAIL ADDRESS</label>
              <div className="input-wrap">
                <span className="input-icon">✉</span>
                <input
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your-email@acet.edu.in"
                  onKeyDown={e => e.key === "Enter" && handleCredentials()}
                />
              </div>
            </div>

            <div className="login-form-group">
              <label>PASSWORD</label>
              <div className="input-wrap">
                <span className="input-icon">🔑</span>
                <input
                  type={showPwd ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  onKeyDown={e => e.key === "Enter" && handleCredentials()}
                />
                <button className="eye-btn" onClick={() => setShowPwd(v => !v)} type="button">
                  {showPwd ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {error && <div className="login-error">⚠ {error}</div>}

            <button className="login-btn" onClick={handleCredentials} disabled={loading}>
              {loading
                ? <><span className="spin">◌</span> Sending OTP…</>
                : <>Send OTP to Email →</>}
            </button>

            <button className="forgot-link" onClick={() => { setStep("forgot"); clear(); }}>
              Forgot password?
            </button>
          </>)}

          {/* ── STEP 2: OTP ── */}
          {step === "otp" && (<>
            <div className="login-step-badge">STEP 2 OF 2</div>
            <h2 className="login-title">Enter OTP</h2>
            <p className="login-subtitle">
              A 6-digit code was sent to<br/>
              <strong style={{ color: "#00e5ff" }}>{email}</strong>
            </p>

            {devOtp && (
              <div className="dev-otp-box">
                <span className="dev-label">🔧 DEV OTP</span>
                <span className="dev-val">{devOtp}</span>
              </div>
            )}

            {info && <div className="login-info">✔ {info}</div>}

            <div className="otp-boxes" onPaste={pasteOtp}>
              {otpBoxes.map((v, i) => (
                <input
                  key={i} id={`otp-${i}`}
                  type="text" inputMode="numeric" maxLength={1}
                  value={v}
                  onChange={e => handleOtpBox(e.target.value, i)}
                  onKeyDown={e => handleOtpKey(e, i)}
                  className={`otp-box ${v ? "filled" : ""}`}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {error && <div className="login-error">⚠ {error}</div>}

            <button className="login-btn" onClick={handleOTPVerify}
              disabled={loading || otpBoxes.join("").length < 6}>
              {loading
                ? <><span className="spin">◌</span> Verifying…</>
                : <>✔ Verify &amp; Sign In</>}
            </button>

            <div className="otp-footer">
              <button className="forgot-link" onClick={resendOtp} disabled={loading}>Resend OTP</button>
              <span>·</span>
              <button className="forgot-link" onClick={() => {
                setStep("credentials");
                setOtpBoxes(["","","","","",""]); setOtp(""); setDevOtp(""); clear();
              }}>← Change email</button>
            </div>
          </>)}

          {/* ── FORGOT PASSWORD ── */}
          {step === "forgot" && (<>
            <h2 className="login-title">Forgot Password</h2>
            <p className="login-subtitle">Enter your registered email to receive a reset OTP</p>

            <div className="login-form-group">
              <label>REGISTERED EMAIL</label>
              <div className="input-wrap">
                <span className="input-icon">✉</span>
                <input type="email" value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="your-email@acet.edu.in"
                  onKeyDown={e => e.key === "Enter" && handleForgot()}
                />
              </div>
            </div>

            {error && <div className="login-error">⚠ {error}</div>}
            {info  && <div className="login-info">✔ {info}</div>}

            <button className="login-btn" onClick={handleForgot} disabled={loading}>
              {loading ? <><span className="spin">◌</span> Sending…</> : "Send Reset OTP →"}
            </button>
            <button className="forgot-link" onClick={() => { setStep("credentials"); clear(); }}>
              ← Back to login
            </button>
          </>)}

          {/* ── RESET PASSWORD ── */}
          {step === "reset" && (<>
            <h2 className="login-title">Reset Password</h2>
            <p className="login-subtitle">OTP sent to <strong style={{ color: "#00e5ff" }}>{forgotEmail}</strong></p>

            {info && <div className="login-info">✔ {info}</div>}

            <div className="login-form-group">
              <label>RESET OTP</label>
              <input
                type="text" maxLength={6} value={resetOtp}
                onChange={e => setResetOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit OTP" className="otp-single"
              />
            </div>
            <div className="login-form-group">
              <label>NEW PASSWORD</label>
              <div className="input-wrap">
                <span className="input-icon">🔑</span>
                <input
                  type="password" value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Min 6 characters"
                  onKeyDown={e => e.key === "Enter" && handleReset()}
                />
              </div>
            </div>

            {error && <div className="login-error">⚠ {error}</div>}

            <button className="login-btn" onClick={handleReset} disabled={loading}>
              {loading ? <><span className="spin">◌</span> Resetting…</> : "Reset Password →"}
            </button>
            <button className="forgot-link" onClick={() => { setStep("credentials"); clear(); }}>
              ← Back to login
            </button>
          </>)}

          <div className="login-footer">
            <strong>Aditya College of Engineering &amp; Technology</strong><br />
            BlockAudit v3.0 · Powered by ECDSA Blockchain
          </div>
        </div>
      </div>
    </div>
  );
}