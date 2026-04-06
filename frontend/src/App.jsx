import { useState, useRef, useEffect, useCallback } from "react"

const API_BASE = "http://localhost:8000"

// Converts draw.io XML to a simple SVG preview using mxGraph via CDN
function DiagramViewer({ xml, onXmlChange }) {
  const iframeRef = useRef(null)
  const [error, setError] = useState(null)
  const readyRef = useRef(false)
  const latestXmlRef = useRef(xml || "")

  const sendLoad = useCallback((diagramXml) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow || !diagramXml) return

    iframe.contentWindow.postMessage(
      JSON.stringify({ action: "load", xml: diagramXml }),
      "http://localhost:8080"
    )
  }, [])

  useEffect(() => {
    latestXmlRef.current = xml || ""
    if (readyRef.current && xml) {
      sendLoad(xml)
    }
  }, [xml, sendLoad])

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== "http://localhost:8080") return

      let msg = event.data
      if (typeof msg === "string") {
        try {
          msg = JSON.parse(msg)
        } catch {
          return
        }
      }

      if (msg?.event === "init") {
        readyRef.current = true
        if (latestXmlRef.current) {
          sendLoad(latestXmlRef.current)
        }
      } else if (msg?.event === "save" || msg?.event === "autosave") {
        if (msg.xml && msg.xml !== latestXmlRef.current) {
          latestXmlRef.current = msg.xml
          onXmlChange?.(msg.xml)
        }
      } else if (msg?.event === "exit") {
        // No-op: keep the embedded editor open inside the app
      } else if (msg?.event === "error") {
        setError(msg.message || "draw.io embed reported an error")
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [onXmlChange, sendLoad])

  if (!xml) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        color: "#444", background: "#fafafa", gap: "12px"
      }}>
        <div style={{ fontSize: "48px", opacity: 0.2 }}>◈</div>
        <div style={{ fontSize: "14px", color: "#888" }}>No diagram yet — ask AI to generate one</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, position: "relative", background: "#fff" }}>
      <iframe
        ref={iframeRef}
        title="draw.io editor"
        src="http://localhost:8080/?embed=1&ui=atlas&spin=1&proto=json&libraries=1&saveAndExit=0&noSaveBtn=0&noExitBtn=1&modified=0"
        style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
      />
      {error && (
        <div style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          padding: "10px 12px",
          borderRadius: 8,
          background: "#2a1215",
          color: "#ffb4b4",
          border: "1px solid #5c2328",
          fontSize: 12
        }}>
          {error}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I can generate draw.io diagrams from natural language, edit existing ones, or extract diagrams from your PDF/PPT files. Try: \"Create a flowchart for user authentication\" or upload a file."
    }
  ])
  const [input, setInput] = useState("")
  const [currentXml, setCurrentXml] = useState("")
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [activeTab, setActiveTab] = useState("preview") // preview | xml
  const fileInputRef = useRef(null)
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const addMessage = (role, content, extra = {}) => {
    setMessages(prev => [...prev, { role, content, ...extra }])
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput("")
    addMessage("user", text)
    setLoading(true)
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, current_xml: currentXml, history })
      })
      const data = await res.json()
      addMessage("assistant", data.message, { hasDiagram: data.has_diagram })
      if (data.xml) setCurrentXml(data.xml)
    } catch {
      addMessage("assistant", "Error connecting to backend. Make sure it's running on port 8000.")
    }
    setLoading(false)
  }

  const handleFile = async (file) => {
    if (!file) return
    const ext = file.name.toLowerCase()
    if (!ext.endsWith(".pdf") && !ext.endsWith(".pptx")) {
      addMessage("assistant", "Please upload a PDF or PowerPoint (.pptx) file.")
      return
    }
    addMessage("user", `📎 Uploaded: ${file.name}`)
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData })
      const data = await res.json()
      addMessage("assistant", `Generated diagram from ${file.name}!`, { hasDiagram: true })
      if (data.xml) setCurrentXml(data.xml)
    } catch {
      addMessage("assistant", "Error processing file. Make sure the backend is running.")
    }
    setLoading(false)
  }

  const exportXml = () => {
    if (!currentXml) return
    const blob = new Blob([currentXml], { type: "application/xml" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "diagram.xml"
    a.click()
  }

  const openInDrawio = () => {
    if (!currentXml) return
    const encoded = encodeURIComponent(currentXml)
    window.open(`http://localhost:8080/?embed=1&ui=atlas&spin=1&proto=json&libraries=1&src=data:text/xml,${encoded}`, "_blank")
  }

  const copyXml = () => {
    if (!currentXml) return
    navigator.clipboard.writeText(currentXml)
  }

  const quickPrompts = [
    "Flowchart for user login",
    "System architecture for e-commerce",
    "Database schema for a blog",
    "Sequence diagram for API calls"
  ]

  return (
    <div style={{
      display: "flex", height: "100vh",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: "#0f0f13", color: "#e8e6f0", overflow: "hidden"
    }}>
      {/* Chat panel */}
      <div style={{
        width: "380px", minWidth: "380px", display: "flex",
        flexDirection: "column", borderRight: "1px solid #2a2a3a", background: "#13131a"
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 20px", borderBottom: "1px solid #2a2a3a",
          display: "flex", alignItems: "center", gap: "10px"
        }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: "linear-gradient(135deg, #6c63ff, #a855f7)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px"
          }}>◈</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "15px", letterSpacing: "-0.02em" }}>DiagramAI</div>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>Powered by Claude + draw.io</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px",
          display: "flex", flexDirection: "column", gap: "12px"
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "88%", padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                background: msg.role === "user" ? "linear-gradient(135deg, #6c63ff, #a855f7)" : "#1e1e2e",
                border: msg.role === "assistant" ? "1px solid #2a2a3a" : "none",
                fontSize: "13.5px", lineHeight: "1.55",
                color: msg.role === "user" ? "#fff" : "#d4d2e8"
              }}>
                {msg.content}
                {msg.hasDiagram && (
                  <div style={{
                    marginTop: "8px", padding: "4px 8px", background: "#0f0f13",
                    borderRadius: "6px", fontSize: "11px", color: "#a855f7", display: "inline-block"
                  }}>◈ Diagram loaded →</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex" }}>
              <div style={{
                padding: "10px 14px", borderRadius: "14px 14px 14px 2px",
                background: "#1e1e2e", border: "1px solid #2a2a3a", fontSize: "13px", color: "#888"
              }}>Generating diagram...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {quickPrompts.map(p => (
              <button key={p} onClick={() => setInput(p)} style={{
                padding: "5px 10px", borderRadius: "20px", fontSize: "11px",
                background: "#1e1e2e", border: "1px solid #2a2a3a", color: "#a0a0c0", cursor: "pointer"
              }}>{p}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #2a2a3a" }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `1px dashed ${dragOver ? "#6c63ff" : "#2a2a3a"}`,
              borderRadius: "8px", padding: "8px 12px", display: "flex",
              alignItems: "center", gap: "8px", cursor: "pointer",
              marginBottom: "10px", fontSize: "12px", color: "#666",
              background: dragOver ? "#1a1a2e" : "transparent"
            }}
          >
            <span>📎</span> Drop PDF or PPTX here, or click to upload
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.pptx" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])} />
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Describe a diagram or ask to edit..."
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "10px",
                background: "#1e1e2e", border: "1px solid #2a2a3a",
                color: "#e8e6f0", fontSize: "13.5px", outline: "none"
              }}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
              padding: "10px 16px", borderRadius: "10px", border: "none", color: "#fff",
              background: loading || !input.trim() ? "#2a2a3a" : "linear-gradient(135deg, #6c63ff, #a855f7)",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              fontSize: "14px", fontWeight: 600
            }}>→</button>
          </div>
        </div>
      </div>

      {/* Right: Diagram viewer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Toolbar */}
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid #2a2a3a",
          display: "flex", alignItems: "center", gap: "8px",
          background: "#13131a", fontSize: "12px"
        }}>
          {/* Tabs */}
          {["preview", "xml"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "4px 12px", borderRadius: "6px", fontSize: "12px",
              background: activeTab === tab ? "#2a2a3a" : "transparent",
              border: activeTab === tab ? "1px solid #3a3a4a" : "1px solid transparent",
              color: activeTab === tab ? "#e8e6f0" : "#666", cursor: "pointer",
              textTransform: "capitalize"
            }}>{tab === "preview" ? "◈ Preview" : "</> XML"}</button>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            {currentXml && (
              <>
                <button onClick={openInDrawio} style={btnStyle} title="Open in draw.io desktop">
                  Open in draw.io ↗
                </button>
                <button onClick={copyXml} style={btnStyle}>Copy XML</button>
                <button onClick={exportXml} style={btnStyle}>Download XML</button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {activeTab === "preview" ? (
            <DiagramViewer xml={currentXml} onXmlChange={setCurrentXml} />
          ) : (
            <div style={{ flex: 1, overflow: "auto", background: "#0d0d10" }}>
              {currentXml ? (
                <pre style={{
                  padding: "20px", margin: 0, fontSize: "12px", lineHeight: "1.6",
                  color: "#a0d0ff", fontFamily: "'Fira Code', 'Consolas', monospace",
                  whiteSpace: "pre-wrap", wordBreak: "break-all"
                }}>{currentXml}</pre>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: "100%", color: "#444", fontSize: "13px"
                }}>No XML yet</div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
      `}</style>
    </div>
  )
}

const btnStyle = {
  padding: "4px 10px", borderRadius: "6px",
  background: "#1e1e2e", border: "1px solid #2a2a3a",
  color: "#a0a0c0", cursor: "pointer", fontSize: "11px", fontWeight: 600
}
