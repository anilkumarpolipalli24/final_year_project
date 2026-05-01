import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import "./App.css";
import Login from "./Login";

const API = import.meta.env.VITE_API_URL;
const H   = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

function parseJwt(t: string): { exp?: number } {
  try { return JSON.parse(atob(t.split(".")[1])); } catch { return {}; }
}

type Tab = "dashboard"|"chain"|"records"|"verifications"|"tamper"|"network"|"auditlogs"|"upload"|"users";

export default function App() {
  // ── Auth
  const [token,    setToken]    = useState<string|null>(null);
  const [role,     setRole]     = useState<string|null>(null);
  const [userName, setUserName] = useState<string|null>(null);
  const [userId,   setUserId]   = useState<string|null>(null);
  const [expMsg,   setExpMsg]   = useState("");
  const [sessWarn, setSessWarn] = useState(false);
  const expiryRef = useRef<any>(null);
  const warnRef   = useRef<any>(null);

  // ── UI state
  const [tab,     setTab]    = useState<Tab>("dashboard");
  const [busy,    setBusy]   = useState(false);
  const [loading, setLoading]= useState(false);

  // ── Dashboard
  const [stats,      setStats]     = useState<any>(null);
  const [recentDocs, setRecentDocs]= useState<any[]>([]);
  const [recentAct,  setRecentAct] = useState<any[]>([]);
  const [nodeInfo,   setNodeInfo]  = useState<any>(null);

  // ── Chain page
  const [chain,        setChain]       = useState<any[]>([]);
  const [chainLoading, setChainLoading]= useState(false);
  const [selectedBlock,setSelectedBlock]=useState<any>(null);
  const [integrityRes, setIntegrityRes]= useState<any>(null);

  // ── Records page
  const [documents, setDocuments]= useState<any[]>([]);
  const [docTotal,  setDocTotal] = useState(0);
  const [docPage,   setDocPage]  = useState(1);
  const [docFilter, setDocFilter]= useState({ docType:"", department:"", status:"" });
  const [selectedDoc, setSelectedDoc]= useState<any>(null);

  // ── Verifications page
  const [verifs,     setVerifs]    = useState<any[]>([]);
  const [verifTotal, setVerifTotal]= useState(0);
  const [verifPage,  setVerifPage] = useState(1);

  // ── Tamper page
  const [tampers, setTampers]= useState<any[]>([]);

  // ── Network
  const [netInfo,    setNetInfo]   = useState<any>(null);
  const [peerInput,  setPeerInput] = useState("");
  const [peerMsg,    setPeerMsg]   = useState("");

  // ── Audit logs
  const [auditLogs,  setAuditLogs]  = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage,  setAuditPage]  = useState(1);
  const [auditSearch,setAuditSearch]= useState("");

  // ── Upload
  const [uploadFile, setUploadFile]= useState<File|null>(null);
  const [uploadForm, setUploadForm]= useState({ title:"",docType:"",department:"",semester:"",academicYear:"",rollNumber:"",studentEmail:"" });
  const [uploadResult,setUploadResult]=useState<any>(null);
  const [verifyFile, setVerifyFile]= useState<File|null>(null);
  const [verifyResult,setVerifyResult]=useState<any>(null);

  // ── Users
  const [users,   setUsers]  = useState<any[]>([]);
  const [userForm,setUserForm]=useState({ name:"",email:"",password:"",role:"STUDENT",department:"",phone:"",studentId:"",designation:"" });
  const [userMsg, setUserMsg]= useState("");

  // ════ SESSION ════
  const clearTimers = () => { clearTimeout(expiryRef.current); clearTimeout(warnRef.current); };
  const resetState  = useCallback((msg="") => {
    clearTimers(); setToken(null); setRole(null); setUserName(null); setUserId(null);
    setStats(null); setSessWarn(false); if (msg) setExpMsg(msg);
  }, []);

  useEffect(() => {
    if (!token) return; clearTimers(); setSessWarn(false);
    const { exp } = parseJwt(token);
    if (!exp) return;
    const ms = exp * 1000 - Date.now();
    if (ms <= 0) { resetState("Session expired. Please log in again."); return; }
    const warnMs = ms - 5*60*1000;
    if (warnMs > 0) warnRef.current = setTimeout(() => setSessWarn(true), warnMs);
    else setSessWarn(true);
    expiryRef.current = setTimeout(() => resetState("Session expired. Please log in again."), ms);
    return () => clearTimers();
  }, [token, resetState]);

  useEffect(() => {
    const id = axios.interceptors.response.use(r => r, err => {
      if (err.response?.status === 401 && token) resetState("Session invalid. Please log in again.");
      return Promise.reject(err);
    });
    return () => axios.interceptors.response.eject(id);
  }, [token, resetState]);

  // ════ FETCHERS ════
  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const [s, n] = await Promise.all([
        axios.get(`${API}/stats`, H(token)),
        axios.get(`${API}/nodeinfo`, H(token)).catch(() => ({ data: null })),
      ]);
      setStats(s.data);
      setRecentDocs(s.data.recentDocs || []);
      setRecentAct(s.data.recentActivity || []);
      setNodeInfo(n.data);
    } catch {}
  }, [token]);

  const fetchChain = useCallback(async () => {
    if (!token) return; setChainLoading(true);
    try { const r = await axios.get(`${API}/chain`, H(token)); setChain(r.data.chain || []); }
    catch {} finally { setChainLoading(false); }
  }, [token]);

  const fetchDocuments = useCallback(async (page=1) => {
    if (!token) return;
    try {
      const p = new URLSearchParams({ page: String(page), limit:"20", ...docFilter });
      const r = await axios.get(`${API}/documents?${p}`, H(token));
      setDocuments(r.data.documents || []); setDocTotal(r.data.total||0); setDocPage(page);
    } catch {}
  }, [token, docFilter]);

  const fetchVerifications = useCallback(async (page=1) => {
    if (!token) return;
    try {
      const r = await axios.get(`${API}/verifications?page=${page}&limit=20`, H(token));
      setVerifs(r.data.verifications||[]); setVerifTotal(r.data.total||0); setVerifPage(page);
    } catch {}
  }, [token]);

  const fetchTampers = useCallback(async () => {
    if (!token) return;
    try { const r = await axios.get(`${API}/tamper-alerts`, H(token)); setTampers(r.data.alerts||[]); }
    catch {}
  }, [token]);

  const fetchNetwork = useCallback(async () => {
    if (!token) return;
    try { const r = await axios.get(`${API}/network`, H(token)); setNetInfo(r.data); }
    catch {}
  }, [token]);

  const fetchAudit = useCallback(async (page=1) => {
    if (!token) return;
    try {
      const p = new URLSearchParams({ page: String(page), limit:"25", username: auditSearch });
      const r = await axios.get(`${API}/auditlogs?${p}`, H(token));
      setAuditLogs(r.data.logs||[]); setAuditTotal(r.data.total||0); setAuditPage(page);
    } catch {}
  }, [token, auditSearch]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try { const r = await axios.get(`${API}/users`, H(token)); setUsers(r.data.users||[]); }
    catch {}
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab==="dashboard")     { fetchStats(); }
    if (tab==="chain")         { fetchChain(); }
    if (tab==="records")       { fetchDocuments(1); }
    if (tab==="verifications") { fetchVerifications(1); }
    if (tab==="tamper")        { fetchTampers(); }
    if (tab==="network")       { fetchNetwork(); }
    if (tab==="auditlogs")     { fetchAudit(1); }
    if (tab==="users")         { fetchUsers(); }
  }, [tab, token]);

  useEffect(() => { if (token) fetchStats(); }, [token]);

  // ════ ACTIONS ════
  const logout = () => { setLoading(true); setTimeout(() => { resetState(); setLoading(false); }, 500); };

  const checkIntegrity = async () => {
    if (!token) return; setBusy(true); setIntegrityRes(null);
    try { const r = await axios.get(`${API}/validateChain`, H(token)); setIntegrityRes(r.data); fetchStats(); }
    catch (e:any) { setIntegrityRes({ status:"ERROR", message: e.message }); }
    finally { setBusy(false); }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadForm.title || !uploadForm.docType) { alert("File, title, and type required"); return; }
    setBusy(true); setUploadResult(null);
    try {
      const fd = new FormData(); fd.append("file", uploadFile);
      Object.entries(uploadForm).forEach(([k,v]) => { if (v) fd.append(k,v); });
      const r = await axios.post(`${API}/upload`, fd, H(token!));
      setUploadResult({ ok:true, ...r.data }); fetchStats();
    } catch(e:any) { setUploadResult({ ok:false, message: e.response?.data?.message||"Upload failed" }); }
    finally { setBusy(false); }
  };

  const handleVerify = async () => {
    if (!verifyFile) { alert("Select a file"); return; }
    setBusy(true); setVerifyResult(null);
    try {
      const fd = new FormData(); fd.append("file", verifyFile);
      const r = await axios.post(`${API}/verify`, fd, H(token!));
      setVerifyResult(r.data);
    } catch(e:any) { setVerifyResult({ status:"ERROR", message: e.response?.data?.message||"Failed" }); }
    finally { setBusy(false); }
  };

  const handleAddPeer = async () => {
    if (!peerInput.trim()) return; setBusy(true);
    try { const r = await axios.post(`${API}/network/add-peer`, { url: peerInput }, H(token!)); setPeerMsg(r.data.message); fetchNetwork(); }
    catch(e:any) { setPeerMsg(e.response?.data?.message||"Failed"); }
    finally { setBusy(false); }
  };

  const handleCreateUser = async () => {
    if (!userForm.name||!userForm.email||!userForm.password) { setUserMsg("Name, email, password required"); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API}/users/create`, userForm, H(token!));
      setUserMsg("✅ " + r.data.message);
      setUserForm({ name:"",email:"",password:"",role:"STUDENT",department:"",phone:"",studentId:"",designation:"" });
      fetchUsers();
    } catch(e:any) { setUserMsg("❌ " + (e.response?.data?.message||"Failed")); }
    finally { setBusy(false); }
  };

  // ════ HELPERS ════
  const roleColor = (r:string) => ({SUPER_ADMIN:"#ff3d5a",ADMIN:"#00c8ff",HOD:"#a78bfa",FACULTY:"#00e090",STUDENT:"#ffaa00"}[r]||"#5a7394");
  const canAdmin  = role && ["SUPER_ADMIN","ADMIN"].includes(role);
  const canUpload = role && ["SUPER_ADMIN","ADMIN","HOD","FACULTY"].includes(role);
  const creatable = {SUPER_ADMIN:["ADMIN","HOD","FACULTY","STUDENT"],ADMIN:["HOD","FACULTY","STUDENT"],HOD:["FACULTY","STUDENT"],FACULTY:["STUDENT"],STUDENT:[]}[role||""] || [];
  const docTypes  = ["Degree Certificate","Provisional Certificate","Bonafide Certificate","Migration Certificate","Mark Sheet","Transcript","Fee Receipt","Admission Letter","Transfer Certificate","Scholarship Letter","Research Paper","Thesis / Dissertation","Attendance Record","ID Card","Other"];
  const depts     = ["CSE","ECE","EEE","MECH","CIVIL","MBA","MCA","Administration","IT"];

  const go = (t: Tab) => setTab(t);
  const fmt = (d:string) => new Date(d).toLocaleString("en-IN",{dateStyle:"short",timeStyle:"short"});

  // ════ NOT LOGGED IN ════
  if (!token) {
    return <Login expiredMessage={expMsg}
      onLogin={(t,r,n,uid) => { setExpMsg(""); setLoading(true); setTimeout(()=>{ setToken(t); setRole(r); setUserName(n); setUserId(uid); setLoading(false); },700); }} />;
  }

  return (
    <div className="layout">
      {busy && <div className="progress-bar"/>}

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🔐</span>
          <div>
            <div className="brand-name">BlockAudit</div>
            <div className="brand-sub">UNIVERSITY</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {([
            { key:"dashboard",     icon:"◈",  label:"Dashboard"      },
            { key:"chain",         icon:"⛓",  label:"Ledger"         },
            { key:"records",       icon:"📁",  label:"Records"        },
            { key:"verifications", icon:"✔",  label:"Verifications"  },
            { key:"upload",        icon:"⬆",  label:"Upload / Verify"},
            { key:"network",       icon:"🌐", label:"Network"        },
            ...(canAdmin ? [{ key:"tamper",   icon:"🚨", label:"Tamper Alerts" }] : []),
            ...(canAdmin ? [{ key:"auditlogs",icon:"📋", label:"Audit Trail"   }] : []),
            ...(canAdmin ? [{ key:"users",    icon:"👥", label:"Users"         }] : []),
          ] as any[]).map(item => (
            <button key={item.key} className={`nav-item ${tab===item.key?"active":""}`}
              onClick={() => go(item.key)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key==="tamper" && stats?.tamperCount > 0 &&
                <span className="nav-badge">{stats.tamperCount}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="node-chip">
            <span className="peer-dot"></span>
            <span>{stats?.peerCount||0} peers · {stats?.chainBlocks||0} blocks</span>
          </div>
          <div className="user-info-row">
            <div className="user-av">{userName?.[0]?.toUpperCase()}</div>
            <div className="user-meta">
              <div className="user-nm">{userName}</div>
              <div className="user-rl" style={{ color: roleColor(role!) }}>{role}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main">
        {sessWarn && (
          <div className="sess-banner">
            ⚠ Session expires in &lt;5 min.
            <button onClick={logout}>Re-login</button>
            <button onClick={() => setSessWarn(false)}>✕</button>
          </div>
        )}

        {/* ═══════════ DASHBOARD ═══════════ */}
        {tab === "dashboard" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>Dashboard</h1><p>Real-time blockchain status · Sri Vasavi Engineering College</p></div>
              <button className="btn btn-ghost btn-sm" onClick={fetchStats}>↺ Refresh</button>
            </div>

            {/* STAT CARDS — all 6 clickable */}
            <div className="stats-grid">
              {[
                { icon:"⛓",  val:stats?.chainBlocks??"—",  label:"Chain Blocks",   nav:"chain",         col:"cyan",  desc:"View full ledger"          },
                { icon:"📁",  val:stats?.recordsFiled??stats?.totalUploads??"—", label:"Records Filed",  nav:"records",       col:"green", desc:"Browse all documents"      },
                { icon:"✔",  val:stats?.totalVerify??"—",  label:"Verifications",  nav:"verifications", col:"blue",  desc:"Verification history"      },
                { icon:"🚨", val:stats?.tamperCount??"—",  label:"Tamper Alerts",  nav:"tamper",        col: stats?.tamperCount>0?"red":"muted", desc:"Integrity violations" },
                { icon:"🌐", val:stats?.peerCount??"—",    label:"Network Peers",  nav:"network",       col:"cyan",  desc:"P2P network status"        },
                { icon:"🛡",  val:stats?.chainStatus??"—", label:"Chain Status",   nav:"chain",         col: stats?.chainStatus==="SECURE"?"green":"red", desc:"Click to validate" },
              ].map(c => (
                <div key={c.label} className={`stat-card clickable accent-${c.col}`}
                  onClick={() => go(c.nav as Tab)} title={c.desc}>
                  <div className="stat-icon">{c.icon}</div>
                  <div className={`stat-val col-${c.col}`}>{c.val}</div>
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-hint">{c.desc} →</div>
                </div>
              ))}
            </div>

            {/* Node identity */}
            {nodeInfo && (
              <div className="card">
                <div className="card-lbl">🔑 NODE IDENTITY · ECDSA SECP256K1</div>
                <div className="detail-grid">
                  {[
                    ["Node ID",    nodeInfo.nodeId],
                    ["Algorithm",  nodeInfo.algorithm],
                    ["Chain",      `${nodeInfo.chainLength} blocks`],
                    ["Network",    nodeInfo.myUrl],
                    ["Uptime",     nodeInfo.uptime],
                    ["Node.js",    nodeInfo.nodeVersion],
                  ].map(([k,v]) => (
                    <div key={k} className="drow">
                      <span className="dk">{k}</span>
                      <span className="dv mono">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two-col: recent docs + activity */}
            <div className="two-col">
              <div className="card">
                <div className="card-lbl">📁 RECENT DOCUMENTS</div>
                {recentDocs.length===0 ? <div className="empty">No documents yet</div> :
                  recentDocs.map((d:any) => (
                    <div key={d._id} className="list-row clickable"
                      onClick={() => { setSelectedDoc(d); go("records"); }}>
                      <div className="li-icon">📄</div>
                      <div className="li-body">
                        <div className="li-title">{d.title||d.fileName}</div>
                        <div className="li-sub">{d.docType} · {d.department||"—"} · {d.uploadedBy?.name||"—"}</div>
                      </div>
                      <div className={`sdot ${d.status==="ACTIVE"?"green":"red"}`}></div>
                    </div>
                  ))}
                <button className="btn-link" onClick={() => go("records")}>View all records →</button>
              </div>

              <div className="card">
                <div className="card-lbl">📋 RECENT ACTIVITY</div>
                {recentAct.length===0 ? <div className="empty">No activity yet</div> :
                  recentAct.map((a:any,i:number) => (
                    <div key={i} className="list-row">
                      <div className={`act-dot act-${a.action?.toLowerCase()}`}></div>
                      <div className="li-body">
                        <div className="li-title">{a.action} · {a.username||"—"}</div>
                        <div className="li-sub">{fmt(a.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                <button className="btn-link" onClick={() => go("auditlogs")}>Full audit trail →</button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="quick-row">
              {canAdmin && <button className="btn btn-danger" onClick={checkIntegrity} disabled={busy}>🛡 Check Integrity</button>}
              <button className="btn btn-ghost" onClick={() => go("chain")}>⛓ View Ledger</button>
              <button className="btn btn-ghost" onClick={() => go("upload")}>⬆ Upload Doc</button>
            </div>

            {integrityRes && (
              <div className={`integrity-box ${integrityRes.status==="SECURE"?"secure":"tampered"}`}>
                <span className="int-icon">{integrityRes.status==="SECURE"?"🛡":"⚠"}</span>
                <div>
                  <div className="int-title">{integrityRes.status==="SECURE"?"Blockchain SECURE":"TAMPER DETECTED"}</div>
                  <div className="int-msg">{integrityRes.message}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ CHAIN / LEDGER ═══════════ */}
        {tab === "chain" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>Blockchain Ledger</h1><p>{chain.length} blocks · click any row for full details</p></div>
              <div style={{display:"flex",gap:10}}>
                {canAdmin && <button className="btn btn-danger btn-sm" onClick={checkIntegrity} disabled={busy}>🛡 Validate Chain</button>}
                <button className="btn btn-ghost btn-sm" onClick={fetchChain}>{chainLoading?"Loading…":"↺ Refresh"}</button>
              </div>
            </div>

            {integrityRes && (
              <div className={`integrity-box ${integrityRes.status==="SECURE"?"secure":"tampered"}`} style={{marginBottom:16}}>
                <span className="int-icon">{integrityRes.status==="SECURE"?"🛡":"⚠"}</span>
                <div><div className="int-title">{integrityRes.status}</div><div className="int-msg">{integrityRes.message}</div></div>
              </div>
            )}

            <div className="card" style={{padding:0}}>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>#</th><th>Document / Data</th><th>Type</th><th>Dept</th>
                    <th>Uploaded By</th><th>File Hash</th><th>Block Hash</th><th>Timestamp</th><th>Sig</th>
                  </tr></thead>
                  <tbody>
                    {chain.map((b:any) => (
                      <tr key={b.index} className="clickable-row" onClick={() => setSelectedBlock(b)}>
                        <td className="mono">#{b.index}</td>
                        <td><strong>{b.document?.title||b.data?.title||(b.index===0?"Genesis Block":"—")}</strong></td>
                        <td><span className="tag">{b.document?.docType||b.data?.docType||"—"}</span></td>
                        <td>{b.document?.department||b.data?.department||"—"}</td>
                        <td>{b.document?.uploadedBy?.name||b.data?.uploadedBy||"—"}</td>
                        <td className="hash-cell mono">{b.data?.fileHash?b.data.fileHash.slice(0,14)+"…":"—"}</td>
                        <td className="hash-cell mono">{b.hash?b.hash.slice(0,14)+"…":"—"}</td>
                        <td>{b.timestamp?new Date(Number(b.timestamp)).toLocaleDateString("en-IN"):"—"}</td>
                        <td><span className={`sigpill ${b.signatureValid===true?"valid":b.signatureValid===false?"invalid":"na"}`}>
                          {b.signatureValid===true?"✔":b.signatureValid===false?"✖":"—"}
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {chain.length===0 && <div className="empty">Loading chain… or no blocks yet.</div>}
              </div>
            </div>

            {/* Block Detail Modal */}
            {selectedBlock && (
              <div className="modal-bg" onClick={() => setSelectedBlock(null)}>
                <div className="modal wide" onClick={e=>e.stopPropagation()}>
                  <div className="modal-hdr">
                    <h3>Block #{selectedBlock.index} — Full Details</h3>
                    <button onClick={() => setSelectedBlock(null)}>✕</button>
                  </div>
                  <div className="modal-body">
                    <div className="modal-sec">BLOCK HEADER</div>
                    {[
                      ["Index",         `#${selectedBlock.index}`],
                      ["Hash",          selectedBlock.hash],
                      ["Previous Hash", selectedBlock.previousHash],
                      ["Timestamp",     selectedBlock.timestamp ? new Date(Number(selectedBlock.timestamp)).toLocaleString("en-IN") : "—"],
                      ["Signature",     selectedBlock.signature ? selectedBlock.signature.slice(0,48)+"…" : "None"],
                      ["Public Key",    selectedBlock.publicKey ? selectedBlock.publicKey.slice(0,48)+"…" : "None"],
                      ["Sig Valid",     selectedBlock.signatureValid===true?"✔ Valid":selectedBlock.signatureValid===false?"✖ Invalid":"N/A"],
                    ].map(([k,v]) => <div key={k} className="drow"><span className="dk">{k}</span><span className="dv mono">{String(v)}</span></div>)}

                    {selectedBlock.document && (<>
                      <div className="modal-sec" style={{marginTop:16}}>DOCUMENT RECORD</div>
                      {[
                        ["Title",         selectedBlock.document.title],
                        ["Type",          selectedBlock.document.docType],
                        ["Department",    selectedBlock.document.department||"—"],
                        ["Academic Year", selectedBlock.document.academicYear||"—"],
                        ["Semester",      selectedBlock.document.semester||"—"],
                        ["Roll Number",   selectedBlock.document.rollNumber||"—"],
                        ["File Name",     selectedBlock.document.fileName],
                        ["File Hash",     selectedBlock.document.fileHash],
                        ["File Size",     selectedBlock.document.fileSize ? `${(selectedBlock.document.fileSize/1024).toFixed(1)} KB` : "—"],
                        ["Uploaded By",   selectedBlock.document.uploadedBy?.name||"—"],
                        ["Role",          selectedBlock.document.uploadedBy?.role||"—"],
                        ["Status",        selectedBlock.document.status||"—"],
                        ["Filed On",      selectedBlock.document.createdAt ? new Date(selectedBlock.document.createdAt).toLocaleString("en-IN") : "—"],
                      ].map(([k,v]) => <div key={k} className="drow"><span className="dk">{k}</span><span className="dv mono">{String(v)}</span></div>)}
                    </>)}

                    {!selectedBlock.document && selectedBlock.data && (<>
                      <div className="modal-sec" style={{marginTop:16}}>BLOCK DATA</div>
                      {Object.entries(selectedBlock.data).map(([k,v]) => (
                        <div key={k} className="drow"><span className="dk">{k}</span><span className="dv mono">{String(v)}</span></div>
                      ))}
                    </>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ RECORDS ═══════════ */}
        {tab === "records" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>Document Records</h1><p>{docTotal} total documents filed on blockchain</p></div>
              <button className="btn btn-ghost btn-sm" onClick={() => fetchDocuments(docPage)}>↺ Refresh</button>
            </div>

            <div className="filter-bar">
              <select value={docFilter.docType} onChange={e => setDocFilter(f=>({...f,docType:e.target.value}))}>
                <option value="">All Types</option>
                {docTypes.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <select value={docFilter.department} onChange={e => setDocFilter(f=>({...f,department:e.target.value}))}>
                <option value="">All Departments</option>
                {depts.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={docFilter.status} onChange={e => setDocFilter(f=>({...f,status:e.target.value}))}>
                <option value="">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="REVOKED">Revoked</option>
              </select>
              <button className="btn btn-ghost btn-sm" onClick={() => fetchDocuments(1)}>Filter</button>
            </div>

            <div className="card" style={{padding:0}}>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>Block#</th><th>Title</th><th>Type</th><th>Department</th>
                    <th>Roll No</th><th>Uploaded By</th><th>Date</th><th>Sig</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {documents.map((d:any) => (
                      <tr key={d._id} className="clickable-row" onClick={() => setSelectedDoc(d)}>
                        <td className="mono">#{d.blockIndex}</td>
                        <td><strong>{d.title||d.fileName}</strong></td>
                        <td><span className="tag">{d.docType}</span></td>
                        <td>{d.department||"—"}</td>
                        <td>{d.rollNumber||"—"}</td>
                        <td>{d.uploadedBy?.name||"—"}</td>
                        <td>{d.createdAt?new Date(d.createdAt).toLocaleDateString("en-IN"):"—"}</td>
                        <td><span className={`sigpill ${d.signatureValid?"valid":"na"}`}>{d.signatureValid?"✔":"—"}</span></td>
                        <td><span className={`stag ${d.status?.toLowerCase()}`}>{d.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {documents.length===0 && <div className="empty">No records found. Upload documents to get started.</div>}
              </div>
              {Math.ceil(docTotal/20)>1 && (
                <div className="pagination">
                  {Array.from({length:Math.ceil(docTotal/20)},(_,i)=>(
                    <button key={i} className={`pg-btn ${docPage===i+1?"active":""}`}
                      onClick={() => fetchDocuments(i+1)}>{i+1}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Document Detail Modal */}
            {selectedDoc && (
              <div className="modal-bg" onClick={() => setSelectedDoc(null)}>
                <div className="modal" onClick={e=>e.stopPropagation()}>
                  <div className="modal-hdr">
                    <h3>Document Details</h3>
                    <button onClick={() => setSelectedDoc(null)}>✕</button>
                  </div>
                  <div className="modal-body">
                    {[
                      ["Title",         selectedDoc.title||selectedDoc.fileName],
                      ["Type",          selectedDoc.docType],
                      ["Description",   selectedDoc.description||"—"],
                      ["Department",    selectedDoc.department||"—"],
                      ["Academic Year", selectedDoc.academicYear||"—"],
                      ["Semester",      selectedDoc.semester||"—"],
                      ["Roll Number",   selectedDoc.rollNumber||"—"],
                      ["File Name",     selectedDoc.fileName],
                      ["File Hash",     selectedDoc.fileHash],
                      ["File Size",     selectedDoc.fileSize ? `${(selectedDoc.fileSize/1024).toFixed(1)} KB` : "—"],
                      ["Block Index",   `#${selectedDoc.blockIndex}`],
                      ["Block Hash",    selectedDoc.blockHash||"—"],
                      ["Uploaded By",   selectedDoc.uploadedBy?.name||"—"],
                      ["ECDSA Sig",     selectedDoc.signatureValid?"✔ Valid":"—"],
                      ["Status",        selectedDoc.status||"—"],
                      ["Filed On",      selectedDoc.createdAt ? new Date(selectedDoc.createdAt).toLocaleString("en-IN") : "—"],
                    ].map(([k,v]) => <div key={k} className="drow"><span className="dk">{k}</span><span className="dv mono">{String(v)}</span></div>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ VERIFICATIONS ═══════════ */}
        {tab === "verifications" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>Verification Log</h1><p>{verifTotal} total verifications performed</p></div>
              <button className="btn btn-ghost btn-sm" onClick={() => fetchVerifications(1)}>↺ Refresh</button>
            </div>
            <div className="card" style={{padding:0}}>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>Date & Time</th><th>Verified By</th><th>Role</th>
                    <th>File Name</th><th>File Hash</th><th>Block #</th><th>Result</th>
                  </tr></thead>
                  <tbody>
                    {verifs.map((v:any,i:number) => (
                      <tr key={i}>
                        <td>{fmt(v.timestamp)}</td>
                        <td>{v.username||"—"}</td>
                        <td><span className="role-tag" style={{color:roleColor(v.role)}}>{v.role}</span></td>
                        <td>{v.fileName||"—"}</td>
                        <td className="hash-cell mono">{v.fileHash?v.fileHash.slice(0,16)+"…":"—"}</td>
                        <td className="mono">{v.blockIndex!=null?`#${v.blockIndex}`:"—"}</td>
                        <td><span className={`stag ${v.action==="VERIFY"?"active":"revoked"}`}>
                          {v.action==="VERIFY"?"✔ VERIFIED":"✖ NOT FOUND"}
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {verifs.length===0 && <div className="empty">No verifications yet. Use Upload/Verify to verify documents.</div>}
              </div>
              {Math.ceil(verifTotal/20)>1 && (
                <div className="pagination">
                  {Array.from({length:Math.ceil(verifTotal/20)},(_,i)=>(
                    <button key={i} className={`pg-btn ${verifPage===i+1?"active":""}`}
                      onClick={() => fetchVerifications(i+1)}>{i+1}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ UPLOAD / VERIFY ═══════════ */}
        {tab === "upload" && (
          <div className="page">
            <div className="page-hdr"><div><h1>Upload & Verify</h1><p>File documents on blockchain or verify integrity</p></div></div>
            <div className="two-col">

              {canUpload && (
                <div className="card">
                  <div className="card-lbl">⬆ UPLOAD DOCUMENT</div>
                  <div className="fg"><label>Title *</label>
                    <input value={uploadForm.title} onChange={e=>setUploadForm(f=>({...f,title:e.target.value}))} placeholder="e.g. B.Tech Degree Certificate" />
                  </div>
                  <div className="fg"><label>Document Type *</label>
                    <select value={uploadForm.docType} onChange={e=>setUploadForm(f=>({...f,docType:e.target.value}))}>
                      <option value="">Select type</option>
                      {docTypes.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="frow">
                    <div className="fg flex1"><label>Department</label>
                      <select value={uploadForm.department} onChange={e=>setUploadForm(f=>({...f,department:e.target.value}))}>
                        <option value="">Select</option>
                        {depts.map(d=><option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="fg flex1"><label>Academic Year</label>
                      <input value={uploadForm.academicYear} onChange={e=>setUploadForm(f=>({...f,academicYear:e.target.value}))} placeholder="2023-24" />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg flex1"><label>Roll Number</label>
                      <input value={uploadForm.rollNumber} onChange={e=>setUploadForm(f=>({...f,rollNumber:e.target.value}))} placeholder="20CS001" />
                    </div>
                    <div className="fg flex1"><label>Student Email</label>
                      <input value={uploadForm.studentEmail} onChange={e=>setUploadForm(f=>({...f,studentEmail:e.target.value}))} placeholder="student@svec.edu.in" />
                    </div>
                  </div>
                  <div className={`drop-zone ${uploadFile?"has-file":""}`}>
                    <input type="file" onChange={e=>{ if(e.target.files) setUploadFile(e.target.files[0]); }} />
                    <div className="dz-icon">{uploadFile?"📄":"📂"}</div>
                    <div>{uploadFile ? uploadFile.name : <><strong>Click to choose</strong> or drop file</>}</div>
                    {uploadFile && <div className="dz-size">{(uploadFile.size/1024).toFixed(1)} KB</div>}
                  </div>
                  <button className="btn btn-primary w-full" onClick={handleUpload} disabled={busy||!uploadFile}>
                    {busy?"Uploading…":"⬆ Upload & Sign on Blockchain"}
                  </button>
                  {uploadResult && (
                    <div className={`result-box ${uploadResult.ok?"ok":"err"}`}>
                      <strong>{uploadResult.ok?"✔ Filed on Blockchain":"✖ Failed"}</strong>
                      <div>{uploadResult.message}</div>
                      {uploadResult.ok && <>
                        <div className="hash-row">Block <span className="mono">#{uploadResult.blockIndex}</span></div>
                        <div className="hash-row">SHA-256 <span className="mono">{uploadResult.fileHash}</span></div>
                      </>}
                    </div>
                  )}
                </div>
              )}

              <div className="card">
                <div className="card-lbl">✔ VERIFY DOCUMENT</div>
                <p className="hint">Upload any file to check if it's on the blockchain and unmodified.</p>
                <div className={`drop-zone ${verifyFile?"has-file":""}`}>
                  <input type="file" onChange={e=>{ if(e.target.files){ setVerifyFile(e.target.files[0]); setVerifyResult(null); }}} />
                  <div className="dz-icon">{verifyFile?"📄":"📂"}</div>
                  <div>{verifyFile ? verifyFile.name : <><strong>Choose file</strong> to verify</>}</div>
                </div>
                <button className="btn btn-ghost w-full" onClick={handleVerify} disabled={busy||!verifyFile}>
                  {busy?"Verifying…":"✔ Verify File"}
                </button>
                {verifyResult && (
                  <div className={`result-box ${verifyResult.status==="VERIFIED"?"ok":verifyResult.status==="NOT_FOUND"?"err":"info"}`}>
                    <strong>{verifyResult.status==="VERIFIED"?"✔ VERIFIED — Integrity Intact":verifyResult.status==="NOT_FOUND"?"✖ NOT FOUND on Blockchain":verifyResult.status}</strong>
                    <div>{verifyResult.message}</div>
                    {verifyResult.document && (
                      <div style={{marginTop:12}}>
                        {[
                          ["Title",    verifyResult.document.title||verifyResult.document.fileName],
                          ["Type",     verifyResult.document.docType],
                          ["Filed by", verifyResult.document.uploadedBy?.name||verifyResult.document.uploadedBy],
                          ["Block #",  `#${verifyResult.blockIndex}`],
                          ["ECDSA",    verifyResult.signatureValid?"✔ Valid":"—"],
                        ].map(([k,v]) => <div key={k} className="drow" style={{borderColor:"rgba(255,255,255,.1)"}}>
                          <span className="dk">{k}</span><span className="dv mono">{String(v)}</span>
                        </div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ NETWORK ═══════════ */}
        {tab === "network" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>P2P Network</h1><p>Multi-node blockchain network status</p></div>
              <button className="btn btn-ghost btn-sm" onClick={fetchNetwork}>↺ Refresh</button>
            </div>
            <div className="stats-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
              {[
                { label:"Connected Peers", val:netInfo?.peers?.length??0 },
                { label:"Chain Length",    val:netInfo?.chainLength??stats?.chainBlocks??0 },
                { label:"This Node",       val:netInfo?.myUrl??"—" },
              ].map(c=>(
                <div key={c.label} className="stat-card accent-cyan">
                  <div className={`stat-val col-cyan`} style={{fontSize:typeof c.val==="string"?"16px":"32px"}}>{c.val}</div>
                  <div className="stat-label">{c.label}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-lbl">CONNECTED PEERS</div>
              {(netInfo?.peers||[]).length===0
                ? <div className="empty">No peers connected. Run node2 or node3 to add peers.</div>
                : (netInfo?.peers||[]).map((p:any) => (
                  <div key={p} className="peer-row">
                    <span className="pdot"></span>
                    <span className="peer-url">{p}</span>
                    <span className="peer-badge">● Online</span>
                  </div>
                ))}
            </div>
            {canAdmin && (
              <div className="card">
                <div className="card-lbl">ADD PEER / SYNC</div>
                <div className="frow">
                  <input value={peerInput} onChange={e=>setPeerInput(e.target.value)} placeholder="http://localhost:5001" className="flex1" />
                  <button className="btn btn-primary btn-sm" onClick={handleAddPeer} disabled={busy}>Add Peer</button>
                  <button className="btn btn-ghost btn-sm" onClick={async()=>{ setBusy(true); try{ const r=await axios.post(`${API}/network/sync`,{},H(token!)); setPeerMsg(r.data.message); fetchNetwork(); }catch(e:any){setPeerMsg(e.response?.data?.message||"Failed")}finally{setBusy(false)}}} disabled={busy}>↺ Sync</button>
                </div>
                {peerMsg && <div className="result-box info" style={{marginTop:12}}>{peerMsg}</div>}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ TAMPER ALERTS ═══════════ */}
        {tab === "tamper" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>Tamper Alerts</h1><p>Blockchain integrity violations detected</p></div>
              <div style={{display:"flex",gap:10}}>
                {canAdmin && <button className="btn btn-danger btn-sm" onClick={checkIntegrity} disabled={busy}>🛡 Run Check</button>}
                <button className="btn btn-ghost btn-sm" onClick={fetchTampers}>↺ Refresh</button>
              </div>
            </div>
            {integrityRes && (
              <div className={`integrity-box ${integrityRes.status==="SECURE"?"secure":"tampered"}`} style={{marginBottom:16}}>
                <span className="int-icon">{integrityRes.status==="SECURE"?"🛡":"⚠"}</span>
                <div><div className="int-title">{integrityRes.message}</div></div>
              </div>
            )}
            <div className="card" style={{padding:0}}>
              {tampers.length===0
                ? <div className="empty" style={{color:"var(--green)",padding:40}}>✔ No tampering detected — blockchain is secure</div>
                : <div className="tbl-wrap">
                    <table>
                      <thead><tr><th>Detected At</th><th>Block #</th><th>Detected By</th><th>Details</th></tr></thead>
                      <tbody>
                        {tampers.map((a:any,i:number) => (
                          <tr key={i} style={{color:"var(--red)"}}>
                            <td>{fmt(a.timestamp)}</td>
                            <td className="mono">{a.blockIndex!=null?`#${a.blockIndex}`:"—"}</td>
                            <td>{a.username||"SYSTEM"}</td>
                            <td>{a.details||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
            </div>
          </div>
        )}

        {/* ═══════════ AUDIT LOGS ═══════════ */}
        {tab === "auditlogs" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>Audit Trail</h1><p>{auditTotal} total log entries</p></div>
              <button className="btn btn-ghost btn-sm" onClick={() => fetchAudit(1)}>↺ Refresh</button>
            </div>
            <div className="filter-bar">
              <input value={auditSearch} onChange={e=>setAuditSearch(e.target.value)} placeholder="Search by username…" />
              <button className="btn btn-ghost btn-sm" onClick={() => fetchAudit(1)}>Search</button>
            </div>
            <div className="card" style={{padding:0}}>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>Timestamp</th><th>User</th><th>Role</th><th>Action</th>
                    <th>File</th><th>Block #</th><th>Details</th>
                  </tr></thead>
                  <tbody>
                    {auditLogs.map((l:any,i:number) => (
                      <tr key={i}>
                        <td>{fmt(l.timestamp)}</td>
                        <td>{l.username||"—"}</td>
                        <td><span className="role-tag" style={{color:roleColor(l.role)}}>{l.role||"—"}</span></td>
                        <td><span className={`atag atag-${l.action?.toLowerCase()}`}>{l.action}</span></td>
                        <td className="mono" style={{maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.fileName||"—"}</td>
                        <td className="mono">{l.blockIndex!=null?`#${l.blockIndex}`:"—"}</td>
                        <td style={{color:"var(--muted)",fontSize:12}}>{l.details||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {auditLogs.length===0 && <div className="empty">No audit entries</div>}
              </div>
              {Math.ceil(auditTotal/25)>1 && (
                <div className="pagination">
                  {Array.from({length:Math.ceil(auditTotal/25)},(_,i)=>(
                    <button key={i} className={`pg-btn ${auditPage===i+1?"active":""}`}
                      onClick={() => fetchAudit(i+1)}>{i+1}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ USERS ═══════════ */}
        {tab === "users" && (
          <div className="page">
            <div className="page-hdr">
              <div><h1>User Management</h1>
                <p>You can create: {creatable.join(", ")||"none"}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={fetchUsers}>↺ Refresh</button>
            </div>

            {creatable.length>0 && (
              <div className="card">
                <div className="card-lbl">➕ CREATE USER</div>
                <div className="frow">
                  <div className="fg flex1"><label>Full Name *</label>
                    <input value={userForm.name} onChange={e=>setUserForm(f=>({...f,name:e.target.value}))} placeholder="Dr. John Smith" />
                  </div>
                  <div className="fg flex1"><label>Email *</label>
                    <input type="email" value={userForm.email} onChange={e=>setUserForm(f=>({...f,email:e.target.value}))} placeholder="john@svec.edu.in" />
                  </div>
                </div>
                <div className="frow">
                  <div className="fg flex1"><label>Password *</label>
                    <input type="password" value={userForm.password} onChange={e=>setUserForm(f=>({...f,password:e.target.value}))} placeholder="Min 6 chars" />
                  </div>
                  <div className="fg"><label>Role *</label>
                    <select value={userForm.role} onChange={e=>setUserForm(f=>({...f,role:e.target.value}))}>
                      {creatable.map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>Department</label>
                    <select value={userForm.department} onChange={e=>setUserForm(f=>({...f,department:e.target.value}))}>
                      <option value="">Select</option>
                      {depts.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div className="frow">
                  <div className="fg flex1"><label>Phone</label>
                    <input value={userForm.phone} onChange={e=>setUserForm(f=>({...f,phone:e.target.value}))} placeholder="9999999999" />
                  </div>
                  <div className="fg flex1"><label>Roll/Employee ID</label>
                    <input value={userForm.studentId} onChange={e=>setUserForm(f=>({...f,studentId:e.target.value}))} placeholder="20CS001" />
                  </div>
                  <div className="fg flex1"><label>Designation</label>
                    <input value={userForm.designation} onChange={e=>setUserForm(f=>({...f,designation:e.target.value}))} placeholder="Assistant Professor" />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleCreateUser} disabled={busy}>
                  {busy?"Creating…":"Create User & Send Welcome Email"}
                </button>
                {userMsg && <div className={`result-box ${userMsg.startsWith("✅")?"ok":"err"}`} style={{marginTop:12}}>{userMsg}</div>}
              </div>
            )}

            <div className="card" style={{padding:0}}>
              <div className="card-lbl" style={{padding:"16px 20px 0"}}>ALL USERS ({users.length})</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>Name</th><th>Email</th><th>Role</th><th>Department</th>
                    <th>ID</th><th>Phone</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {users.map((u:any) => (
                      <tr key={u._id}>
                        <td><strong>{u.name}</strong></td>
                        <td className="mono" style={{fontSize:12}}>{u.email}</td>
                        <td><span className="role-tag" style={{color:roleColor(u.role)}}>{u.role}</span></td>
                        <td>{u.department||"—"}</td>
                        <td className="mono">{u.studentId||u.employeeId||"—"}</td>
                        <td>{u.phone||"—"}</td>
                        <td><span className={`stag ${u.isActive?"active":"revoked"}`}>{u.isActive?"Active":"Inactive"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length===0 && <div className="empty">No users found.</div>}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}