import React, { useState, useEffect } from "react";
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

function App() {
  const [config, setConfig] = useState(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [location, setLocation] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const [logoutDisabled, setLogoutDisabled] = useState(false);

  const addLog = (msg) => {
    setLogMessages((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await monday.storage.get("config");
        if (res?.data) {
          setConfig(res.data);
          addLog("Loaded config: " + JSON.stringify(res.data));
        } else {
          addLog("No config found. Please set it up in app settings.");
        }
      } catch (err) {
        addLog("Error loading config: " + err.message);
      }
    };
    loadConfig();
  }, []);

  const mondayGraphQL = async (query, variables) => {
    return monday.api(query, { variables });
  };

  const fetchTodayAttendanceItem = async (empId, date) => {
    if (!config) return null;
    const query = `
      query ($boardId: ID!, $columnId: String!, $employeeIdVal: String!, $dateColId: String!, $dateVal: String!) {
        items_page_by_column_values(
          board_id: $boardId,
          columns: [
            { column_id: $columnId, column_values: [$employeeIdVal] },
            { column_id: $dateColId, column_values: [$dateVal] }
          ],
          limit: 50
        ) {
          items {
            id
            name
            column_values(ids: [$columnId, $dateColId]) {
              id
              text
            }
          }
        }
      }
    `;

    const variables = {
      boardId: config.board_id,
      columnId: config.employee_id,
      employeeIdVal: empId,
      dateColId: config.date,
      dateVal: date,
    };

    const res = await mondayGraphQL(query, variables);
    if (res.errors) {
      addLog("Error fetching items: " + JSON.stringify(res.errors));
      return null;
    }

    return res.data.items_page_by_column_values.items.find(item => {
      const dateVal = item.column_values.find(cv => cv.id === config.date)?.text || "";
      const empVal = item.column_values.find(cv => cv.id === config.employee_id)?.text || "";
      return dateVal === date && empVal === empId;
    }) || null;
  };

  const updateAttendanceItem = async (itemId, attendanceData) => {
    if (!config) return false;
    const updateColumns = {
      [config.employee_id]: attendanceData.employeeId,
      [config.employee_name]: attendanceData.employeeName || "",
      [config.date]: attendanceData.date,
      [config.entry_type]: attendanceData.action,
    };

    if (attendanceData.action === "Login") {
      updateColumns[config.login_time] = attendanceData.time;
      if (attendanceData.location) updateColumns[config.location] = attendanceData.location;
    } else if (attendanceData.action === "Logout") {
      updateColumns[config.logout_time] = attendanceData.time;
      if (attendanceData.location) updateColumns[config.logout_location] = attendanceData.location;
    }

    const mutation = `
      mutation ($itemId: ID!, $columnVals: JSON!) {
        change_multiple_column_values(item_id: $itemId, board_id: ${config.board_id}, column_values: $columnVals) {
          id
        }
      }
    `;

    const response = await mondayGraphQL(mutation, {
      itemId: String(itemId),
      columnVals: JSON.stringify(updateColumns),
    });

    if (response.errors) {
      addLog("Error updating item: " + JSON.stringify(response.errors));
      return false;
    }
    addLog(`Attendance item updated successfully (ID: ${itemId}).`);
    return true;
  };

  const createAttendanceItem = async (attendanceData) => {
    if (!config) return false;
    const column_values = {
      [config.employee_id]: attendanceData.employeeId,
      [config.employee_name]: attendanceData.employeeName || "",
      [config.date]: attendanceData.date,
      [config.entry_type]: attendanceData.action,
    };

    if (attendanceData.action === "Login") {
      column_values[config.login_time] = attendanceData.time;
      if (attendanceData.location) column_values[config.location] = attendanceData.location;
    } else if (attendanceData.action === "Logout") {
      column_values[config.logout_time] = attendanceData.time;
      if (attendanceData.location) column_values[config.logout_location] = attendanceData.location;
    }

    const mutation = `
      mutation ($boardId: ID!, $itemName: String!, $columnVals: JSON!) {
        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnVals) {
          id
        }
      }
    `;

    const itemName = `${attendanceData.employeeId} - ${attendanceData.date}`;

    const response = await mondayGraphQL(mutation, {
      boardId: config.board_id,
      itemName,
      columnVals: JSON.stringify(column_values),
    });

    if (response.errors) {
      addLog("Error creating item: " + JSON.stringify(response.errors));
      return false;
    }
    addLog("New attendance item created successfully.");
    return true;
  };

  const sendToMonday = async (attendanceData) => {
    if (!config) return;
    setLoading(true);
    addLog("Checking existing attendance record...");

    const existingItem = await fetchTodayAttendanceItem(attendanceData.employeeId, attendanceData.date);

    let success;
    if (existingItem) {
      addLog(`Updating existing attendance item (ID: ${existingItem.id})...`);
      success = await updateAttendanceItem(existingItem.id, attendanceData);
    } else {
      addLog("Creating new attendance item...");
      success = await createAttendanceItem(attendanceData);
    }

    setLoading(false);
    return success;
  };

  const getLocation = (callback) => {
    if (!navigator.geolocation) {
      addLog("Geolocation not supported by this browser.");
      callback(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        callback({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          address: "unknown",
        });
      },
      (error) => {
        addLog("Error getting location: " + error.message);
        callback(null);
      }
    );
  };

  const checkAttendanceToday = async (empId) => {
    if (!config) return;
    const today = new Date().toISOString().split("T")[0];
    const existingItem = await fetchTodayAttendanceItem(empId, today);

    if (!existingItem) {
      setLoginDisabled(false);
      setLogoutDisabled(false);
      addLog("No attendance record found for today.");
      return;
    }

    const query = `
      query ($itemId: [ID!]!) {
        items(ids: $itemId) {
          id
          column_values(ids: ["${config.login_time}", "${config.logout_time}"]) {
            id
            text
          }
        }
      }
    `;

    const res = await mondayGraphQL(query, { itemId: String(existingItem.id) });
    const cols = res.data.items[0]?.column_values || [];
    const loginTimeStr = cols.find((c) => c.id === config.login_time)?.text || "";
    const logoutTimeStr = cols.find((c) => c.id === config.logout_time)?.text || "";

    setLoginDisabled(!!loginTimeStr);
    setLogoutDisabled(!!logoutTimeStr);

    addLog(`Login time: ${loginTimeStr || "not recorded"}, Logout time: ${logoutTimeStr || "not recorded"}`);
  };

  const handleAttendance = (actionType) => {
    if (!employeeName || !employeeId) {
      alert("Please enter both Employee Name and Employee ID.");
      return;
    }

    const now = new Date();
    getLocation(async (loc) => {
      setLocation(loc);
      const attendanceData = {
        employeeName,
        employeeId,
        date: now.toISOString().split("T")[0],
        time: now.toLocaleTimeString("en-GB", { hour12: false }),
        action: actionType,
        location: loc,
      };

      addLog(`Prepared attendance data: ${JSON.stringify(attendanceData)}`);
      const success = await sendToMonday(attendanceData);

      if (success) {
        addLog(`${actionType} recorded for Employee ID: ${employeeId}`);
        await checkAttendanceToday(employeeId);
      } else {
        addLog(`Failed to record ${actionType} for Employee ID: ${employeeId}`);
      }
    });
  };

  useEffect(() => {
    if (employeeId.trim()) {
      checkAttendanceToday(employeeId.trim());
    } else {
      setLoginDisabled(false);
      setLogoutDisabled(false);
    }
  }, [employeeId]);

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Employee Attendance</h1>
      <input
        disabled={loading}
        type="text"
        placeholder="Employee Name"
        value={employeeName}
        onChange={(e) => setEmployeeName(e.target.value)}
        style={{ marginBottom: 8, padding: 8, width: 250 }}
      />
      <input
        disabled={loading}
        type="text"
        placeholder="Employee ID"
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        style={{ marginBottom: 16, padding: 8, width: 250 }}
      />
      <div>
        {!config ? (
          <p>Please complete app setup in the settings view.</p>
        ) : (
          <>
            <button
              disabled={loading || loginDisabled}
              onClick={() => handleAttendance("Login")}
              style={{ marginRight: 10, padding: 10, width: 100 }}
              title={loginDisabled ? "Already logged in today" : ""}
            >
              Login
            </button>
            <button
              disabled={loading || logoutDisabled}
              onClick={() => handleAttendance("Logout")}
              style={{ padding: 10, width: 100 }}
              title={logoutDisabled ? "Already logged out today" : ""}
            >
              Logout
            </button>
          </>
        )}
      </div>

      {loading && <p>Processing...</p>}

      <div
        style={{
          marginTop: 20,
          maxHeight: 200,
          overflowY: "auto",
          background: "#f9f9f9",
          padding: 10,
          borderRadius: 4,
        }}
      >
        <h3>Activity Log</h3>
        <ul style={{ fontSize: 12, listStyleType: "none", paddingLeft: 0 }}>
          {logMessages.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
