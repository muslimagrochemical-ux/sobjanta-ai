import React, { useState } from "react";

export default function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages([...messages, input]);
    setInput("");
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>Sobjanta AI</h1>

      <div
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          minHeight: "200px",
          marginBottom: "10px"
        }}
      >
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type message..."
        style={{ padding: "8px", width: "70%" }}
      />

      <button
        onClick={sendMessage}
        style={{ padding: "8px 15px", marginLeft: "10px" }}
      >
        Send
      </button>
    </div>
  );
}
