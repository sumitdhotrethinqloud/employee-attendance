import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

const ConfigUI = () => {
  const [boards, setBoards] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [saving, setSaving] = useState(false);

  const fields = [
    "employee_id",
    "employee_name",
    "date",
    "login_time",
    "logout_time",
    "entry_type",
    "location",
    "logout_location",
  ];

  // Load context and boards list
  useEffect(() => {
    monday.listen("context", (res) => {
      console.log("Settings view context:", res.data);
    });

    monday.api(`query { boards (limit: 50) { id name } }`).then((res) => {
      setBoards(res.data.boards);
    });

    // Load existing config if present
    monday.storage.get("config").then((res) => {
      if (res.data) {
        setSelectedBoard(res.data.board_id);
        const newMapping = { ...res.data };
        delete newMapping.board_id;
        setColumnMapping(newMapping);
      }
    });
  }, []);

  // Load columns for the selected board
  useEffect(() => {
    if (!selectedBoard) return;
    monday.api(`query {
      boards(ids: ${selectedBoard}) {
        columns {
          id
          title
          type
        }
      }
    }`).then((res) => {
      setColumns(res.data.boards[0]?.columns || []);
    });
  }, [selectedBoard]);

  const handleSave = async () => {
    setSaving(true);
    await monday.storage.set("config", {
      board_id: selectedBoard,
      ...columnMapping,
    });
    setSaving(false);
    alert("Configuration saved successfully!");
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Configure Employee Attendance App</h2>

      <label>Select a board:</label>
      <select
        value={selectedBoard || ""}
        onChange={(e) => setSelectedBoard(Number(e.target.value))}
        style={{ marginBottom: 20, display: "block", padding: 8 }}
      >
        <option value="">-- Select Board --</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      {selectedBoard && fields.map((field) => (
        <div key={field} style={{ marginBottom: 10 }}>
          <label>{field.replace(/_/g, " ")}:</label>
          <select
            value={columnMapping[field] || ""}
            onChange={(e) =>
              setColumnMapping((prev) => ({
                ...prev,
                [field]: e.target.value,
              }))
            }
            style={{ marginLeft: 8, padding: 6 }}
          >
            <option value="">-- Select Column --</option>
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title} ({col.type})
              </option>
            ))}
          </select>
        </div>
      ))}

      {selectedBoard && (
        <button onClick={handleSave} disabled={saving} style={{ marginTop: 20, padding: "10px 20px" }}>
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      )}
    </div>
  );
};

export default ConfigUI;
