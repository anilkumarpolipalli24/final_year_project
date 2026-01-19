import { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState("");
  const [status, setStatus] = useState("");
  const [chain, setChain] = useState<any[]>([]);
  const [showChain, setShowChain] = useState(false);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [chainMessage, setChainMessage] = useState<string | null>(null);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  // Upload file to blockchain
  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      setMessage(res.data.message);
      setChainStatus(null);
      setChainMessage(null);
      setHash(res.data.fileHash);
      setStatus("UPLOADED");
      // Clear previous blockchain integrity status after new upload
      setChainStatus(null);
      setChainMessage(null);
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    }
  };

  // Verify file integrity
  const handleVerify = async () => {
    if (!file) {
      alert("Please select a file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("http://localhost:5000/verify", formData);
      setMessage(res.data.message);
      setHash(res.data.fileHash);
      setStatus(res.data.status);
    } catch (err) {
      console.error(err);
      alert("Verification failed");
    }
  };

  // Fetch blockchain data
  const handleViewChain = async () => {
    try {
      const res = await axios.get("http://localhost:5000/chain");
      setChain(res.data);
      setShowChain(true);
    } catch (err) {
      console.error(err);
      alert("Failed to load blockchain");
    }
  };

  const checkBlockchainIntegrity = async () => {
    try {
      const res = await fetch("http://localhost:5000/validateChain");
      const data = await res.json();

      setChainStatus(data.status);
      setChainMessage(data.message);
    } catch (error) {
      setChainStatus("ERROR");
      setChainMessage("Unable to check blockchain integrity.");
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>🔐 Blockchain File Integrity Audit System</h1>

      <input type="file" onChange={handleFileChange} />
      <br /><br />

      <button onClick={handleUpload}>Upload to Blockchain</button>
      <button onClick={handleVerify} style={{ marginLeft: "10px" }}>
        Verify File
      </button>
      <button onClick={handleViewChain} style={{ marginLeft: "10px" }}>
        View Blockchain
      </button>
      <button onClick={checkBlockchainIntegrity}>
        Check Blockchain Integrity
      </button>

      <br /><br />

      {message && (
        <h3
          style={{
            color:
              status === "FAILED"
                ? "red"
                : status === "SUCCESS" || status === "ORIGINAL"
                  ? "green"
                  : status === "UPLOADED"
                    ? "blue"
                    : "black",
          }}
        >
          {message}
        </h3>
      )}

      {hash && <p><b>File Hash:</b> {hash}</p>}
      {status && (
        <p>
          <b>Status:</b>{" "}
          <span
            style={{
              color:
                status === "FAILED"
                  ? "red"
                  : status === "SUCCESS" || status === "ORIGINAL"
                    ? "green"
                    : status === "UPLOADED"
                      ? "blue"
                      : "black",
              fontWeight: "bold",
              fontSize: "18px",
            }}
          >
            {status === "SUCCESS" || status === "ORIGINAL" ? "✔ " : ""}
            {status === "FAILED" ? "❌ " : ""}
            {status}
          </span>
        </p>
      )}

      {chainStatus && (
        <div style={{ marginTop: "25px", fontWeight: "bold", textAlign: "center" }}>
          <div
            style={{
              color: chainStatus === "SECURE" ? "green" : "red",
              fontSize: "22px",
            }}
          >
            {chainStatus === "SECURE" ? "✔" : "❌"} Blockchain Status: {chainStatus}
          </div>

          <div style={{ marginTop: "8px", fontSize: "16px" }}>
            {chainMessage}
          </div>
        </div>
      )}

      {/* 🔽 PLACE THE BLOCKCHAIN TABLE CODE HERE 🔽 */}
      {showChain && (
        <div
          style={{
            maxHeight: "300px",
            overflowY: "auto",
            overflowX: "auto",
            border: "1px solid #ccc",
            padding: "10px",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <h2>📦 Blockchain Data</h2>

          <table
            border={1}
            cellPadding={8}
            style={{
              width: "100%",
              marginTop: "10px",
              borderCollapse: "collapse",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr>
                <th>Index</th>
                <th>File Name</th>
                <th>File Hash</th>
                <th>Timestamp</th>
                <th>Previous Hash</th>
                <th>Current Hash</th>
              </tr>
            </thead>

            <tbody>
              {chain.map((block, index) => (
                <tr key={index}>
                  <td>{block.index}</td>

                  <td>{block.data?.fileName || "Genesis Block"}</td>

                  <td style={{ wordBreak: "break-all", fontFamily: "monospace" }}>
                    {block.data?.fileHash || "—"}
                  </td>

                  {/* 🕒 TIMESTAMP COLUMN */}
                  <td>
                    {block.timestamp
                      ? new Date(parseInt(block.timestamp)).toLocaleString()
                      : "—"}
                  </td>

                  <td style={{ wordBreak: "break-all", fontFamily: "monospace" }}>
                    {block.previousHash}
                  </td>

                  <td style={{ wordBreak: "break-all", fontFamily: "monospace" }}>
                    {block.hash}
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>
      )}
    </div>
  );

}

export default App;
